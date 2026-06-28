/**
 * RK6006H 寄存器地址映射（2026-06-27 真机实测确认）。
 *
 * ⚠️ 重要勘误：源文档 §5.1/§5.2 把 0x0008/0x0009 误标为"缩放系数 1200/5978"，
 *    实测它们是电压/电流【设定值】本身（标准 Riden 编码 V/100、A/1000）。
 *    设定值/实测区也不在 §5.2 所标的 0x0010~0x0019，而在 0x0008~0x000C。
 *    详见 RK6006H_Bluetooth_Protocol_Analysis.md §7.6。
 *
 * 验证依据：面板设 25.00V/3.500A → 0x0008=2500、0x0009=3500；
 *          写 0x0008=1000 → 面板显示 10.00V；输出 ON → 0x0012=1、0x000A 出现实测电压。
 */

// ─── 工程值换算除数（标准 Riden 编码，真机确认）──────────────
export const V_DIVISOR = 100; // 电压：2 位小数（centi-volts）
export const I_DIVISOR = 1000; // 电流：3 位小数（milli-amps）
export const TEMP_DIVISOR = 100; // 温度：2 位小数

export const REG = {
  // ── 系统信息（只读，固定）──
  // 真机确认（2026-06-28 用户反馈）：序列号是 32 位，跨 0x0001(高字)+0x0002(低字)；
  // 固件版本在 0x0003。原误判：曾把 0x0002(=561) 当固件、0x0003(=114) 当序列号。
  MODEL_HIGH: 0x0000,
  SERIAL_HIGH: 0x0001, // 序列号高字
  SERIAL_LOW: 0x0002, // 序列号低字（实测 0x0231=561 → 序列号 00000561）
  FIRMWARE: 0x0003, // 固件版本（实测 0x0072=114 → V1.14）

  // ── 设定 / 实测 / 状态（活值，主轮询覆盖）──
  V_SETPOINT: 0x0008, // ★ 电压设定（/100）—— 原 §5.1 误标为"电压系数"
  I_SETPOINT: 0x0009, // ★ 电流设定（/1000）—— 原 §5.1 误标为"电流系数"
  V_ACTUAL: 0x000a, // 实测电压（/100）
  I_ACTUAL: 0x000b, // 实测电流（/1000）
  P_ACTUAL: 0x000c, // 实测功率（原始；UI 用 V×I 计算更可靠）
  P_ACTUAL_RESERVED: 0x000d, // 未确认
  TEMPERATURE: 0x000e, // ★ 温度（/100），实测 0x0AEE ≈ 27.98℃
  OUTPUT_ON: 0x0012, // ★ 输出开关：1=ON, 0=OFF（写验证通过）

  // ── 保护设置区 0x0037 ~ 0x0040（每项 threshold + raw，§7.3 确认）──
  OVP_THRESHOLD: 0x0037,
  OVP_RAW: 0x0038,
  OCP_THRESHOLD: 0x0039,
  OCP_RAW: 0x003a,
  OAH_THRESHOLD: 0x003b,
  OAH_RAW: 0x003c,
  OPH_THRESHOLD: 0x003d,
  OPH_RAW: 0x003e,
  OVT_THRESHOLD: 0x003f,
  OVT_RAW: 0x0040,

  // ── 预设组（§6.3 静态提取：FC10 写 0x0030 共 6 寄存器 = M0~M2）──
  // ⚠️ 未在真机验证（§5.2 其它地址已证伪，此地址存疑，写入需谨慎）
  PRESET_BASE: 0x0030,
  PRESET_COUNT: 6,
} as const;

/** 保护区读取参数（FC03 读 0x0037 起 10 个寄存器） */
export const PROTECTION_READ = {
  start: REG.OVP_THRESHOLD,
  count: 10,
} as const;
