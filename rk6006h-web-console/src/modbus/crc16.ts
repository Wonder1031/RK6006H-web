/**
 * CRC-16/MODBUS 校验。
 *
 * 算法（依据 RK6006H_Bluetooth_Protocol_Analysis.md §4.3）：
 *   - 多项式：0xA001（即 0x8005 的位反转）
 *   - 初值：0xFFFF
 *   - 输入/输出：不做额外反转（按字节从低到右移处理）
 *   - 发送时低字节在前（little-endian）
 */

/** 计算 CRC-16/MODBUS（仅数据区，不含 CRC 本身）。 */
export function crc16Modbus(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc & 0xffff;
}

/** 取 CRC 的低字节（little-endian 中排在前面）。 */
export function crcLow(crc: number): number {
  return crc & 0xff;
}

/** 取 CRC 的高字节。 */
export function crcHigh(crc: number): number {
  return (crc >> 8) & 0xff;
}

/** 在数据区末尾追加 CRC（低字节在前），返回新数组。 */
export function appendCrc(data: Uint8Array): Uint8Array {
  const crc = crc16Modbus(data);
  const out = new Uint8Array(data.length + 2);
  out.set(data, 0);
  out[data.length] = crcLow(crc);
  out[data.length + 1] = crcHigh(crc);
  return out;
}

/**
 * 校验完整帧（含末尾 2 字节 CRC）是否正确。
 * 帧长 < 3 时直接返回 false（无法容纳 CRC）。
 */
export function verifyCrc(frame: Uint8Array): boolean {
  if (frame.length < 3) return false;
  const data = frame.subarray(0, frame.length - 2);
  const crc = crc16Modbus(data);
  return (
    frame[frame.length - 2] === crcLow(crc) &&
    frame[frame.length - 1] === crcHigh(crc)
  );
}
