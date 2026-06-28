/** 连接面板 —— 设备连接 / 断开 / Mock 开关 / 状态指示。 */

import { useState } from "react";
import { useDeviceStore } from "@/store/deviceStore";
import { POLL_UNSTABLE_THRESHOLD } from "@/config/constants";
import { formatFirmware, formatSerial } from "@/types/device";
import { loadSetting, saveSetting, SettingKey } from "@/utils/storage";

const STATUS_LABEL: Record<string, { text: string; dot: string }> = {
  disconnected: { text: "未连接", dot: "bg-ink-faint" },
  connecting: { text: "连接中…", dot: "bg-accent-warn animate-pulse" },
  connected: { text: "已连接", dot: "bg-accent-ok" },
  error: { text: "错误", dot: "bg-accent-danger" },
};

/** 连接步骤 → 可读说明（P1-8）。 */
const CONNECT_STEP_TEXT: Record<string, string> = {
  link: "建立蓝牙链路…",
  info: "读取系统信息…",
  protection: "读取保护设置…",
  live: "读取实时遥测…",
};

export function ConnectionPanel() {
  const status = useDeviceStore((s) => s.status);
  const connectStep = useDeviceStore((s) => s.connectStep);
  const error = useDeviceStore((s) => s.error);
  const deviceName = useDeviceStore((s) => s.deviceName);
  const isMock = useDeviceStore((s) => s.isMock);
  const info = useDeviceStore((s) => s.info);
  const pollFailures = useDeviceStore((s) => s.pollFailures);
  const lastException = useDeviceStore((s) => s.lastException);
  const connect = useDeviceStore((s) => s.connect);
  const disconnect = useDeviceStore((s) => s.disconnect);
  const clearError = useDeviceStore((s) => s.clearError);
  const injectFault = useDeviceStore((s) => s.injectFault);

  const [mock, setMockState] = useState(() =>
    loadSetting<boolean>(SettingKey.mock, false),
  );
  const setMock = (v: boolean) => {
    setMockState(v);
    saveSetting(SettingKey.mock, v);
  };
  const busy = status === "connecting";
  const st = STATUS_LABEL[status] ?? { text: "未连接", dot: "bg-ink-faint" };
  const unstable =
    status === "connected" && pollFailures >= POLL_UNSTABLE_THRESHOLD;

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">设备连接</h2>
        <span className="flex items-center gap-2 text-xs text-ink-muted">
          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
          {st.text}
          {isMock && status === "connected" && (
            <span className="rounded bg-accent/20 px-1 text-accent">MOCK</span>
          )}
        </span>
      </div>

      {status === "connecting" && connectStep && (
        <div className="text-xs text-ink-muted">
          {CONNECT_STEP_TEXT[connectStep] ?? "连接中…"}
        </div>
      )}

      {deviceName && (
        <div className="flex flex-col gap-0.5 text-xs text-ink-muted">
          <span>
            {deviceName}
            {info && (
              <span className="ml-2">
                固件 {formatFirmware(info.firmwareRaw)}
              </span>
            )}
          </span>
          {info && (
            <span className="text-ink-faint">
              序列号 {formatSerial(info.serialRaw)}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded border border-accent-danger/40 bg-accent-danger/10 px-2 py-1.5 text-xs text-accent-danger">
          {error}
          <button
            type="button"
            onClick={clearError}
            className="ml-2 underline hover:no-underline"
          >
            知道了
          </button>
        </div>
      )}

      {unstable && (
        <div className="rounded border border-accent-warn/40 bg-accent-warn/10 px-2 py-1.5 text-xs text-accent-warn">
          ⚠ 通信不稳定：连续 {pollFailures} 次轮询失败
          {lastException ? `（最近异常：${lastException}）` : ""}
        </div>
      )}

      {/* Mock 开关（开发用，无硬件时勾选可离线演示） */}
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={mock}
          disabled={status === "connected" || busy}
          onChange={(e) => setMock(e.target.checked)}
          className="accent-accent"
        />
        使用 Mock 设备（离线演示）
      </label>

      {/* Mock 故障注入（离线演示通信异常，验证错误反馈） */}
      {isMock && status === "connected" && (
        <div className="flex flex-col gap-1 rounded border border-overlay/5 bg-overlay/5 p-2">
          <span className="text-[11px] text-ink-muted">故障注入（Mock）</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => injectFault({ type: "exception" })}
              className="rounded bg-overlay/5 px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10"
            >
              异常帧
            </button>
            <button
              type="button"
              onClick={() => injectFault({ type: "crc" })}
              className="rounded bg-overlay/5 px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10"
            >
              CRC 错
            </button>
            <button
              type="button"
              onClick={() => injectFault({ type: "silent" })}
              className="rounded bg-overlay/5 px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10"
            >
              无响应
            </button>
            <button
              type="button"
              onClick={() => injectFault({ type: "none" })}
              className="rounded bg-accent/20 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/30"
            >
              恢复
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void connect({ mock })}
          disabled={busy || status === "connected"}
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          连接
        </button>
        <button
          type="button"
          onClick={() => void disconnect()}
          disabled={busy || status === "disconnected"}
          className="flex-1 rounded-lg bg-surface-raised px-3 py-2 text-sm font-medium text-ink transition hover:bg-overlay/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          断开
        </button>
      </div>
    </div>
  );
}
