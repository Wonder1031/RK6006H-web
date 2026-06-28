/**
 * 全局快捷键（升级方案 P1-11）。
 *
 * 约定：当焦点在输入控件（input/textarea/select/button/contentEditable）时
 * 不拦截，避免与文本输入 / 按钮默认行为冲突。handlers 用 ref 持有最新值，
 * 监听器只注册一次。
 */

import { useEffect, useRef } from 'react';

export type KeyHandlers = Record<string, () => void>;

const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

function shouldSkip(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return SKIP_TAGS.has(el.tagName) || el.isContentEditable;
}

export function useHotkeys(handlers: KeyHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // 不拦截组合键
      if (shouldSkip(e.target)) return;
      const handler = ref.current[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
