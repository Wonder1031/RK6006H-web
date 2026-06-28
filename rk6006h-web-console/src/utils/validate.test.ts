import { describe, expect, it } from 'vitest';
import {
  sanitizePreset,
  sanitizePresetSet,
  sanitizeSetpoint,
} from './validate';
import { DEVICE_LIMITS } from '@/config/constants';

const FALLBACK = [
  { voltage: 5, current: 1 },
  { voltage: 12, current: 2 },
  { voltage: 24, current: 3 },
];

describe('sanitizePreset', () => {
  it('合法值原样返回', () => {
    expect(sanitizePreset({ voltage: 12, current: 2 })).toEqual({
      voltage: 12,
      current: 2,
    });
  });

  it('越界值限幅到设备量程', () => {
    expect(sanitizePreset({ voltage: 999, current: -5 })).toEqual({
      voltage: DEVICE_LIMITS.V_MAX,
      current: 0,
    });
  });

  it('结构非法返回 null', () => {
    expect(sanitizePreset(null)).toBeNull();
    expect(sanitizePreset({ voltage: 'x', current: 1 })).toBeNull();
    expect(sanitizePreset({ voltage: 1 })).toBeNull();
  });
});

describe('sanitizePresetSet', () => {
  it('3 组合法 → 净化后返回', () => {
    const out = sanitizePresetSet(
      [{ voltage: 999, current: 1 }, { voltage: 2, current: 2 }, { voltage: 3, current: 3 }],
      FALLBACK,
    );
    expect(out).toHaveLength(3);
    expect(out[0]!.voltage).toBe(DEVICE_LIMITS.V_MAX);
  });

  it('非 3 组 → 回退 fallback', () => {
    expect(sanitizePresetSet([{ voltage: 1, current: 1 }], FALLBACK)).toBe(FALLBACK);
    expect(sanitizePresetSet('nope', FALLBACK)).toBe(FALLBACK);
  });
});

describe('sanitizeSetpoint', () => {
  it('合法 → 限幅返回', () => {
    expect(
      sanitizeSetpoint({ voltage: 999, current: 1 }, { voltage: 0, current: 0 }),
    ).toEqual({ voltage: DEVICE_LIMITS.V_MAX, current: 1 });
  });

  it('非法 → fallback', () => {
    const fb = { voltage: 7, current: 8 };
    expect(sanitizeSetpoint(null, fb)).toBe(fb);
    expect(sanitizeSetpoint({ voltage: 1 }, fb)).toBe(fb);
  });
});
