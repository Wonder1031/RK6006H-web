/** 连接面板 —— 设备连接 / 断开 / Mock 开关 / 状态指示。 */

import { useState } from 'react';
import { useDeviceStore } from '@/store/deviceStore';
import { formatFirmware } from '@/types/device';
import { loadSetting, saveSetting, SettingKey } from '@/utils/storage';

const STATUS_LABEL: Record<string, { text: string; dot: string }> = {
  disconnected: { text: '未连接', dot: 'bg-slate-500' },
  connecting: { text: '连接中…', dot: 'bg-accent-warn animate-pulse' },
  connected: { text: '已连接', dot: 'bg-accent-ok' },
  error: { text: '错误', dot: 'bg-accent-danger' },
};

export function ConnectionPanel() {
  const status = useDeviceStore((s) => s.status);
  const error = useDeviceStore((s) => s.error);
  const deviceName = useDeviceStore((s) => s.deviceName);
  const isMock = useDeviceStore((s) => s.isMock);
  const info = useDeviceStore((s) => s.info);
  const connect = useDeviceStore((s) => s.connect);
  const disconnect = useDeviceStore((s) => s.disconnect);
  const clearError = useDeviceStore((s) => s.clearError);

  const [mock, setMockState] = useState(() =>
    loadSetting<boolean>(SettingKey.mock, false),
  );
  const setMock = (v: boolean) => {
    setMockState(v);
    saveSetting(SettingKey.mock, v);
  };
  const busy = status === 'connecting';
  const st = STATUS_LABEL[status] ?? { text: '未连接', dot: 'bg-slate-500' };

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">设备连接</h2>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
          {st.text}
          {isMock && status === 'connected' && (
            <span className="rounded bg-accent/20 px-1 text-accent">MOCK</span>
          )}
        </span>
      </div>

      {deviceName && (
        <div className="text-xs text-slate-400">
          {deviceName}
          {info && (
            <span className="ml-2">固件 {formatFirmware(info.firmwareRaw)}</span>
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

      {/* Mock 开关（开发用，无硬件时勾选可离线演示） */}
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={mock}
          disabled={status === 'connected' || busy}
          onChange={(e) => setMock(e.target.checked)}
          className="accent-accent"
        />
        使用 Mock 设备（离线演示）
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void connect({ mock })}
          disabled={busy || status === 'connected'}
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          连接
        </button>
        <button
          type="button"
          onClick={() => void disconnect()}
          disabled={busy || status === 'disconnected'}
          className="flex-1 rounded-lg bg-surface-raised px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          断开
        </button>
      </div>
    </div>
  );
}
