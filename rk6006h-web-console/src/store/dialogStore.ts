/**
 * 全局对话框 store —— confirm / alert 的统一入口（替代原生 window.confirm/alert）。
 *
 * 设计：
 *  - 全局单例队列：任意组件 `await confirm({...})` 即可弹窗，无需自己渲染。
 *  - 异步等待：confirm/alert 返回 Promise，由 DialogHost 解析。
 *  - "不再提醒"：可选项，勾选后该 key 的 confirm 自动放行（持久化）。
 *
 * 配套组件：src/components/DialogHost.tsx（在 App 根挂载一次）。
 */

import { create } from 'zustand';
import { loadSetting, saveSetting, SettingKey } from '@/utils/storage';

export type DialogVariant = 'default' | 'danger' | 'warn';

export interface ConfirmOptions {
  title?: string;
  message: string;
  /** 视觉变体：danger=红色强调（如关闭输出），warn=黄色（如超阈值） */
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
  /**
   * "不再提醒"的持久化 key。传入后显示复选框；
   * 用户勾选确认后，该 key 的后续 confirm 自动返回 true（不再弹窗）。
   */
  dontAskKey?: string;
}

export interface AlertOptions {
  title?: string;
  message: string;
  variant?: DialogVariant;
  okText?: string;
}

/** 当前活跃的 dialog（同时只显示一个；后续调用排队） */
interface ActiveDialog {
  id: number;
  kind: 'confirm' | 'alert';
  resolve: (v: boolean | void) => void;
  options: ConfirmOptions | AlertOptions;
  /** 是否展示"不再提醒"复选框（仅 confirm 且传了 dontAskKey 时） */
  showDontAsk: boolean;
  dontAskKey?: string;
}

interface DialogState {
  current: ActiveDialog | null;
  /** 已确认"不再提醒"的 key 集合（运行时缓存，避免每次读 localStorage） */
  suppressed: Set<string>;

  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  alert: (opts: AlertOptions) => Promise<void>;
  /** 由 DialogHost 在用户操作后调用 */
  resolve: (id: number, result: boolean, dontAskChecked: boolean) => void;
}

let nextId = 1;

/** 检查某 dontAskKey 是否已被用户"不再提醒"。 */
function isSuppressed(key: string): boolean {
  try {
    const arr = loadSetting<string[]>(SettingKey.dontAsk, []);
    return Array.isArray(arr) && arr.includes(key);
  } catch {
    return false;
  }
}

/** 记录用户选择"不再提醒"。 */
function addSuppressed(key: string): void {
  try {
    const arr = loadSetting<string[]>(SettingKey.dontAsk, []);
    const next = Array.isArray(arr) ? Array.from(new Set([...arr, key])) : [key];
    saveSetting(SettingKey.dontAsk, next);
  } catch {
    // 忽略写入失败
  }
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  suppressed: new Set(),

  confirm: (opts) => {
    // "不再提醒"短路：若该 key 已被确认，直接放行
    if (opts.dontAskKey && isSuppressed(opts.dontAskKey)) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      // 排队：若当前已有 dialog，等它结束后再弹（链式 then）
      const prev = get().current;
      const spawn = () => {
        set({
          current: {
            id: nextId++,
            kind: 'confirm',
            resolve: (v) => resolve(v as boolean),
            options: opts,
            showDontAsk: !!opts.dontAskKey,
            dontAskKey: opts.dontAskKey,
          },
        });
      };
      if (!prev) {
        spawn();
      } else {
        // 等当前 dialog 解析后启动下一个
        const origResolve = prev.resolve;
        prev.resolve = (v) => {
          origResolve(v);
          spawn();
        };
      }
    });
  },

  alert: (opts) => {
    return new Promise<void>((resolve) => {
      const prev = get().current;
      const spawn = () => {
        set({
          current: {
            id: nextId++,
            kind: 'alert',
            resolve: () => resolve(),
            options: opts,
            showDontAsk: false,
          },
        });
      };
      if (!prev) {
        spawn();
      } else {
        const origResolve = prev.resolve;
        prev.resolve = (v) => {
          origResolve(v);
          spawn();
        };
      }
    });
  },

  resolve: (id, result, dontAskChecked) => {
    const cur = get().current;
    if (!cur || cur.id !== id) return;
    // "不再提醒"：仅在用户确认（result=true）且勾选时记录
    if (result && dontAskChecked && cur.dontAskKey) {
      addSuppressed(cur.dontAskKey);
      get().suppressed.add(cur.dontAskKey);
    }
    set({ current: null });
    cur.resolve(result);
  },
}));
