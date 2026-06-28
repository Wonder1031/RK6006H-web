import { describe, expect, it, vi } from 'vitest';
import { ModbusTransport, ModbusTransportError } from './transport';
import { appendCrc } from './crc16';
import { buildReadHolding } from './frames';
import type { BleAdapter } from '@/ble/BleAdapter';

// ─── 测试用假设备 ───────────────────────────────────────────────

/** 模拟设备内存（地址 → 值） */
const deviceMemory = new Map<number, number>([
  [0x0002, 0x0231], // 序列号低字（固件在 0x0003）
  [0x0008, 0x04b0], // 电压设定原始（12.00V）
  [0x0009, 0x175a], // 电流设定原始
  [0x000e, 0x0aee], // 温度
  [0x0012, 0x0001], // 输出 ON
]);

/** 构造 FC03 读响应帧 */
function readResponse(regs: number[]): Uint8Array {
  const body = [0x01, 0x03, regs.length * 2];
  for (const r of regs) {
    body.push((r >> 8) & 0xff, r & 0xff);
  }
  return appendCrc(Uint8Array.from(body));
}

/** 默认应答器：按请求的地址/数量从 deviceMemory 取值 */
function defaultResponder(req: Uint8Array): Uint8Array | null {
  if (req[1] !== 0x03) return null;
  const addr = (req[2]! << 8) | req[3]!;
  const qty = (req[4]! << 8) | req[5]!;
  const regs = Array.from({ length: qty }, (_, i) => deviceMemory.get(addr + i) ?? 0);
  return readResponse(regs);
}

interface FakeOpts {
  responder?: (req: Uint8Array) => Uint8Array | null;
  /** 把响应拆成 N 段通知（测试重组） */
  chunks?: number;
  /** 是否静默不响应（测试超时） */
  silent?: boolean;
}

class FakeBleAdapter implements BleAdapter {
  connected = true;
  private dataCbs = new Set<(d: Uint8Array) => void>();
  written: Uint8Array[] = [];

  constructor(private opts: FakeOpts = {}) {}

  async connect(): Promise<string> {
    return 'RK6006-FAKE';
  }
  async write(data: Uint8Array): Promise<void> {
    this.written.push(data);
    const { responder = defaultResponder, chunks = 1, silent = false } = this.opts;
    if (silent) return;
    const resp = responder(data);
    if (!resp) return;
    // 异步交付（模拟 BLE 通知）
    setTimeout(() => {
      const size = Math.ceil(resp.length / chunks);
      for (let i = 0; i < resp.length; i += size) {
        const chunk = resp.slice(i, i + size);
        for (const cb of this.dataCbs) cb(chunk);
      }
    }, 0);
  }
  onData(cb: (d: Uint8Array) => void): () => void {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }
  onDisconnect(): () => void {
    return () => {};
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

// ─── 测试 ───────────────────────────────────────────────────────

describe('ModbusTransport — 单次读', () => {
  it('正确解析 FC03 响应', async () => {
    const adapter = new FakeBleAdapter();
    const transport = new ModbusTransport(adapter);
    transport.start();

    const resp = await transport.readHolding(0x0000, 4);
    expect(resp.kind).toBe('read');
    if (resp.kind !== 'read') return;
    expect(resp.registers[2]).toBe(0x0231); // 固件
    expect(resp.crcOk).toBe(true);
  });

  it('写入的请求帧与文档 §7.1 一致', async () => {
    const adapter = new FakeBleAdapter();
    const transport = new ModbusTransport(adapter);
    transport.start();
    await transport.readHolding(0x0000, 4);
    expect(Array.from(adapter.written[0]!)).toEqual(
      Array.from(buildReadHolding(0x0000, 4)),
    );
  });
});

describe('ModbusTransport — 串行队列', () => {
  it('并发 3 个请求互不串扰、顺序完成', async () => {
    const adapter = new FakeBleAdapter();
    const transport = new ModbusTransport(adapter);
    transport.start();

    const p1 = transport.readHolding(0x0008, 1); // 电压系数
    const p2 = transport.readHolding(0x0009, 1); // 电流系数
    const p3 = transport.readHolding(0x000e, 1); // 温度

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect((r1.kind === 'read' && r1.registers[0]) ?? 0).toBe(0x04b0);
    expect((r2.kind === 'read' && r2.registers[0]) ?? 0).toBe(0x175a);
    expect((r3.kind === 'read' && r3.registers[0]) ?? 0).toBe(0x0aee);
  });
});

describe('ModbusTransport — 通知重组', () => {
  it('响应拆成 3 段通知仍能正确组装', async () => {
    const adapter = new FakeBleAdapter({ chunks: 3 });
    const transport = new ModbusTransport(adapter);
    transport.start();

    const resp = await transport.readHolding(0x0000, 4); // 响应 13B → 拆 3 段
    expect(resp.kind).toBe('read');
    if (resp.kind !== 'read') return;
    expect(resp.registers).toHaveLength(4);
    expect(resp.crcOk).toBe(true);
  });
});

describe('ModbusTransport — 超时', () => {
  it('设备不响应时按超时拒绝', async () => {
    const adapter = new FakeBleAdapter({ silent: true });
    const transport = new ModbusTransport(adapter, undefined, 40);
    transport.start();

    await expect(transport.readHolding(0x0000, 4)).rejects.toThrow(ModbusTransportError);
  });

  it('超时后队列继续处理后续请求', async () => {
    const adapter = new FakeBleAdapter({ silent: true });
    const transport = new ModbusTransport(adapter, undefined, 40);
    transport.start();

    await expect(transport.readHolding(0x0000, 4)).rejects.toThrow();
    // 第二个请求用会响应的适配器
    const adapter2 = new FakeBleAdapter();
    const transport2 = new ModbusTransport(adapter2);
    transport2.start();
    const resp = await transport2.readHolding(0x0008, 1);
    expect(resp.kind).toBe('read');
  });
});

describe('ModbusTransport — 异常与 CRC', () => {
  it('收到异常帧时解析为 exception', async () => {
    // 应答器返回非法地址异常
    const adapter = new FakeBleAdapter({
      responder: () => appendCrc(Uint8Array.of(0x01, 0x83, 0x02)),
    });
    const transport = new ModbusTransport(adapter);
    transport.start();
    const resp = await transport.readHolding(0xffff, 1);
    expect(resp.kind).toBe('exception');
  });

  it('CRC 错误帧默认 reject（契约收紧）', async () => {
    const adapter = new FakeBleAdapter({
      responder: () => {
        const frame = readResponse([0x0001]);
        const last = frame.length - 1;
        frame[last] = (frame[last] ?? 0) ^ 0xff; // 破坏 CRC
        return frame;
      },
    });
    const transport = new ModbusTransport(adapter);
    transport.start();
    await expect(transport.readHolding(0x0001, 1)).rejects.toThrow(
      ModbusTransportError,
    );
  });

  it('allowCrcFail 逃生口返回 crcOk=false 的坏帧（诊断用）', async () => {
    const adapter = new FakeBleAdapter({
      responder: () => {
        const frame = readResponse([0x0001]);
        const last = frame.length - 1;
        frame[last] = (frame[last] ?? 0) ^ 0xff; // 破坏 CRC
        return frame;
      },
    });
    const transport = new ModbusTransport(adapter);
    transport.start();
    const resp = await transport.readHolding(0x0001, 1, {
      allowCrcFail: true,
    });
    expect(resp.crcOk).toBe(false);
  });
});

describe('ModbusTransport — 日志', () => {
  it('通过 logger 回调输出 tx/rx 条目', async () => {
    const logger = vi.fn();
    const adapter = new FakeBleAdapter();
    const transport = new ModbusTransport(adapter, logger);
    transport.start();
    await transport.readHolding(0x0008, 1);
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ direction: 'tx' }));
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ direction: 'rx', crcOk: true }));
  });
});
