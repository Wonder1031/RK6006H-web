/** 报文控制台 —— 显示 TX/RX Modbus 帧、CRC 校验状态，支持清空与 CSV 导出。 */

import { useDeviceStore } from '@/store/deviceStore';
import { bytesToHex } from '@/utils/hex';
import { fmtClock } from '@/utils/format';

export function Console() {
  const log = useDeviceStore((s) => s.log);
  const clearLog = useDeviceStore((s) => s.clearLog);

  // 倒序显示（最新在顶部）
  const entries = [...log].reverse();

  function exportCsv() {
    const header = 'id,direction,timestamp,hex,crcOk\n';
    const rows = log
      .map((e) =>
        [
          e.id,
          e.direction,
          new Date(e.timestamp).toISOString(),
          `"${bytesToHex(e.bytes)}"`,
          e.crcOk === undefined ? '' : e.crcOk ? 'OK' : 'FAIL',
        ].join(','),
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rk6006h-frames-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          共 {log.length} 条（最新在上）
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={log.length === 0}
            className="rounded bg-surface-raised px-2 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            导出 CSV
          </button>
          <button
            type="button"
            onClick={clearLog}
            disabled={log.length === 0}
            className="rounded bg-surface-raised px-2 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40"
          >
            清空
          </button>
        </div>
      </div>

      <div className="num max-h-72 overflow-y-auto rounded bg-surface/80 p-2 text-xs">
        {entries.length === 0 ? (
          <div className="p-4 text-center text-slate-500">暂无报文</div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 border-b border-white/5 py-0.5"
            >
              <span className="w-20 text-slate-500">{fmtClock(e.timestamp)}</span>
              <span
                className={[
                  'w-8 font-semibold',
                  e.direction === 'tx' ? 'text-accent' : 'text-accent-ok',
                ].join(' ')}
              >
                {e.direction.toUpperCase()}
              </span>
              <span className="flex-1 break-all text-slate-200">
                {bytesToHex(e.bytes)}
              </span>
              {e.direction === 'rx' && (
                <span
                  className={[
                    'w-12 text-right',
                    e.crcOk ? 'text-accent-ok' : 'text-accent-danger',
                  ].join(' ')}
                >
                  {e.crcOk ? 'CRC✓' : 'CRC✗'}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
