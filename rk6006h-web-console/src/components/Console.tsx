/**
 * 报文控制台 —— 显示 TX/RX Modbus 帧、CRC 校验状态。
 *
 * 升级方案 P1-6：
 *  - 过滤：方向（全部/TX/RX）、CRC（全部/✓/✗）、文本搜索（hex / note）。
 *  - 倒序列表用 useMemo，避免每帧重建数组。
 *  - 导出 CSV（带 BOM）/ 清空。
 */

import { useMemo, useState } from 'react';
import { useDeviceStore } from '@/store/deviceStore';
import { bytesToHex } from '@/utils/hex';
import { fmtClock } from '@/utils/format';
import { downloadCsv } from '@/utils/export';

type DirFilter = 'all' | 'tx' | 'rx';
type CrcFilter = 'all' | 'ok' | 'fail';

const DIR_OPTIONS: Array<{ id: DirFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'tx', label: 'TX' },
  { id: 'rx', label: 'RX' },
];

const CRC_OPTIONS: Array<{ id: CrcFilter; label: string }> = [
  { id: 'all', label: 'CRC 全部' },
  { id: 'ok', label: 'CRC✓' },
  { id: 'fail', label: 'CRC✗' },
];

export function Console() {
  const log = useDeviceStore((s) => s.log);
  const clearLog = useDeviceStore((s) => s.clearLog);
  const [dir, setDir] = useState<DirFilter>('all');
  const [crc, setCrc] = useState<CrcFilter>('all');
  const [query, setQuery] = useState('');

  // 过滤 + 倒序（最新在上），useMemo 避免每帧重建
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = log.filter((e) => {
      if (dir !== 'all' && e.direction !== dir) return false;
      if (crc !== 'all') {
        if (crc === 'ok' && e.crcOk !== true) return false;
        if (crc === 'fail' && e.crcOk !== false) return false;
      }
      if (q) {
        const hay = `${bytesToHex(e.bytes)} ${e.note ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filtered.reverse();
  }, [log, dir, crc, query]);

  function exportCsv() {
    // 导出按当前过滤结果
    const rows: Array<Array<string | number>> = [
      ['id', 'direction', 'timestamp', 'hex', 'crcOk'],
      ...entries.map((e) => [
        e.id,
        e.direction,
        new Date(e.timestamp).toISOString(),
        bytesToHex(e.bytes),
        e.crcOk === undefined ? '' : e.crcOk ? 'OK' : 'FAIL',
      ]),
    ];
    downloadCsv('rk6006h-frames', rows);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">
          共 {entries.length}/{log.length} 条（最新在上）
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={entries.length === 0}
            className="rounded bg-surface-raised px-2 py-1 text-xs text-ink-muted hover:bg-overlay/10 disabled:opacity-40"
          >
            导出 CSV
          </button>
          <button
            type="button"
            onClick={clearLog}
            disabled={log.length === 0}
            className="rounded bg-surface-raised px-2 py-1 text-xs text-accent-danger hover:bg-overlay/10 disabled:opacity-40"
          >
            清空
          </button>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={DIR_OPTIONS}
          value={dir}
          onChange={setDir}
        />
        <Segmented
          options={CRC_OPTIONS}
          value={crc}
          onChange={setCrc}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 hex / 说明"
          className="num w-40 rounded bg-surface-raised px-2 py-0.5 text-xs text-ink outline-none placeholder:text-ink-faint focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="num max-h-72 overflow-y-auto rounded bg-surface/80 p-2 text-xs">
        {entries.length === 0 ? (
          <div className="p-4 text-center text-ink-faint">
            {log.length === 0 ? '暂无报文' : '无匹配报文'}
          </div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-2 border-b border-overlay/5 py-0.5"
            >
              <span className="w-20 text-ink-faint">{fmtClock(e.timestamp)}</span>
              <span
                className={[
                  'w-8 font-semibold',
                  e.direction === 'tx' ? 'text-accent' : 'text-accent-ok',
                ].join(' ')}
              >
                {e.direction.toUpperCase()}
              </span>
              <span className="flex-1 break-all text-ink">
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

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded border border-overlay/10">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={[
            'px-2 py-0.5 text-[11px] transition',
            value === o.id
              ? 'bg-accent text-white'
              : 'bg-surface-raised text-ink-muted hover:bg-overlay/10',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
