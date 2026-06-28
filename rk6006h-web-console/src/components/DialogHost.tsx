/**
 * DialogHost —— 全局对话框宿主。
 *
 * 在 App 根挂载一次，订阅 dialogStore，渲染当前活跃的 confirm / alert。
 * 与原生 window.confirm/alert 行为一致，但完全融入主题、支持"不再提醒"。
 *
 * 由 src/store/dialogStore.ts 驱动；调用方用 src/utils/confirm.ts 的 maybeConfirm
 * 或 useDialogStore 的 confirm/alert。
 */

import { useEffect, useState } from "react";
import { useDialogStore } from "@/store/dialogStore";
import { Modal } from "./Modal";
import type {
  DialogVariant,
  ConfirmOptions,
  AlertOptions,
} from "@/store/dialogStore";

/** 变体 → 标题色 / 确认按钮配色 / 图标 */
const VARIANT_STYLES: Record<
  DialogVariant,
  { title: string; confirmBtn: string; icon: string }
> = {
  default: {
    title: "text-ink",
    confirmBtn:
      "bg-accent text-white hover:brightness-110 focus-visible:ring-accent",
    icon: "",
  },
  danger: {
    title: "text-accent-danger",
    confirmBtn:
      "bg-accent-danger text-white hover:brightness-110 focus-visible:ring-accent-danger",
    icon: "⚠ ",
  },
  warn: {
    title: "text-accent-warn",
    confirmBtn:
      "bg-accent-warn text-white hover:brightness-110 focus-visible:ring-accent-warn",
    icon: "⚠ ",
  },
};

/** 从联合 options 安全取字段 */
function getOpts(options: ConfirmOptions | AlertOptions, isConfirm: boolean) {
  if (isConfirm) {
    const o = options as ConfirmOptions;
    return {
      title: o.title,
      variant: (o.variant ?? "default") as DialogVariant,
      message: o.message,
      confirmText: o.confirmText,
      cancelText: o.cancelText,
    };
  }
  const o = options as AlertOptions;
  return {
    title: o.title,
    variant: (o.variant ?? "default") as DialogVariant,
    message: o.message,
    confirmText: undefined as string | undefined,
    cancelText: undefined as string | undefined,
  };
}

export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const resolve = useDialogStore((s) => s.resolve);
  const [dontAsk, setDontAsk] = useState(false);

  // 当前 dialog 切换时复位 checkbox
  useEffect(() => {
    setDontAsk(false);
  }, [current?.id]);

  if (!current) return null;

  const isConfirm = current.kind === "confirm";
  const o = getOpts(current.options, isConfirm);
  const vs = VARIANT_STYLES[o.variant];
  const title = o.title ?? (isConfirm ? "请确认" : "提示");

  const handleClose = (result: boolean) => {
    resolve(current.id, result, isConfirm ? dontAsk : false);
  };

  return (
    <Modal open onClose={() => handleClose(false)} dismissible={isConfirm}>
      <div className="flex flex-col gap-3">
        <h2 className={`text-base font-semibold ${vs.title}`}>
          {vs.icon}
          {title}
        </h2>
        <p className="whitespace-pre-line text-sm text-ink-muted">
          {o.message}
        </p>

        {current.showDontAsk && (
          <label className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="accent-accent"
            />
            不再提醒
          </label>
        )}

        <div className="mt-2 flex justify-end gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="rounded-lg border border-overlay/10 bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted transition hover:bg-overlay/10 focus-visible:outline-none focus-visible:ring-2"
            >
              {o.cancelText ?? "取消"}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleClose(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 ${vs.confirmBtn}`}
          >
            {isConfirm
              ? (o.confirmText ?? "确认")
              : ((current.options as AlertOptions).okText ?? "知道了")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
