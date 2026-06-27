/**
 * 设备层数据模型 —— 系统信息 / 实时遥测 / 保护设置 / 预设组。
 *
 * 依据：RK6006H_Bluetooth_Protocol_Analysis.md §5 / §7.6（真机确认）。
 */

// ─── 系统信息（0x0000 ~ 0x0003，只读固定）──────────────────────
export interface DeviceInfo {
  /** 设备标识高字（0x0000） */
  modelHigh: number;
  /** 固件版本原始值（0x0002），如 0x0231 = 561 */
  firmwareRaw: number;
}

/** 固件版本原始值 → 可读字符串（561 → v5.61） */
export function formatFirmware(raw: number): string {
  const major = Math.floor(raw / 100);
  const minor = raw % 100;
  return `v${major}.${String(minor).padStart(2, '0')}`;
}

// ─── 实时遥测（主轮询窗口解码结果）──────────────────────────────
export interface Telemetry {
  /** 设定电压（V） */
  voltageSetpoint: number;
  /** 设定电流（A） */
  currentSetpoint: number;
  /** 输出使能（0x0012：true = ON） */
  outputOn: boolean;
  /** 实际电压（V） */
  voltageActual: number;
  /** 实际电流（A） */
  currentActual: number;
  /** 实际功率（W，由 V×I 计算得，比 0x000C 原始值可靠） */
  powerActual: number;
  /** 内部温度（℃） */
  temperature: number;
  /** 解码时刻（ms，epoch） */
  timestamp: number;
}

// ─── 保护设置（0x0037 ~ 0x0040，每项 threshold + raw）──────────
export interface ProtectionEntry {
  /** 阈值（原始读数；工程值含义待确认） */
  threshold: number;
  /** 原始系数字段 */
  raw: number;
}

export interface Protection {
  ovp: ProtectionEntry; // 过压保护
  ocp: ProtectionEntry; // 过流保护
  oah: ProtectionEntry; // 过充 Ah
  oph: ProtectionEntry; // 过功 Wh
  overtime: ProtectionEntry; // 超时
}

// ─── 预设组 M0~M2（FC10 写 0x0030 共 6 寄存器，地址未真机验证）─
export interface Preset {
  /** 预设电压（V） */
  voltage: number;
  /** 预设电流（A） */
  current: number;
}
