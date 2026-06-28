/**
 * App 根组件 —— RK6006H Web 上位机主布局。
 *
 * 左：连接 + 设定控制；右：仪表盘 + 标签页（保护 / 预设 / 控制台）。
 */

import { useState } from "react";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { Dashboard } from "@/components/Dashboard";
import { SetpointControl } from "@/components/SetpointControl";
import { ProtectionPanel } from "@/components/ProtectionPanel";
import { PresetPanel } from "@/components/PresetPanel";
import { Console } from "@/components/Console";
import { HistoryPanel } from "@/components/HistoryPanel";
import { DialogHost } from "@/components/DialogHost";
import { useDeviceStore } from "@/store/deviceStore";
import { getTheme, toggleTheme } from "@/utils/theme";
import { ensureNotifyPermission } from "@/utils/alerts";
import { useHotkeys } from "@/hooks/useHotkeys";

type Tab = "protection" | "preset" | "console" | "history";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "protection", label: "保护设置" },
  { id: "preset", label: "预设组" },
  { id: "console", label: "报文控制台" },
  { id: "history", label: "历史会话" },
];

export default function App() {
  const connected = useDeviceStore((s) => s.status === "connected");
  const activeAlert = useDeviceStore((s) => s.activeAlert);
  const dismissAlert = useDeviceStore((s) => s.dismissAlert);
  const soundEnabled = useDeviceStore((s) => s.soundEnabled);
  const setSound = useDeviceStore((s) => s.setSound);
  const [tab, setTab] = useState<Tab>("protection");
  const [theme, setTheme] = useState(() => getTheme());

  async function toggleSound() {
    const next = !soundEnabled;
    if (next) await ensureNotifyPermission(); // 开启时顺带请求通知授权（用户手势内）
    setSound(next);
  }

  // 全局快捷键（焦点在输入控件时不拦截）：空格切输出、1~4 切标签
  useHotkeys({
    " ": () => {
      if (!connected) return;
      document
        .querySelector<HTMLElement>('[data-testid="output-toggle"]')
        ?.click();
    },
    "1": () => setTab("protection"),
    "2": () => setTab("preset"),
    "3": () => setTab("console"),
    "4": () => setTab("history"),
  });

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">RK6006H Web 上位机</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-xs text-ink-faint sm:inline">
            Modbus RTU over BLE
          </span>
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? "关闭告警声音/通知" : "开启告警声音/通知"}
            className={[
              "rounded-md border border-overlay/10 px-2 py-1 text-xs transition",
              soundEnabled
                ? "bg-accent-warn/20 text-accent-warn"
                : "bg-surface-raised text-ink-muted hover:bg-overlay/10",
            ].join(" ")}
          >
            {soundEnabled ? "🔔 告警开" : "🔕 告警关"}
          </button>
          <button
            type="button"
            onClick={() => setTheme(toggleTheme())}
            title={theme === "light" ? "切换到深色" : "切换到浅色"}
            className="rounded-md border border-overlay/10 bg-surface-raised px-2 py-1 text-xs text-ink-muted transition hover:bg-overlay/10"
          >
            {theme === "light" ? "🌙 深色" : "☀ 浅色"}
          </button>
        </div>
      </header>

      {activeAlert && (
        <div
          role="alert"
          className="flex animate-pulse items-center justify-between rounded-lg border border-accent-danger/50 bg-accent-danger/15 px-3 py-2 text-sm text-accent-danger"
        >
          <span>
            <span className="font-semibold">{activeAlert.title}</span>
            {activeAlert.body && (
              <span className="ml-2 text-accent-danger/80">
                {activeAlert.body}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={dismissAlert}
            className="ml-3 rounded px-2 py-0.5 text-xs underline hover:no-underline"
          >
            知道了
          </button>
        </div>
      )}

      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <ConnectionPanel />
          {connected && <SetpointControl />}
        </aside>

        <section className="flex min-w-0 flex-col gap-4 overflow-y-auto">
          {connected ? (
            <>
              <Dashboard />

              <div className="panel flex flex-col gap-3">
                <div className="flex gap-1 border-b border-overlay/5 pb-2">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={[
                        "rounded px-3 py-1 text-xs transition",
                        tab === t.id
                          ? "bg-accent text-white"
                          : "text-ink-muted hover:text-ink",
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === "protection" && <ProtectionPanel />}
                {tab === "preset" && <PresetPanel />}
                {tab === "console" && <Console />}
                {tab === "history" && <HistoryPanel />}
              </div>
            </>
          ) : (
            <div className="panel flex h-full items-center justify-center text-sm text-ink-muted">
              请先连接设备（无硬件可勾选 Mock 演示）
            </div>
          )}
        </section>
      </main>

      <DialogHost />
    </div>
  );
}
