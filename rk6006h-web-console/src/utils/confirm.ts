/**
 * 危险操作二次确认（单一来源）。
 *
 * Mock 模式自动放行（便于自动化测试与离线演示，不打断流程）；
 * 真机模式弹出自定义 ConfirmDialog（融入主题、支持「不再提醒」）。
 *
 * 异步：自定义弹窗无法同步阻塞，所有调用方需 `await maybeConfirm(...)`。
 */

import { useDialogStore } from "@/store/dialogStore";
import type { ConfirmOptions } from "@/store/dialogStore";

/**
 * 弹出二次确认。
 * @param isMock Mock 模式直接放行（不弹窗）
 * @param message 确认消息（纯文本，支持 \n 换行）
 * @param opts 可选：变体/标题/按钮文案/「不再提醒」key
 * @returns 用户是否确认
 */
export async function maybeConfirm(
  isMock: boolean,
  message: string,
  opts?: Omit<ConfirmOptions, "message">,
): Promise<boolean> {
  if (isMock) return true;
  return useDialogStore.getState().confirm({ message, ...opts });
}

/**
 * 弹出提示框（替代 window.alert）。
 * @returns 用户点「知道了」后 resolve
 */
export async function maybeAlert(
  message: string,
  opts?: Omit<import("@/store/dialogStore").AlertOptions, "message">,
): Promise<void> {
  return useDialogStore.getState().alert({ message, ...opts });
}
