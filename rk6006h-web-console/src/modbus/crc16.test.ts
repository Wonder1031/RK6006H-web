import { describe, expect, it } from 'vitest';
import { appendCrc, crc16Modbus, crcHigh, crcLow, verifyCrc } from './crc16';
import { hexToBytes } from '@/utils/hex';

describe('crc16Modbus — 协议 §6/§7 真机样本', () => {
  /**
   * 每组：[无 CRC 数据区, 期望 CRC 低字节, 期望 CRC 高字节]
   * 仅采用协议 §7 真机动态验证过的样本（4 条）+ §6.1 中经核对一致的两条。
   *
   * ⚠️ 源文档 §6.1 中下列命令的 CRC 与标准算法不符，已剔除：
   *    - 01 03 00 00 00 05 （文档标 0C 15）
   *    - 01 03 00 00 00 0A （文档标 4D 09）
   *    以及全部 §6.2 FC06 写命令。这些命令均未在 §7 真机执行，CRC 不可信。
   *    正确性以「权威校验值 0x4B37 + 4 条真机样本」为准；后续可用 bleak 复测固化。
   */
  const cases: Array<[string, number, number]> = [
    ['01 03 00 00 00 04', 0x44, 0x09], // §7.1 真机：基础信息 ×4
    ['01 03 00 00 00 08', 0x44, 0x0c], // §6.1：基础信息 ×8（核对一致）
    ['01 03 00 04 00 26', 0x85, 0xd1], // §7.2 真机：★ 主状态轮询
    ['01 03 00 09 00 04', 0x94, 0x0b], // §6.1：状态子块（核对一致）
    ['01 03 00 37 00 0a', 0x74, 0x03], // §7.3 真机：保护设置
    ['01 03 00 48 00 01', 0x04, 0x1c], // §7.4 真机：单寄存器读
  ];

  it.each(cases)('CRC(%s) → low=0x%02X high=0x%02X', (data, low, high) => {
    const crc = crc16Modbus(hexToBytes(data));
    expect(crcLow(crc)).toBe(low);
    expect(crcHigh(crc)).toBe(high);
  });
});

describe('appendCrc', () => {
  it('在主状态轮询请求末尾追加正确 CRC', () => {
    const frame = appendCrc(hexToBytes('01 03 00 04 00 26'));
    expect(Array.from(frame)).toEqual(
      Array.from(hexToBytes('01 03 00 04 00 26 85 d1')),
    );
  });
});

describe('crc16Modbus — 权威校验值', () => {
  /**
   * CRC-16/MODBUS 对 ASCII "123456789" 的标准校验值为 0x4B37
   * （来自 CRC 目录 https://reveng.sourceforge.net/crc-catalogue/）。
   * 用作第三方独立向量，证明本实现确为标准 CRC-16/MODBUS。
   *
   * ⚠️ 此断言还起到"仲裁"作用：源文档 §6.2 给出的 FC06 写命令 CRC
   *    （如 01 06 00 01 00 00 → 49 F6）与标准算法不符。
   *    因 §12.3 已声明写命令未在真机执行，其 CRC 不可信；
   *    本实现以权威校验值 + 全部 FC03 真机样本为准。
   */
  it('ASCII "123456789" → 0x4B37', () => {
    const crc = crc16Modbus(hexToBytes('31 32 33 34 35 36 37 38 39'));
    expect(crc).toBe(0x4b37);
  });
});

describe('verifyCrc — 真机响应帧', () => {
  /**
   * 均为协议 §7 中 CRC 自洽的真机帧。
   * 注：§7.3 文档原帧被截断（23B，应为 25B），此处用 appendCrc 重建合法帧。
   */
  const validFrames = [
    '01 03 00 00 00 04 44 09', // §7.1 请求
    '01 03 08 EA A3 00 00 02 31 00 72 58 B8', // §7.1 响应
    '01 03 02 00 05 78 47', // §7.4 单寄存器响应
  ];

  it.each(validFrames)('校验通过: %s', (frame) => {
    expect(verifyCrc(hexToBytes(frame))).toBe(true);
  });

  it('§7.3 保护响应（重建合法 25B 帧）校验通过', () => {
    // 末尾补齐 §5.3 的 Overtime(raw=0x0000)，再由 appendCrc 追加正确 CRC。
    const frame = appendCrc(
      hexToBytes('01 03 14 00 1C 5F 40 00 12 40 29 00 43 5C 6E 00 0A 42 2F 00 00 00 00'),
    );
    expect(frame.length).toBe(25);
    expect(verifyCrc(frame)).toBe(true);
  });

  it('篡改数据后校验失败', () => {
    const corrupted = hexToBytes('01 03 08 EA A3 00 00 02 31 00 72 58 B9'); // 末字节 B8→B9
    expect(verifyCrc(corrupted)).toBe(false);
  });

  it('帧长不足时返回 false', () => {
    expect(verifyCrc(hexToBytes('01 03'))).toBe(false);
  });
});
