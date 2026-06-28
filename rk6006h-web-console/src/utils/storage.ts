/**
 * 类型安全的 localStorage 封装 —— 设置持久化。
 *
 * 用 JSON 序列化；提供带默认值的读取，避免异常导致应用崩溃。
 * 读取持久化数据（预设/设定值等可被篡改的内容）时务必传 validate 做范围校验，
 * 防止 localStorage 被注入危险/越界值（升级方案 §3.4 安全）。
 */

const PREFIX = "rk6006h:";

/**
 * 读取并反序列化设置。
 * @param validate 可选校验/净化函数：对解析结果做结构与范围校验后返回安全值。
 *                 传入后即使 localStorage 被篡改也只会回退到 fallback，不会写入危险值。
 */
export function loadSetting<T>(
  key: string,
  fallback: T,
  validate?: (parsed: unknown) => T,
): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate ? validate(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

export function saveSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 忽略写入失败（隐私模式 / 配额满）
  }
}

export const SettingKey = {
  decodeMode: "decodeMode",
  mock: "mock",
  /** 最后一次设定值 { voltage, current }（刷新后恢复） */
  lastSetpoint: "lastSetpoint",
  /** 预设组 M0~M2（刷新后恢复） */
  presets: "presets",
  /** 主题：'light' | 'dark'（刷新后恢复） */
  theme: "theme",
  /** 是否开启告警声音（刷新后恢复） */
  sound: "sound",
  /** dialog「不再提醒」已确认的 key 列表（持久化） */
  dontAsk: "dontAsk",
} as const;
