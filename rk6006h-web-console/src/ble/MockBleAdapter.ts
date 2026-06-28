/**
 * 开发用 Mock BLE 适配器 —— 无需真实硬件即可驱动 UI。
 *
 * 内置一份基于真机实测的寄存器模型，响应 FC03 读 / FC06 / FC10 写。
 * 在 Store / 连接层注入此适配器即可离线开发与演示。
 */

import { MODBUS_SLAVE_ADDRESS } from '@/config/constants';
import { appendCrc } from '@/modbus/crc16';
import { REG } from '@/registers/map';
import { ExceptionCode, FunctionCode } from '@/types/modbus';
import type { BleAdapter, ConnectOptions } from './BleAdapter';

/**
 * Mock 故障注入（用于离线演示通信异常与回归测试）。
 *  - exception：所有请求回 Modbus 异常帧
 *  - crc：响应帧 CRC 被破坏（传输层默认 reject）
 *  - silent：完全不响应（触发传输层超时）
 *  - none：恢复正常
 */
export type MockFault =
  | { type: 'none' }
  | { type: 'exception'; code?: ExceptionCode }
  | { type: 'crc' }
  | { type: 'silent' };

/** Mock 设备内存：地址 → 值（基于真机实测布局初始化） */
function createMemory(): Map<number, number> {
  const m = new Map<number, number>();
  // 系统信息（真机确认：0x0001+0x0002=序列号，0x0003=固件）
  m.set(REG.MODEL_HIGH, 0xeaa3);
  m.set(REG.SERIAL_HIGH, 0x0000);
  m.set(REG.SERIAL_LOW, 0x0231); // 序列号低字 = 561 → 序列号 00000561
  m.set(REG.FIRMWARE, 0x0072); // 固件 = 114 → V1.14
  // 设定 / 实测（标准 Riden 编码：V/100、A/1000）
  m.set(REG.V_SETPOINT, 1200); // 12.00 V
  m.set(REG.I_SETPOINT, 2000); // 2.000 A
  m.set(REG.V_ACTUAL, 1198); // 11.98 V
  m.set(REG.I_ACTUAL, 1850); // 1.850 A → 功率 ≈ 22.2 W
  m.set(REG.P_ACTUAL, 2220); // 原始（UI 实际用 V×I 计算）
  m.set(REG.TEMPERATURE, 0x0aee); // ≈ 27.98℃
  m.set(REG.OUTPUT_ON, 0x0001); // ON
  // 保护设置（§7.3 真机值）
  m.set(REG.OVP_THRESHOLD, 0x001c);
  m.set(REG.OVP_RAW, 0x5f40);
  m.set(REG.OCP_THRESHOLD, 0x0012);
  m.set(REG.OCP_RAW, 0x4029);
  m.set(REG.OAH_THRESHOLD, 0x0043);
  m.set(REG.OAH_RAW, 0x5c6e);
  m.set(REG.OPH_THRESHOLD, 0x000a);
  m.set(REG.OPH_RAW, 0x422f);
  return m;
}

export class MockBleAdapter implements BleAdapter {
  private _connected = false;
  private readonly memory = createMemory();
  private readonly dataCbs = new Set<(d: Uint8Array) => void>();
  private readonly disconnectCbs = new Set<() => void>();
  /** 当前注入的故障（默认无）。 */
  private fault: MockFault = { type: 'none' };

  get connected(): boolean {
    return this._connected;
  }

  /** 注入 / 清除故障（离线演示与测试用）。 */
  setFault(fault: MockFault): void {
    this.fault = fault;
  }

  get currentFault(): MockFault {
    return this.fault;
  }

  /** 直接改写 Mock 内存寄存器（模拟设备侧状态变化，如保护触发关输出）。 */
  setRegister(addr: number, value: number): void {
    this.memory.set(addr, value & 0xffff);
  }

  async connect(_options?: ConnectOptions): Promise<string> {
    await delay(150);
    this._connected = true;
    return 'RK6006-MOCK';
  }

  async write(data: Uint8Array, _withResponse: boolean): Promise<void> {
    if (!this._connected) throw new Error('Mock 设备未连接');
    if (this.fault.type === 'silent') return; // 不应答 → 传输层超时
    const resp = this.handleFrame(data, this.fault);
    if (resp) {
      // 异步交付（模拟 BLE 通知往返）
      setTimeout(() => {
        for (const cb of this.dataCbs) cb(resp);
      }, 10);
    }
  }

  onData(cb: (d: Uint8Array) => void): () => void {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectCbs.add(cb);
    return () => this.disconnectCbs.delete(cb);
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    for (const cb of this.disconnectCbs) cb();
  }

  async reconnect(): Promise<boolean> {
    this._connected = true;
    return true;
  }

  // ─── Modbus 帧处理 ─────────────────────────────────────────

  private handleFrame(frame: Uint8Array, fault: MockFault): Uint8Array | null {
    if (frame[0] !== MODBUS_SLAVE_ADDRESS || frame.length < 2) return null;
    const fc = frame[1]!;
    // 故障：异常帧（设备拒绝执行，不写入内存）
    if (fault.type === 'exception') {
      return buildException(fc, fault.code);
    }
    let resp: Uint8Array | null = null;
    switch (fc) {
      case FunctionCode.ReadHoldingRegisters:
        resp = this.handleRead(frame);
        break;
      case FunctionCode.WriteSingleRegister:
        resp = this.handleWriteSingle(frame);
        break;
      case FunctionCode.WriteMultipleRegisters:
        resp = this.handleWriteMulti(frame);
        break;
      default:
        return null;
    }
    // 故障：破坏 CRC（传输层默认 reject）
    return fault.type === 'crc' ? corruptCrc(resp) : resp;
  }

  private handleRead(frame: Uint8Array): Uint8Array {
    const addr = (frame[2]! << 8) | frame[3]!;
    const qty = (frame[4]! << 8) | frame[5]!;
    const body = [MODBUS_SLAVE_ADDRESS, FunctionCode.ReadHoldingRegisters, qty * 2];
    for (let i = 0; i < qty; i++) {
      const v = this.memory.get(addr + i) ?? 0;
      body.push((v >> 8) & 0xff, v & 0xff);
    }
    return appendCrc(Uint8Array.from(body));
  }

  private handleWriteSingle(frame: Uint8Array): Uint8Array {
    const addr = (frame[2]! << 8) | frame[3]!;
    const value = (frame[4]! << 8) | frame[5]!;
    this.memory.set(addr, value);
    // 回显
    return appendCrc(
      Uint8Array.from([
        MODBUS_SLAVE_ADDRESS,
        FunctionCode.WriteSingleRegister,
        (addr >> 8) & 0xff,
        addr & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
      ]),
    );
  }

  private handleWriteMulti(frame: Uint8Array): Uint8Array {
    const addr = (frame[2]! << 8) | frame[3]!;
    const qty = (frame[4]! << 8) | frame[5]!;
    const dataStart = 7;
    for (let i = 0; i < qty; i++) {
      const hi = frame[dataStart + i * 2]!;
      const lo = frame[dataStart + i * 2 + 1]!;
      this.memory.set(addr + i, (hi << 8) | lo);
    }
    return appendCrc(
      Uint8Array.from([
        MODBUS_SLAVE_ADDRESS,
        FunctionCode.WriteMultipleRegisters,
        (addr >> 8) & 0xff,
        addr & 0xff,
        (qty >> 8) & 0xff,
        qty & 0xff,
      ]),
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 构造异常响应帧：[Slave][FC|0x80][ExceptionCode][CRC]。 */
function buildException(fc: number, code?: ExceptionCode): Uint8Array {
  return appendCrc(
    Uint8Array.of(
      MODBUS_SLAVE_ADDRESS,
      fc | 0x80,
      code ?? ExceptionCode.IllegalDataAddress,
    ),
  );
}

/** 破坏最后一字节（CRC）以模拟传输损坏。 */
function corruptCrc(frame: Uint8Array): Uint8Array {
  const out = Uint8Array.from(frame);
  const last = out.length - 1;
  out[last] = (out[last] ?? 0) ^ 0xff;
  return out;
}
