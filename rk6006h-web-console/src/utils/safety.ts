/**
 * 设定值安全校验（升级方案 P0-5）。
 *
 * ⚠️ 当前实现仅做「设备量程上限」告警。
 *
 * 计划中的 OVP/OCP 阈值联动（设定 V > protection.ovp / 设定 I > protection.ocp）
 * **依赖保护寄存器 0x0037~0x0040 的工程值逆向**，而该工程值尚未确认
 * （见 RK6006H_Bluetooth_Protocol_Analysis.md §12.2、ProtectionPanel、
 * [[rk6006h-protocol-doc-errata]]）。阈值确认后在此接入 `protection` 比对即可，
 * 故函数签名已预留 protection 参数。
 */

import { DEVICE_LIMITS } from '@/config/constants';
import type { Protection } from '@/types/device';

export interface SafetyWarning {
  field: 'voltage' | 'current';
  message: string;
}

/**
 * 校验待写入的设定值，返回告警列表（空表示无告警）。
 */
export function checkSetpointSafety(
  volts: number,
  amps: number,
  // 预留：OVP/OCP 工程值确认后接入（见文件头注释）
  _protection: Protection | null,
): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  if (volts >= DEVICE_LIMITS.V_MAX) {
    warnings.push({
      field: 'voltage',
      message: `电压已达设备上限 ${DEVICE_LIMITS.V_MAX}V，确认要继续吗？`,
    });
  }
  if (amps >= DEVICE_LIMITS.I_MAX) {
    warnings.push({
      field: 'current',
      message: `电流已达设备上限 ${DEVICE_LIMITS.I_MAX}A，确认要继续吗？`,
    });
  }
  return warnings;
}
