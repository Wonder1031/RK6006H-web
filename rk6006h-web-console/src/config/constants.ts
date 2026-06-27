/**
 * 全局常量 —— BLE / Modbus 传输层与轮询参数。
 *
 * 依据：RK6006H_Bluetooth_Protocol_Analysis.md §2.2 / §3 / §5.4
 */

// ─── BLE GATT 标识 ───────────────────────────────────────────────
/** HM-10 系列透传 UART 服务 */
export const BLE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
/** 数据通道（写 + 通知共用同一特征值） */
export const BLE_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

/** 广播设备名前缀（实测设备名 "RK6006"） */
export const DEVICE_NAME_PREFIX = 'RK6006';

// ─── Modbus 应用层 ───────────────────────────────────────────────
/** 固定从机地址 */
export const MODBUS_SLAVE_ADDRESS = 0x01;

/** 默认请求超时（ms） */
export const MODBUS_TIMEOUT_MS = 2000;

// ─── 轮询参数 ────────────────────────────────────────────────────
/** 主轮询窗口：0x0004 起 38 个寄存器（一次性获取全部状态） */
export const POLL_START_ADDRESS = 0x0004;
export const POLL_REGISTER_COUNT = 38;
/** 默认轮询周期（ms） */
export const POLL_INTERVAL_MS = 1000;

// ─── 报文日志 ────────────────────────────────────────────────────
/** Console 环形缓冲最大条目数 */
export const FRAME_LOG_MAX = 1000;

/** 趋势曲线历史采样点数（1s 轮询下约 2 分钟） */
export const HISTORY_MAX = 120;

// ─── 设备量程（RK6006H：60V / 6A）──────────────────────────────
export const DEVICE_LIMITS = {
  /** 最大电压（V） */
  V_MAX: 60,
  /** 最大电流（A） */
  I_MAX: 6,
  /** 电压调节步进（V） */
  V_STEP: 0.01,
  /** 电流调节步进（A） */
  I_STEP: 0.001,
} as const;
