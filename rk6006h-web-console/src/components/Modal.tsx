/**
 * 通用模态组件 —— 遮罩 + 居中卡片 + 过渡动画。
 *
 * 完全由 CSS 变量 token 驱动，深/浅主题自动适配。
 * 动画：淡入 + 轻微上移（150ms，不拖沓），离开反之。使用 CSS animation 而非
 * transition + state，避免 React 渲染节拍导致首帧闪烁。
 *
 * 可访问性：role="dialog" + aria-modal，ESC 关闭，点遮罩关闭，自动聚焦。
 */

import { useEffect, useRef } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** ESC / 遮罩点击是否允许关闭（confirm 二次确认场景可禁用避免误关） */
  dismissible?: boolean;
  /** 卡片最大宽度（px） */
  maxWidth?: number;
  children: React.ReactNode;
  /** 供 Inert 锚定（聚焦起点） */
  'aria-labelledby'?: string;
}

export function Modal({
  open,
  onClose,
  dismissible = true,
  maxWidth = 420,
  children,
  ...rest
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // ESC 关闭 + body 滚动锁
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 聚焦卡片，便于键盘操作
    cardRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="modal-card"
        style={{ maxWidth, width: '100%' }}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}
