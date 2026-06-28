import { describe, expect, it } from 'vitest';
import { checkSetpointSafety } from './safety';
import { DEVICE_LIMITS } from '@/config/constants';
import type { Protection } from '@/types/device';

const NO_PROTECTION: Protection | null = null;

describe('checkSetpointSafety', () => {
  it('量程内无告警', () => {
    expect(checkSetpointSafety(12, 2, NO_PROTECTION)).toHaveLength(0);
  });

  it('电压达上限告警', () => {
    const w = checkSetpointSafety(DEVICE_LIMITS.V_MAX, 1, NO_PROTECTION);
    expect(w).toHaveLength(1);
    expect(w[0]!.field).toBe('voltage');
  });

  it('电流达上限告警', () => {
    const w = checkSetpointSafety(10, DEVICE_LIMITS.I_MAX, NO_PROTECTION);
    expect(w).toHaveLength(1);
    expect(w[0]!.field).toBe('current');
  });

  it('V/I 同时达上限返回两条', () => {
    expect(
      checkSetpointSafety(DEVICE_LIMITS.V_MAX, DEVICE_LIMITS.I_MAX, NO_PROTECTION),
    ).toHaveLength(2);
  });
});
