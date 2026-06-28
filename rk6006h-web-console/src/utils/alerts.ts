/**
 * 告警：桌面通知 + 蜂鸣（升级方案 P1-5）。
 *
 * ⚠️ 计划中的 OVP/OCP 阈值越限告警依赖保护寄存器工程值逆向（仍未确认，
 *    见 [[rk6006h-protocol-doc-errata]] / 协议 §12.2）。当前先提供告警基础设施
 *    + 「输出异常断开（疑似触发保护）」检测；阈值确认后接入 protection 比对即可。
 *
 * 浏览器限制：通知需用户手势授权；AudioContext 需用户交互后才能发声。
 */

import { loadSetting, saveSetting, SettingKey } from './storage';

/** 告警声音是否开启（持久化）。 */
export function isSoundEnabled(): boolean {
  return loadSetting<boolean>(SettingKey.sound, false);
}

export function setSoundEnabled(v: boolean): void {
  saveSetting(SettingKey.sound, v);
}

/** 请求桌面通知权限（须在用户手势内调用）。返回是否已授权。 */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const r = await Notification.requestPermission();
  return r === 'granted';
}

/** 发桌面通知（已授权才发；失败静默）。 */
export function notify(title: string, body?: string): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'rk6006h' });
    }
  } catch {
    // 忽略：通知不可用不阻断主流程
  }
}

let audioCtx: AudioContext | null = null;

/** 短促蜂鸣（仅当声音开启）。 */
export function beep(freq = 880, ms = 220): void {
  if (!isSoundEnabled()) return;
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.value = freq;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.start(t);
    o.stop(t + ms / 1000);
  } catch {
    // 忽略：AudioContext 不可用
  }
}

/** 触发一次完整告警：通知 + 蜂鸣。 */
export function triggerAlert(title: string, body?: string): void {
  notify(title, body);
  beep();
}
