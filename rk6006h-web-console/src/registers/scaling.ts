/**
 * 工程值 ↔ 原始寄存器值 缩放转换。
 *
 * 缩放系数真机已确认（标准 Riden 编码），不再是推测：
 *   电压 /100、电流 /1000、温度 /100。
 * 详见 RK6006H_Bluetooth_Protocol_Analysis.md §7.6。
 */

/** 原始值 → 工程值。divisor 为 0 时直接返回原值（防御）。 */
export function toEngineering(raw: number, divisor: number): number {
  return divisor > 0 ? raw / divisor : raw;
}

/** 工程值 → 原始值（四舍五入并限幅到 16 位，供写入）。 */
export function toRaw(engineering: number, divisor: number): number {
  return clampUint16(Math.round(engineering * (divisor > 0 ? divisor : 1)));
}

/** 限幅到 16 位无符号整数范围。 */
export function clampUint16(n: number): number {
  if (n < 0) return 0;
  if (n > 0xffff) return 0xffff;
  return n;
}
