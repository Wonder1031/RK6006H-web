/**
 * 预设组面板 —— M0~M2 电压/电流预设（卡片式高级编辑）。
 *
 * - 每张卡片用滑块精细调节 V/I，可「载入到设定」（FC06 写 0x0008/0x0009）。
 * - 顶部快捷模板一键填充；底部「写入设备预设组」FC10 写 0x0030（未真机验证）。
 */

import { useState } from 'react';
import { useDeviceStore } from '@/store/deviceStore';
import { DEVICE_LIMITS } from '@/config/constants';
import type { Preset } from '@/types/device';
import { ValueControl } from './ValueControl';

const V_COLOR = '#3b82f6';
const I_COLOR = '#22c55e';

const DEFAULTS: Preset[] = [
  { voltage: 5, current: 1 },
  { voltage: 12, current: 2 },
  { voltage: 24, current: 3 },
];

/** 快捷模板 */
const TEMPLATES: Array<{ name: string; preset: Preset }> = [
  { name: 'USB 5V/1A', preset: { voltage: 5, current: 1 } },
  { name: '12V/2A', preset: { voltage: 12, current: 2 } },
  { name: '24V/3A', preset: { voltage: 24, current: 3 } },
  { name: '清零', preset: { voltage: 0, current: 0 } },
];

function maybeConfirm(isMock: boolean, msg: string): boolean {
  if (isMock) return true;
  return window.confirm(msg);
}

export function PresetPanel() {
  const applyPresets = useDeviceStore((s) => s.applyPresets);
  const setVoltage = useDeviceStore((s) => s.setVoltage);
  const setCurrent = useDeviceStore((s) => s.setCurrent);
  const isMock = useDeviceStore((s) => s.isMock);
  const telemetry = useDeviceStore((s) => s.telemetry);
  const [presets, setPresets] = useState<Preset[]>(DEFAULTS);
  const [pending, setPending] = useState(false);

  function update(i: number, field: keyof Preset, value: number) {
    setPresets((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)),
    );
  }

  /** 把快捷模板填入全部 3 组 */
  function applyTemplate(preset: Preset) {
    setPresets([preset, { ...preset }, { ...preset }]);
  }

  /** 把第 i 组载入到当前设定（FC06 写 0x0008/0x0009） */
  async function loadToSetpoint(i: number) {
    const p = presets[i]!;
    if (
      !maybeConfirm(
        isMock,
        `将 M${i}（${p.voltage.toFixed(2)}V / ${p.current.toFixed(3)}A）载入到当前设定？`,
      )
    )
      return;
    setPending(true);
    try {
      await setVoltage(p.voltage);
      await setCurrent(p.current);
    } finally {
      setPending(false);
    }
  }

  /** 把当前实测设定读入第 i 组 */
  function captureFromLive(i: number) {
    if (!telemetry) return;
    update(i, 'voltage', Number(telemetry.voltageSetpoint.toFixed(2)));
    update(i, 'current', Number(telemetry.currentSetpoint.toFixed(3)));
  }

  async function writeAll() {
    if (!maybeConfirm(isMock, '确认写入 3 组预设（M0~M2）到设备（FC10 / 0x0030）？'))
      return;
    setPending(true);
    try {
      await applyPresets(presets);
    } finally {
      setPending(false);
    }
  }

  const templateButtons = TEMPLATES.map((t) => (
    <button
      key={t.name}
      type="button"
      onClick={() => applyTemplate(t.preset)}
      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300 transition hover:border-accent/40 hover:text-accent"
    >
      {t.name}
    </button>
  ));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">预设组 M0~M2</h3>
      </div>

      {/* 快捷模板 */}
      <div className="flex flex-wrap gap-1.5">{templateButtons}</div>

      {/* 预设卡片 */}
      <div className="flex flex-col gap-2">
        {presets.map((p, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 bg-surface-raised/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                M{i}
                <span className="ml-2 num text-slate-500">
                  {p.voltage.toFixed(2)}V · {p.current.toFixed(3)}A
                </span>
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => captureFromLive(i)}
                  disabled={!telemetry}
                  title="把当前设定读入此组"
                  className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-30"
                >
                  ←当前
                </button>
                <button
                  type="button"
                  onClick={() => loadToSetpoint(i)}
                  disabled={pending}
                  title="把此组载入到当前设定"
                  className="rounded bg-accent/20 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/30 disabled:opacity-40"
                >
                  载入
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <ValueControl
                label="电压"
                value={p.voltage}
                onChange={(v) => update(i, 'voltage', v)}
                min={0}
                max={DEVICE_LIMITS.V_MAX}
                step={DEVICE_LIMITS.V_STEP}
                unit="V"
                digits={2}
                thumbColor={V_COLOR}
                testId={`preset-${i}-voltage`}
              />
              <ValueControl
                label="电流"
                value={p.current}
                onChange={(v) => update(i, 'current', v)}
                min={0}
                max={DEVICE_LIMITS.I_MAX}
                step={DEVICE_LIMITS.I_STEP}
                unit="A"
                digits={3}
                thumbColor={I_COLOR}
                testId={`preset-${i}-current`}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={writeAll}
        disabled={pending}
        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {pending ? '处理中…' : '写入设备预设组（FC10）'}
      </button>
      <p className="text-[11px] text-slate-500">
        「载入」= FC06 写当前设定（已验证）；「写入设备预设组」= FC10 写 0x0030（地址未真机验证）。
      </p>
    </div>
  );
}
