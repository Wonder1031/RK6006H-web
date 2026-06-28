/**
 * 主题（浅色 / 深色）切换 —— 升级方案 P1-2。
 *
 * 通过设置 documentElement.dataset.theme 驱动 global.css 中的 CSS 变量覆盖。
 * 优先级：已保存的手动选择 > 系统偏好（prefers-color-scheme）> 深色。
 */

import { loadSetting, saveSetting, SettingKey } from './storage';

export type Theme = 'light' | 'dark';

const PREFERS_LIGHT =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: light)').matches;

/** 当前生效主题（读取 documentElement 上的 data-theme，缺省按系统/深色）。 */
export function getTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'light' || attr === 'dark') return attr;
  return PREFERS_LIGHT ? 'light' : 'dark';
}

/** 应用主题到 <html data-theme> 并持久化。 */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  saveSetting(SettingKey.theme, theme);
}

/** 切换并返回新主题。 */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}

/**
 * 启动时初始化主题：读已保存选择，无则用系统偏好。
 * 在应用挂载前调用，避免闪烁。
 */
export function initTheme(): void {
  const saved = loadSetting<Theme | null>(SettingKey.theme, null);
  setTheme(saved ?? (PREFERS_LIGHT ? 'light' : 'dark'));
}
