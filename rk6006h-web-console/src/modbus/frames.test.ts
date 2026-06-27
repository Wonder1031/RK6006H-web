import { describe, expect, it } from 'vitest';
import {
  ParseError,
  buildReadHolding,
  buildWriteMultiple,
  buildWriteSingle,
  expectedFrameLength,
  parseResponse,
} from './frames';
import { appendCrc, verifyCrc } from './crc16';
import { ExceptionCode, FunctionCode } from '@/types/modbus';
import { bytesToHex, hexToBytes } from '@/utils/hex';

describe('buildReadHolding — 协议 §6.1 真机命令', () => {
  it('主状态轮询 (0x0004, 38)', () => {
    expect(bytesToHex(buildReadHolding(0x0004, 38))).toBe(
      '01 03 00 04 00 26 85 D1',
    );
  });

  it('基础信息 (0x0000, 4)', () => {
    expect(bytesToHex(buildReadHolding(0x0000, 4))).toBe(
      '01 03 00 00 00 04 44 09',
    );
  });

  it('数量超范围抛错', () => {
    expect(() => buildReadHolding(0x0000, 0)).toThrow(RangeError);
    expect(() => buildReadHolding(0x0000, 200)).toThrow(RangeError);
  });
});

describe('buildWriteSingle — 协议 §6.2', () => {
  it('§6.2 写 0x0001 = 0x0000：数据区正确且 CRC 自洽', () => {
    // 注：源文档该帧标注 CRC 为 49 F6，但与标准 CRC-16/MODBUS 不符（见 crc16.test.ts 权威校验值）。
    const frame = buildWriteSingle(0x0001, 0);
    expect(frame.slice(0, 6)).toEqual(hexToBytes('01 06 00 01 00 00'));
    expect(verifyCrc(frame)).toBe(true);
  });

  it('输出 ON (0x0012 = 1)：数据区正确且 CRC 自洽', () => {
    const frame = buildWriteSingle(0x0012, 1);
    expect(frame.slice(0, 6)).toEqual(hexToBytes('01 06 00 12 00 01'));
    expect(frame.length).toBe(8);
    expect(verifyCrc(frame)).toBe(true);
  });

  it('输出 OFF (0x0012 = 0)：CRC 自洽', () => {
    const frame = buildWriteSingle(0x0012, 0);
    expect(frame.slice(0, 6)).toEqual(hexToBytes('01 06 00 12 00 00'));
    expect(verifyCrc(frame)).toBe(true);
  });
});

describe('buildWriteMultiple — 预设组 (0x0030, 6 寄存器)', () => {
  it('命令头与字节计数正确', () => {
    const frame = buildWriteMultiple(0x0030, [0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006]);
    // slave fc addrH addrL qtyH qtyL byteCount data...
    expect(frame.slice(0, 7)).toEqual(
      hexToBytes('01 10 00 30 00 06 0C'),
    );
    // 数据区 6 个大端寄存器
    expect(frame.slice(7, 7 + 12)).toEqual(
      hexToBytes('00 01 00 02 00 03 00 04 00 05 00 06'),
    );
    expect(frame.length).toBe(7 + 12 + 2); // 含 CRC
  });
});

describe('parseResponse — 协议 §7 真机响应', () => {
  it('§7.1 基础信息：解码 4 寄存器', () => {
    const r = parseResponse(hexToBytes('01 03 08 EA A3 00 00 02 31 00 72 58 B8'));
    expect(r.kind).toBe('read');
    if (r.kind !== 'read') return;
    expect(r.registers).toEqual([0xeaa3, 0x0000, 0x0231, 0x0072]);
    expect(r.crcOk).toBe(true);
  });

  it('§7.4 单寄存器读：0x0048 = 0x0005', () => {
    const r = parseResponse(hexToBytes('01 03 02 00 05 78 47'));
    expect(r.kind).toBe('read');
    if (r.kind !== 'read') return;
    expect(r.registers).toEqual([0x0005]);
  });

  it('§7.3 保护设置：解码 10 寄存器（重建合法帧）', () => {
    // 源文档 §7.3 帧被截断（23B，缺末 2B）；此处按 §5.3 补齐 Overtime raw=0 并重建。
    const frame = appendCrc(
      hexToBytes('01 03 14 00 1C 5F 40 00 12 40 29 00 43 5C 6E 00 0A 42 2F 00 00 00 00'),
    );
    const r = parseResponse(frame);
    expect(r.kind).toBe('read');
    if (r.kind !== 'read') return;
    expect(r.registers).toEqual([
      0x001c, 0x5f40, 0x0012, 0x4029, 0x0043, 0x5c6e, 0x000a, 0x422f, 0x0000,
      0x0000,
    ]);
  });

  it('FC06 写回显', () => {
    const r = parseResponse(hexToBytes('01 06 00 12 00 01 48 39'));
    expect(r.kind).toBe('writeSingle');
    if (r.kind !== 'writeSingle') return;
    expect(r.address).toBe(0x0012);
    expect(r.value).toBe(1);
  });

  it('异常响应：非法地址 (0x83 0x02)', () => {
    const exc = appendCrc(Uint8Array.of(0x01, 0x83, ExceptionCode.IllegalDataAddress));
    const r = parseResponse(exc);
    expect(r.kind).toBe('exception');
    if (r.kind !== 'exception') return;
    expect(r.functionCode).toBe(0x83);
    expect(r.exception).toBe(ExceptionCode.IllegalDataAddress);
    expect(r.crcOk).toBe(true);
  });
});

describe('expectedFrameLength', () => {
  it('FC03 需读 byteCount 后才能确定 (§7.1 = 13)', () => {
    expect(expectedFrameLength(hexToBytes('01 03 08'))).toBe(13);
  });

  it('FC03 主状态响应 (0x4C=76 → 81)', () => {
    expect(expectedFrameLength(hexToBytes('01 03 4C'))).toBe(81);
  });

  it('FC03 仅有前 2 字节时返回 null', () => {
    expect(expectedFrameLength(hexToBytes('01 03'))).toBeNull();
  });

  it('FC06/FC10 固定 8 字节', () => {
    expect(expectedFrameLength(hexToBytes('01 06 00'))).toBe(8);
    expect(expectedFrameLength(hexToBytes('01 10 00'))).toBe(8);
  });

  it('异常帧 (0x83) 固定 5 字节', () => {
    expect(expectedFrameLength(hexToBytes('01 83 02'))).toBe(5);
  });
});

describe('parseResponse 错误处理', () => {
  it('帧过短抛 ParseError', () => {
    expect(() => parseResponse(hexToBytes('01'))).toThrow(ParseError);
  });

  it('未知功能码抛错', () => {
    const unknown = appendCrc(Uint8Array.of(0x01, 0x42, 0x00));
    expect(() => parseResponse(unknown)).toThrow(/未知功能码/);
  });
});

// 防止 FunctionCode 未使用告警（类型导出引用）
void FunctionCode;
