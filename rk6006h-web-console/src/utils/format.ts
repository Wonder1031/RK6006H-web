/** 数值格式化工具（仪表显示用）。 */

/** 定点格式化，空值显示占位符。 */
export function fmt(
  val: number | null | undefined,
  digits = 2,
  unit = '',
): string {
  if (val == null || Number.isNaN(val)) return `--`;
  return `${val.toFixed(digits)}${unit}`;
}

/** 时钟格式 HH:MM:SS。 */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
