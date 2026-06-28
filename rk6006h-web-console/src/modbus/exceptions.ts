/**
 * Modbus 异常码 → 可读说明。
 *
 * 异常帧格式：[Slave][FC|0x80][ExceptionCode][CRC]。
 * 设备回异常码时表示拒绝执行（如非法地址 / 非法值 / 从机忙），
 * 应用层应据此给出明确反馈，而非静默丢弃（见 升级方案 P0-2）。
 */

import { ExceptionCode } from '@/types/modbus';

const MESSAGES: Record<ExceptionCode, string> = {
  [ExceptionCode.IllegalFunction]: '非法功能码',
  [ExceptionCode.IllegalDataAddress]: '非法地址',
  [ExceptionCode.IllegalDataValue]: '非法数据值',
  [ExceptionCode.SlaveDeviceFailure]: '从机故障',
  [ExceptionCode.Acknowledge]: '从机已收到（需重试）',
  [ExceptionCode.SlaveDeviceBusy]: '从机忙',
  [ExceptionCode.MemoryParityError]: '内存奇偶校验错',
  [ExceptionCode.GatewayPathUnavailable]: '网关路径不可用',
  [ExceptionCode.GatewayNoResponse]: '网关无响应',
};

/**
 * 把异常码翻译成中文说明。
 * @param code 原始异常码（已解析出的 frame[2]）
 * @returns 如「非法地址」；未知码返回「异常码 0xNN」
 */
export function describeException(code: number): string {
  return MESSAGES[code as ExceptionCode] ?? `异常码 0x${code.toString(16).padStart(2, '0')}`;
}
