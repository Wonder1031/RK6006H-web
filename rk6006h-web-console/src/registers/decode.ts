/**
 * 寄存器数组 → 结构化设备数据 的解码器。
 *
 * 各解码器约定：传入的 regs[0] 对应一个已知的基地址（见函数注释）。
 * 内部统一用 getAt() 按绝对地址取值，避免手工算偏移出错。
 *
 * 缩放真机已确认：V/100、I/1000、温度/100（§7.6）。
 */

import { POLL_START_ADDRESS } from '@/config/constants';
import { I_DIVISOR, REG, PROTECTION_READ, TEMP_DIVISOR, V_DIVISOR } from './map';
import { toEngineering } from './scaling';
import type {
  DeviceInfo,
  Protection,
  ProtectionEntry,
  Telemetry,
} from '@/types/device';

// ─── 工具：按绝对地址取值 ───────────────────────────────────────

/** regs[0] 对应 baseAddr；返回 absAddr 处的寄存器值，越界返回 0。 */
function getAt(regs: number[], baseAddr: number, absAddr: number): number {
  const off = absAddr - baseAddr;
  return off >= 0 && off < regs.length ? (regs[off] ?? 0) : 0;
}

// ─── 系统信息（regs[0] = 0x0000）────────────────────────────────

/**
 * 解码系统信息区（只读固定字段）。
 * @param regs 对应 0x0000 起的读结果（至少 4 个寄存器）
 */
export function decodeDeviceInfo(regs: number[]): DeviceInfo {
  const base = 0x0000;
  return {
    modelHigh: getAt(regs, base, REG.MODEL_HIGH),
    firmwareRaw: getAt(regs, base, REG.FIRMWARE),
  };
}

// ─── 实时遥测（regs[0] = POLL_START_ADDRESS = 0x0004）──────────

/**
 * 解码主轮询窗口（0x0004 起 38 寄存器）。
 *
 * 设定/实测均在 0x0008~0x000E，落在轮询窗口内。
 * 功率由 V×I 计算得（比 0x000C 原始值更可靠，其缩放未确认）。
 */
export function decodeTelemetry(regs: number[]): Telemetry {
  const base = POLL_START_ADDRESS;

  const voltageSetpoint = toEngineering(
    getAt(regs, base, REG.V_SETPOINT),
    V_DIVISOR,
  );
  const currentSetpoint = toEngineering(
    getAt(regs, base, REG.I_SETPOINT),
    I_DIVISOR,
  );
  const outputOn = getAt(regs, base, REG.OUTPUT_ON) !== 0;
  const voltageActual = toEngineering(
    getAt(regs, base, REG.V_ACTUAL),
    V_DIVISOR,
  );
  const currentActual = toEngineering(
    getAt(regs, base, REG.I_ACTUAL),
    I_DIVISOR,
  );

  return {
    voltageSetpoint,
    currentSetpoint,
    outputOn,
    voltageActual,
    currentActual,
    powerActual: voltageActual * currentActual,
    temperature: toEngineering(getAt(regs, base, REG.TEMPERATURE), TEMP_DIVISOR),
    timestamp: Date.now(),
  };
}

// ─── 保护设置（regs[0] = PROTECTION_READ.start = 0x0037）───────

/**
 * 解码保护设置区。
 * @param regs 对应 0x0037 起 10 个寄存器（5 项 × threshold + raw）
 */
export function decodeProtection(regs: number[]): Protection {
  const base = PROTECTION_READ.start;
  const entry = (thrAddr: number, rawAddr: number): ProtectionEntry => ({
    threshold: getAt(regs, base, thrAddr),
    raw: getAt(regs, base, rawAddr),
  });
  return {
    ovp: entry(REG.OVP_THRESHOLD, REG.OVP_RAW),
    ocp: entry(REG.OCP_THRESHOLD, REG.OCP_RAW),
    oah: entry(REG.OAH_THRESHOLD, REG.OAH_RAW),
    oph: entry(REG.OPH_THRESHOLD, REG.OPH_RAW),
    overtime: entry(REG.OVT_THRESHOLD, REG.OVT_RAW),
  };
}
