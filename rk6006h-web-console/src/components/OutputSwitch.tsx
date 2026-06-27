/** 输出开关 —— 控制 0x0012 寄存器（ON/OFF）。 */

import { useState } from 'react';
import { useDeviceStore } from '@/store/deviceStore';

export function OutputSwitch() {
  const telemetry = useDeviceStore((s) => s.telemetry);
  const connected = useDeviceStore((s) => s.status === 'connected');
  const setOutput = useDeviceStore((s) => s.setOutput);
  const [pending, setPending] = useState(false);

  const on = telemetry?.outputOn ?? false;

  async function toggle() {
    if (pending || !connected) return;
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
      className={[
        'w-full rounded-lg px-4 py-3 text-sm font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-40',
        on
          ? 'bg-accent-ok text-white hover:brightness-110'
          : 'bg-surface-raised text-slate-200 hover:bg-white/10',
      ].join(' ')}
    >
      {pending ? '切换中…' : on ? '● 输出已开启（点击关闭）' : '○ 输出已关闭（点击开启）'}
    </button>
  );
}
