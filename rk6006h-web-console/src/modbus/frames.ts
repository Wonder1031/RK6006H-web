/**
 * Modbus RTU 帧构建与解析。
 *
 * 帧格式（依据 §4）：
 *   [Slave 1B][FC 1B][数据区 4~251B][CRC-16 LE 2B]
 *
 * 仅实现 RK6006H 使用到的 3 种功能码：FC03 读 / FC06 写单 / FC10 写多。
 */

import { MODBUS_SLAVE_ADDRESS } from '@/config/constants';
import { appendCrc, verifyCrc } from './crc16';
import {
  FunctionCode,
  type ParsedResponse,
  isExceptionFc,
  ExceptionCode,
} from '@/types/modbus';

// ─── 构建 ───────────────────────────────────────────────────────

/** 构建 FC03 读保持寄存器请求。 */
export function buildReadHolding(addr: number, qty: number): Uint8Array {
  assertRange(addr, 0, 0xffff, 'addr');
  assertRange(qty, 1, 125, 'qty');
  return appendCrc(
    Uint8Array.of(
      MODBUS_SLAVE_ADDRESS,
      FunctionCode.ReadHoldingRegisters,
      (addr >> 8) & 0xff,
      addr & 0xff,
      (qty >> 8) & 0xff,
      qty & 0xff,
    ),
  );
}

/** 构建 FC06 写单寄存器请求（值大端）。 */
export function buildWriteSingle(addr: number, value: number): Uint8Array {
  assertRange(addr, 0, 0xffff, 'addr');
  assertRange(value, 0, 0xffff, 'value');
  return appendCrc(
    Uint8Array.of(
      MODBUS_SLAVE_ADDRESS,
      FunctionCode.WriteSingleRegister,
      (addr >> 8) & 0xff,
      addr & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ),
  );
}

/** 构建 FC10 写多寄存器请求（值大端）。 */
export function buildWriteMultiple(addr: number, values: number[]): Uint8Array {
  assertRange(addr, 0, 0xffff, 'addr');
  const qty = values.length;
  assertRange(qty, 1, 123, 'values.length');
  const byteCount = qty * 2;
  const body = new Uint8Array(6 + 1 + byteCount);
  body[0] = MODBUS_SLAVE_ADDRESS;
  body[1] = FunctionCode.WriteMultipleRegisters;
  body[2] = (addr >> 8) & 0xff;
  body[3] = addr & 0xff;
  body[4] = (qty >> 8) & 0xff;
  body[5] = qty & 0xff;
  body[6] = byteCount;
  for (let i = 0; i < qty; i++) {
    assertRange(values[i]!, 0, 0xffff, `values[${i}]`);
    body[7 + i * 2] = (values[i]! >> 8) & 0xff;
    body[8 + i * 2] = values[i]! & 0xff;
  }
  return appendCrc(body);
}

// ─── 长度判定（供传输层重组用）──────────────────────────────────

/**
 * 根据已接收缓冲区判定完整帧应有的总长度。
 * @returns 总长度（含 CRC）；若缓冲区尚不足以判定则 null。
 */
export function expectedFrameLength(buffer: Uint8Array): number | null {
  if (buffer.length < 2) return null;
  const fc = buffer[1]!;
  if (isExceptionFc(fc)) return 5; // 异常帧固定 5 字节
  switch (fc) {
    case FunctionCode.ReadHoldingRegisters:
      if (buffer.length < 3) return null; // 需要 byteCount
      return 3 + buffer[2]! + 2; // slave + fc + byteCount + data + crc
    case FunctionCode.WriteSingleRegister:
    case FunctionCode.WriteMultipleRegisters:
      return 8;
    default:
      return null; // 未知功能码
  }
}

// ─── 解析 ───────────────────────────────────────────────────────

/**
 * 解析完整响应帧。
 *
 * 注意：调用方应保证传入的是「完整一帧」（长度由 expectedFrameLength 判定）。
 * CRC 校验失败时仍尝试解析结构，但 crcOk=false，由上层决定丢弃与否。
 */
export function parseResponse(frame: Uint8Array): ParsedResponse {
  if (frame.length < 2) {
    throw new ParseError('帧过短', frame);
  }
  const crcOk = verifyCrc(frame);
  const fc = frame[1]!;

  // 异常响应
  if (isExceptionFc(fc)) {
    if (frame.length < 5) throw new ParseError('异常帧不完整', frame);
    return {
      kind: 'exception',
      functionCode: fc,
      exception: frame[2]! as ExceptionCode,
      crcOk,
    };
  }

  switch (fc) {
    case FunctionCode.ReadHoldingRegisters: {
      if (frame.length < 3) throw new ParseError('FC03 响应过短', frame);
      const byteCount = frame[2]!;
      const registers: number[] = [];
      for (let i = 0; i < byteCount / 2; i++) {
        const hi = frame[3 + i * 2] ?? 0;
        const lo = frame[4 + i * 2] ?? 0;
        registers.push((hi << 8) | lo);
      }
      return {
        kind: 'read',
        functionCode: FunctionCode.ReadHoldingRegisters,
        registers,
        crcOk,
      };
    }
    case FunctionCode.WriteSingleRegister: {
      if (frame.length < 6) throw new ParseError('FC06 响应过短', frame);
      const address = (frame[2]! << 8) | frame[3]!;
      const value = (frame[4]! << 8) | frame[5]!;
      return {
        kind: 'writeSingle',
        functionCode: FunctionCode.WriteSingleRegister,
        address,
        value,
        crcOk,
      };
    }
    case FunctionCode.WriteMultipleRegisters: {
      if (frame.length < 6) throw new ParseError('FC10 响应过短', frame);
      const address = (frame[2]! << 8) | frame[3]!;
      const quantity = (frame[4]! << 8) | frame[5]!;
      return {
        kind: 'writeMultiple',
        functionCode: FunctionCode.WriteMultipleRegisters,
        address,
        quantity,
        crcOk,
      };
    }
    default:
      throw new ParseError(`未知功能码 0x${fc.toString(16)}`, frame);
  }
}

// ─── 错误类型 ───────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    message: string,
    readonly frame: Uint8Array,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// ─── 内部工具 ───────────────────────────────────────────────────

function assertRange(value: number, min: number, max: number, name: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `${name} 须为整数且 ∈ [${min}, ${max}]，实际为 ${value}`,
    );
  }
}
