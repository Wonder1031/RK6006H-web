/**
 * 类型安全的 localStorage 封装 —— 设置持久化。
 *
 * 用 JSON 序列化；提供带默认值的读取，避免异常导致应用崩溃。
 */

const PREFIX = 'rk6006h:';

export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
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
  decodeMode: 'decodeMode',
  mock: 'mock',
} as const;
