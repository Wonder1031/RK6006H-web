/**
 * App 根组件 —— RK6006H Web 上位机主布局。
 *
 * 左：连接 + 设定控制；右：仪表盘 + 标签页（保护 / 预设 / 控制台）。
 */

import { useState } from 'react';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Dashboard } from '@/components/Dashboard';
import { SetpointControl } from '@/components/SetpointControl';
import { ProtectionPanel } from '@/components/ProtectionPanel';
import { PresetPanel } from '@/components/PresetPanel';
import { Console } from '@/components/Console';
import { useDeviceStore } from '@/store/deviceStore';

type Tab = 'protection' | 'preset' | 'console';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'protection', label: '保护设置' },
  { id: 'preset', label: '预设组' },
  { id: 'console', label: '报文控制台' },
];

export default function App() {
  const connected = useDeviceStore((s) => s.status === 'connected');
  const [tab, setTab] = useState<Tab>('protection');

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">RK6006H Web 上位机</h1>
        <span className="text-xs text-slate-500">Modbus RTU over BLE</span>
      </header>

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
                <div className="flex gap-1 border-b border-white/5 pb-2">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={[
                        'rounded px-3 py-1 text-xs transition',
                        tab === t.id
                          ? 'bg-accent text-white'
                          : 'text-slate-400 hover:text-slate-200',
                      ].join(' ')}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === 'protection' && <ProtectionPanel />}
                {tab === 'preset' && <PresetPanel />}
                {tab === 'console' && <Console />}
              </div>
            </>
          ) : (
            <div className="panel flex h-full items-center justify-center text-sm text-slate-400">
              请先连接设备（无硬件可勾选 Mock 演示）
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
