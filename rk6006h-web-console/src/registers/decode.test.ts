import { describe, expect, it } from 'vitest';
import {
  decodeDeviceInfo,
  decodeProtection,
  decodeTelemetry,
} from './decode';
import {
  encodeCurrentSetpoint,
  encodePresets,
  encodeVoltageSetpoint,
  outputOnOff,
} from './encode';
import { toEngineering, toRaw } from './scaling';
import { POLL_REGISTER_COUNT, POLL_START_ADDRESS } from '@/config/constants';
import { formatFirmware } from '@/types/device';

// ─── 系统信息（§7.1）────────────────────────────────────────────

describe('decodeDeviceInfo — §7.1 真机样本', () => {
  // [MODEL_HIGH=0x0000, SERIAL_HIGH=0x0001, SERIAL_LOW=0x0002, FIRMWARE=0x0003]
  it('解码型号 / 固件（固件在 0x0003）', () => {
    const info = decodeDeviceInfo([0xeaa3, 0x0000, 0x0231, 0x0072]);
    expect(info.modelHigh).toBe(0xeaa3);
    expect(info.firmwareRaw).toBe(0x0072); // = 114 → V1.14
  });

  it('序列号 = SERIAL_HIGH<<16 | SERIAL_LOW（无符号）', () => {
    // SERIAL_HIGH=0x0001, SERIAL_LOW=0x0231 → 0x00010231
    const info = decodeDeviceInfo([0xeaa3, 0x0001, 0x0231, 0x0072]);
    expect(info.serialRaw).toBe(0x00010231);
  });

  it('真机样本：序列号 561 / 固件 114', () => {
    const info = decodeDeviceInfo([0xeaa3, 0x0000, 0x0231, 0x0072]);
    expect(info.serialRaw).toBe(561); // → 00000561
    expect(info.firmwareRaw).toBe(114); // → V1.14
  });
});

describe('formatFirmware', () => {
  it('0x0072 = 114 → v1.14（真机固件）', () => {
    expect(formatFirmware(0x0072)).toBe('v1.14');
  });
});

// ─── 遥测（真机确认布局 + 缩放）──────────────────────────────

/** 构造 38 元素轮询块（0x0004 起），按绝对地址写入。 */
function makePollBlock(entries: Record<number, number>): number[] {
  const regs = new Array<number>(POLL_REGISTER_COUNT).fill(0);
  for (const [addr, val] of Object.entries(entries)) {
    const off = Number(addr) - POLL_START_ADDRESS;
    if (off < 0 || off >= regs.length) {
      throw new Error(`地址 0x${Number(addr).toString(16)} 不在轮询窗口内`);
    }
    regs[off] = val;
  }
  return regs;
}

describe('decodeTelemetry — 真机确认布局（V/100、I/1000）', () => {
  // 模拟真机：设定 25.00V/3.500A，输出 ON，实测 25.00V/空载 0A
  const block = makePollBlock({
    0x0008: 2500, // V 设定 → 25.00 V
    0x0009: 3500, // I 设定 → 3.500 A
    0x000a: 2500, // V 实测 → 25.00 V
    0x000b: 0, // I 实测 → 0 A（空载）
    0x000e: 2792, // 温度 → 27.92 ℃
    0x0012: 1, // 输出 ON
  });

  it('设定值按 V/100、I/1000 换算', () => {
    const t = decodeTelemetry(block);
    expect(t.voltageSetpoint).toBeCloseTo(25.0, 2);
    expect(t.currentSetpoint).toBeCloseTo(3.5, 3);
  });

  it('实测值与温度', () => {
    const t = decodeTelemetry(block);
    expect(t.voltageActual).toBeCloseTo(25.0, 2);
    expect(t.currentActual).toBe(0);
    expect(t.temperature).toBeCloseTo(27.92, 2);
    expect(t.outputOn).toBe(true);
  });

  it('功率 = V × I（空载 = 0）', () => {
    expect(decodeTelemetry(block).powerActual).toBe(0);
  });

  it('有载时功率 = V × I', () => {
    const t = decodeTelemetry(
      makePollBlock({ 0x000a: 1200, 0x000b: 2000 }), // 12.00V × 2.000A = 24 W
    );
    expect(t.powerActual).toBeCloseTo(24.0, 2);
  });

  it('OFF 时 outputOn=false', () => {
    const t = decodeTelemetry(makePollBlock({ 0x0012: 0 }));
    expect(t.outputOn).toBe(false);
  });
});

// ─── 保护设置（§7.3 真机样本）──────────────────────────────────

describe('decodeProtection — §7.3', () => {
  const regs = [
    0x001c, 0x5f40, 0x0012, 0x4029, 0x0043, 0x5c6e, 0x000a, 0x422f, 0x0000,
    0x0000,
  ];

  it('解码 5 项保护（threshold + raw）', () => {
    const p = decodeProtection(regs);
    expect(p.ovp).toEqual({ threshold: 0x001c, raw: 0x5f40 });
    expect(p.ocp).toEqual({ threshold: 0x0012, raw: 0x4029 });
    expect(p.oah).toEqual({ threshold: 0x0043, raw: 0x5c6e });
    expect(p.oph).toEqual({ threshold: 0x000a, raw: 0x422f });
    expect(p.overtime).toEqual({ threshold: 0, raw: 0 });
  });
});

// ─── 编解码互逆（真机缩放）────────────────────────────────────

describe('scaling 往返一致性', () => {
  it('电压：12.00 V → 1200 → 12.00 V', () => {
    const raw = encodeVoltageSetpoint(12.0);
    expect(raw).toBe(1200);
    expect(toEngineering(raw, 100)).toBe(12.0);
  });

  it('电流：2.5 A → 2500 → 2.5 A', () => {
    const raw = encodeCurrentSetpoint(2.5);
    expect(raw).toBe(2500);
    expect(toEngineering(raw, 1000)).toBe(2.5);
  });

  it('toRaw 限幅到 16 位', () => {
    expect(toRaw(1e9, 100)).toBe(0xffff);
  });
});

describe('encodePresets — M0~M2', () => {
  it('3 组预设 → 6 个原始值', () => {
    const out = encodePresets([
      { voltage: 5, current: 1 },
      { voltage: 12, current: 2 },
      { voltage: 24, current: 3 },
    ]);
    expect(out).toEqual([500, 1000, 1200, 2000, 2400, 3000]);
  });

  it('非 3 组抛错', () => {
    expect(() => encodePresets([{ voltage: 5, current: 1 }])).toThrow(RangeError);
  });
});

describe('outputOnOff', () => {
  it('ON → 0x0012 = 1', () => {
    expect(outputOnOff(true)).toEqual({ address: 0x0012, value: 1 });
  });
  it('OFF → 0x0012 = 0', () => {
    expect(outputOnOff(false)).toEqual({ address: 0x0012, value: 0 });
  });
});
