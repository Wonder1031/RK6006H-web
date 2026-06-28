/**
 * 持久化数据的结构 / 范围校验（升级方案 §3.4 安全）。
 *
 * localStorage 可被手动篡改，恢复预设/设定值时若直接信任可能引入越界值
 * （如 999V）。这里统一做类型判定 + 设备量程限幅，非法结构回退到默认。
 */

import { DEVICE_LIMITS } from '@/config/constants';
import type { Preset } from '@/types/device';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 净化单个预设：校验结构并限幅到设备量程。非法返回 null。 */
export function sanitizePreset(v: unknown): Preset | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.voltage) || !isFiniteNumber(o.current)) return null;
  return {
    voltage: clamp(o.voltage, 0, DEVICE_LIMITS.V_MAX),
    current: clamp(o.current, 0, DEVICE_LIMITS.I_MAX),
  };
}

/** 净化预设组数组：须为 3 组，否则回退 fallback。 */
export function sanitizePresetSet(v: unknown, fallback: Preset[]): Preset[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.map(sanitizePreset).filter((p): p is Preset => p !== null);
  return out.length === 3 ? out : fallback;
}

/** 净化设定值对象 { voltage, current }：校验并限幅。非法回退 fallback。 */
export function sanitizeSetpoint(
  v: unknown,
  fallback: { voltage: number; current: number },
): { voltage: number; current: number } {
  if (typeof v !== 'object' || v === null) return fallback;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.voltage) || !isFiniteNumber(o.current)) return fallback;
  return {
    voltage: clamp(o.voltage, 0, DEVICE_LIMITS.V_MAX),
    current: clamp(o.current, 0, DEVICE_LIMITS.I_MAX),
  };
}
