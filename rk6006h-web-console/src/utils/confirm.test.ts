// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeConfirm, maybeAlert } from "./confirm";
import { useDialogStore } from "@/store/dialogStore";

afterEach(() => {
  vi.restoreAllMocks();
  // 重置 dialog store，避免跨用例污染
  useDialogStore.setState({ current: null });
  localStorage.clear();
});

describe("maybeConfirm", () => {
  it("Mock 模式直接放行，不弹窗", async () => {
    const spy = vi.spyOn(useDialogStore.getState(), "confirm");
    const ok = await maybeConfirm(true, "危险操作");
    expect(ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("真机模式调用 dialogStore.confirm", async () => {
    const spy = vi
      .spyOn(useDialogStore.getState(), "confirm")
      .mockResolvedValue(true);
    const ok = await maybeConfirm(false, "危险操作", { variant: "danger" });
    expect(ok).toBe(true);
    expect(spy).toHaveBeenCalledWith({
      message: "危险操作",
      variant: "danger",
    });
  });

  it("透传 dontAskKey", async () => {
    const spy = vi
      .spyOn(useDialogStore.getState(), "confirm")
      .mockResolvedValue(false);
    await maybeConfirm(false, "x", { dontAskKey: "test-key" });
    expect(spy).toHaveBeenCalledWith({
      message: "x",
      dontAskKey: "test-key",
    });
  });
});

describe("maybeAlert", () => {
  it("调用 dialogStore.alert", async () => {
    const spy = vi
      .spyOn(useDialogStore.getState(), "alert")
      .mockResolvedValue(undefined);
    await maybeAlert("提示内容", { variant: "warn" });
    expect(spy).toHaveBeenCalledWith({
      message: "提示内容",
      variant: "warn",
    });
  });
});

describe("dialogStore — 不再提醒", () => {
  beforeEach(() => {
    localStorage.clear();
    useDialogStore.setState({ current: null });
  });

  it("dontAskKey 未记录时正常弹窗", async () => {
    const p = useDialogStore.getState().confirm({
      message: "确认？",
      dontAskKey: "my-op",
    });
    // 应该出现了 dialog
    expect(useDialogStore.getState().current).not.toBeNull();
    // 用户确认 + 勾选不再提醒
    useDialogStore
      .getState()
      .resolve(useDialogStore.getState().current!.id, true, true);
    expect(await p).toBe(true);
  });

  it("dontAskKey 已记录后自动放行，不再弹窗", async () => {
    // 预置一个"已确认不再提醒"
    localStorage.setItem("rk6006h:dontAsk", JSON.stringify(["my-op"]));
    const p = useDialogStore.getState().confirm({
      message: "确认？",
      dontAskKey: "my-op",
    });
    // 不应出现 dialog
    expect(useDialogStore.getState().current).toBeNull();
    expect(await p).toBe(true);
  });

  it('用户取消时不记录"不再提醒"', async () => {
    const p = useDialogStore.getState().confirm({
      message: "确认？",
      dontAskKey: "cancel-op",
    });
    // 取消（result=false），即使勾选也不记录
    useDialogStore
      .getState()
      .resolve(useDialogStore.getState().current!.id, false, true);
    expect(await p).toBe(false);
    // 下次该 key 仍会弹窗
    const p2 = useDialogStore.getState().confirm({
      message: "确认？",
      dontAskKey: "cancel-op",
    });
    expect(useDialogStore.getState().current).not.toBeNull();
    useDialogStore
      .getState()
      .resolve(useDialogStore.getState().current!.id, true, false);
    expect(await p2).toBe(true);
  });
});
