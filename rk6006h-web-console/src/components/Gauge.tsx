/** 单值仪表卡片 —— 显示一个工程量（电压 / 电流 / 功率 等）。 */

interface GaugeProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  digits?: number;
  /** 数值偏小时可省略小数位 */
  accent?: 'default' | 'ok' | 'warn' | 'danger';
}

const ACCENT_COLOR: Record<NonNullable<GaugeProps['accent']>, string> = {
  default: 'text-slate-100',
  ok: 'text-accent-ok',
  warn: 'text-accent-warn',
  danger: 'text-accent-danger',
};

export function Gauge({
  label,
  value,
  unit,
  digits = 2,
  accent = 'default',
}: GaugeProps) {
  const display = value == null ? '--' : value.toFixed(digits);
  return (
    <div className="panel flex flex-col items-center justify-center gap-1 py-5">
      <span className="text-xs uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className={`num text-4xl font-semibold ${ACCENT_COLOR[accent]}`}>
        {display}
        <span className="ml-1 text-lg text-slate-400">{unit}</span>
      </span>
    </div>
  );
}
