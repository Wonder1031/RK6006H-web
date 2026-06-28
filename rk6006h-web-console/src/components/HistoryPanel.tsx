/**
 * 历史会话面板 —— IndexedDB 长会话列表 + 曲线回放（升级方案 P1-3）。
 *
 * 每次连接记录一个 session，轮询点全量落库；此处列出历史会话，
 * 可「回放」载入 TrendChart（冻结查看），或删除 / 清空。
 */

import { useEffect } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { maybeConfirm, maybeAlert } from '@/utils/confirm';
import { useDeviceStore } from '@/store/deviceStore';

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false });
}

function fmtDuration(from: number, to?: number): string {
  if (!to) return '进行中';
  const s = Math.round((to - from) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

export function HistoryPanel() {
  const sessions = useSessionStore((s) => s.sessions);
  const recordingId = useSessionStore((s) => s.recordingId);
  const replay = useSessionStore((s) => s.replay);
  const refreshSessions = useSessionStore((s) => s.refreshSessions);
  const replaySession = useSessionStore((s) => s.replaySession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const clearAll = useSessionStore((s) => s.clearAll);
  const isMock = useDeviceStore((s) => s.isMock);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  async function onReplay(id: number) {
    await replaySession(id);
  }

  async function onDelete(id: number) {
    if (!(await maybeConfirm(isMock, '确认删除该历史会话？')))
      return;
    await deleteSession(id);
  }

  async function onClearAll() {
    if (sessions.length === 0) return;
    if (!(await maybeConfirm(isMock, `确认清空全部 ${sessions.length} 个历史会话？`)))
      return;
    await clearAll();
    void maybeAlert('已清空全部历史会话');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          历史会话
          <span className="ml-2 text-[11px] font-normal text-ink-faint">
            共 {sessions.length} 个{recordingId != null ? '（当前正在记录）' : ''}
          </span>
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void refreshSessions()}
            className="rounded bg-surface-raised px-2 py-1 text-xs text-ink-muted hover:bg-overlay/10"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => void onClearAll()}
            disabled={sessions.length === 0}
            className="rounded bg-surface-raised px-2 py-1 text-xs text-accent-danger hover:bg-overlay/10 disabled:opacity-40"
          >
            清空全部
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-xs text-ink-faint">暂无历史会话（连接设备后自动记录）。</p>
      ) : (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {sessions.map((s) => {
            const active = replay?.session.id === s.id;
            return (
              <div
                key={s.id}
                className={[
                  'flex items-center justify-between rounded border px-2 py-1.5 text-xs',
                  active
                    ? 'border-accent/40 bg-accent/10'
                    : 'border-overlay/5 bg-surface-raised/60',
                ].join(' ')}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-ink">
                    {s.deviceName}
                    {s.isMock && (
                      <span className="ml-1 rounded bg-accent/20 px-1 text-[10px] text-accent">
                        MOCK
                      </span>
                    )}
                  </span>
                  <span className="num text-[11px] text-ink-faint">
                    {fmtDate(s.startedAt)} · {fmtDuration(s.startedAt, s.endedAt)} ·{' '}
                    {s.pointCount} 点
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void onReplay(s.id!)}
                    className={[
                      'rounded px-2 py-0.5 text-[11px]',
                      active
                        ? 'bg-accent text-white'
                        : 'bg-accent/20 text-accent hover:bg-accent/30',
                    ].join(' ')}
                  >
                    {active ? '回放中' : '回放'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(s.id!)}
                    className="rounded bg-overlay/5 px-2 py-0.5 text-[11px] text-accent-danger hover:bg-overlay/10"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-ink-faint">
        回放会在上方趋势图冻结显示历史曲线（点「返回实时」退出）。
      </p>
    </div>
  );
}
