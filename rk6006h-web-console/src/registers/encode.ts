/**
 * 工程值 → 原始寄存器值 编码器（供写入命令构造）。
 *
 * 与 decode.ts 互为逆运算，缩放真机确认：V×100、I×1000。
 */

import { I_DIVISOR, REG, V_DIVISOR } from './map';
import { toRaw } from './scaling';
import type { Preset } from '@/types/device';

/** 设定电压（工程值 V）→ 0x0008 原始值。 */
export function encodeVoltageSetpoint(volts: number): number {
  return toRaw(volts, V_DIVISOR);
}

/** 设定电流（工程值 A）→ 0x0009 原始值。 */
export function encodeCurrentSetpoint(amps: number): number {
  return toRaw(amps, I_DIVISOR);
}

/**
 * 预设组 M0~M2 → 6 个原始寄存器值（FC10 写 0x0030）。
 * 顺序：[M0.V, M0.I, M1.V, M1.I, M2.V, M2.I]
 *
 * ⚠️ 0x0030 预设地址未真机验证（§5.2 其它地址已证伪），写入需谨慎。
 */
export function encodePresets(presets: readonly Preset[]): number[] {
  if (presets.length !== 3) {
    throw new RangeError(`预设组须为 3 组，实际 ${presets.length}`);
  }
  return presets.flatMap((p) => [
    encodeVoltageSetpoint(p.voltage),
    encodeCurrentSetpoint(p.current),
  ]);
}

/** 寄存器地址 → 写入值 的便捷构造（FC06 用）。 */
export interface WriteOp {
  address: number;
  value: number;
}

/** 构造「输出 ON/OFF」写入操作。 */
export function outputOnOff(on: boolean): WriteOp {
  return { address: REG.OUTPUT_ON, value: on ? 1 : 0 };
}
