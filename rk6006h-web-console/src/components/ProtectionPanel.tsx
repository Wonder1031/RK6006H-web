/** 保护设置面板 —— 只读显示 OVP/OCP/OAH/OPH/Overtime（§5.3 / §7.3）。 */

import { useDeviceStore } from '@/store/deviceStore';
import type { Protection, ProtectionEntry } from '@/types/device';

const ITEMS: Array<{ key: keyof Protection; label: string }> = [
  { key: 'ovp', label: 'OVP 过压' },
  { key: 'ocp', label: 'OCP 过流' },
  { key: 'oah', label: 'OAH 过充 Ah' },
  { key: 'oph', label: 'OPH 过功 Wh' },
  { key: 'overtime', label: '超时' },
];

export function ProtectionPanel() {
  const protection = useDeviceStore((s) => s.protection);
  const refresh = useDeviceStore((s) => s.refreshProtection);

  return (
    <div className="panel flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">保护设置</h3>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded bg-surface-raised px-2 py-1 text-xs text-ink-muted hover:bg-overlay/10"
        >
          刷新
        </button>
      </div>

      {!protection ? (
        <p className="text-xs text-ink-faint">未读取</p>
      ) : (
        <table className="text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              <th className="py-1 text-left font-normal">项目</th>
              <th className="py-1 text-right font-normal">阈值</th>
              <th className="py-1 text-right font-normal">raw</th>
            </tr>
          </thead>
          <tbody className="num">
            {ITEMS.map(({ key, label }) => (
              <ProtectionRow
                key={key}
                label={label}
                entry={protection[key]}
              />
            ))}
          </tbody>
        </table>
      )}

      <p className="text-xs text-ink-faint">
        阈值工程值含义待确认（raw 系数字段未标定），暂仅显示原始读数。
      </p>
    </div>
  );
}

function ProtectionRow({
  label,
  entry,
}: {
  label: string;
  entry: ProtectionEntry;
}) {
  return (
    <tr className="border-t border-overlay/5">
      <td className="py-1 text-left font-sans text-ink-muted">{label}</td>
      <td className="py-1 text-right text-ink">{entry.threshold}</td>
      <td className="py-1 text-right text-ink-muted">0x{entry.raw.toString(16).toUpperCase()}</td>
    </tr>
  );
}
