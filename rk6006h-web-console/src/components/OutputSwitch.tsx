/** 输出开关 —— 控制 0x0012 寄存器（ON/OFF）。 */

import { useState } from "react";
import { useDeviceStore } from "@/store/deviceStore";
import { maybeConfirm } from "@/utils/confirm";

export function OutputSwitch() {
  const telemetry = useDeviceStore((s) => s.telemetry);
  const connected = useDeviceStore((s) => s.status === "connected");
  const isMock = useDeviceStore((s) => s.isMock);
  const setOutput = useDeviceStore((s) => s.setOutput);
  const [pending, setPending] = useState(false);

  const on = telemetry?.outputOn ?? false;

  async function toggle() {
    if (pending || !connected) return;
    // 关输出前二次确认（带载场景误关风险高）；开输出无需确认
    if (
      on &&
      !(await maybeConfirm(isMock, "确认关闭输出？（带载时可能影响被测设备）", {
        variant: "danger",
        confirmText: "关闭输出",
        dontAskKey: "output-off",
      }))
    ) {
      return;
    }
    setPending(true);
    try {
      await setOutput(!on);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!connected || pending}
      data-testid="output-toggle"
      className={[
        "w-full rounded-lg px-4 py-3 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-40",
        on
          ? "bg-accent-ok text-white hover:brightness-110"
          : "bg-surface-raised text-ink hover:bg-overlay/10",
      ].join(" ")}
    >
      {pending
        ? "切换中…"
        : on
          ? "● 输出已开启（点击关闭）"
          : "○ 输出已关闭（点击开启）"}
    </button>
  );
}
