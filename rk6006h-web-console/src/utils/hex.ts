/**
 * 字节 ↔ 十六进制字符串 转换工具。
 * 供协议层、Console 面板与测试共用。
 */

const HEX = '0123456789ABCDEF';

/** 单字节 → 两位大写十六进制 */
export function toHexByte(b: number): string {
  return HEX[(b >> 4) & 0x0f]! + HEX[b & 0x0f]!;
}

/** Uint8Array → "AA BB CC" 形式（空格分隔，大写） */
export function bytesToHex(bytes: Uint8Array, separator = ' '): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0) out += separator;
    out += toHexByte(bytes[i]!);
  }
  return out;
}

/** 十六进制字符串（允许空格/无分隔）→ Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error(`hexToBytes: 奇数位长度 (${cleaned.length})`);
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
