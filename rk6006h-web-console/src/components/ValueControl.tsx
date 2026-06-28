/**
 * 高级数值控件 —— 标签 + 可编辑数值 + 填充式滑块，三位一体联动。
 *
 * 供设定值 / 预设组等需要精细调节 V/I 的场景复用。
 * 滑块轨道用内联渐变呈现"已填充"效果，滑块颜色由 thumbColor 控制。
 */

import type { CSSProperties } from 'react';

export interface ValueControlProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step: number;
  unit: string;
  /** 显示小数位 */
  digits: number;
  /** 滑块颜色（CSS 颜色值） */
  thumbColor?: string;
  disabled?: boolean;
  /** 关联的 input name（便于 E2E 定位） */
  testId?: string;
}

const TRACK_BG = 'rgba(148, 163, 184, 0.2)';

export function ValueControl({
  label,
  value,
  onChange,
  min = 0,
  max,
  step,
  unit,
  digits,
  thumbColor = '#3b82f6',
  disabled = false,
  testId,
}: ValueControlProps) {
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  const pct = max > min ? ((safe - min) / (max - min)) * 100 : 0;

  const trackStyle: CSSProperties = {
    // 已填充段用 thumbColor，未填充段用灰
    background: `linear-gradient(to right, ${thumbColor} 0%, ${thumbColor} ${pct}%, ${TRACK_BG} ${pct}%, ${TRACK_BG} 100%)`,
    ['--range-thumb' as string]: thumbColor,
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="flex items-baseline gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(value) ? Number(value.toFixed(digits)) : ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange(n);
            }}
            disabled={disabled}
            className="num w-20 rounded bg-surface-raised px-2 py-0.5 text-right text-base font-semibold text-ink outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
          />
          <span className="w-4 text-xs text-ink-faint">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        onChange={(e) => onChange(Number(e.target.value))}
        style={trackStyle}
        disabled={disabled}
      />
    </div>
  );
}
