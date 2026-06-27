/** 设定控制 —— 电压 / 电流设定（高级滑块，FC06 写 0x0008 / 0x0009）。 */

import { useEffect, useState } from 'react';
import { useDeviceStore } from '@/store/deviceStore';
import { DEVICE_LIMITS } from '@/config/constants';
import { ValueControl } from './ValueControl';

function maybeConfirm(isMock: boolean, msg: string): boolean {
  if (isMock) return true;
  return window.confirm(msg);
}

export function SetpointControl() {
  const telemetry = useDeviceStore((s) => s.telemetry);
  const isMock = useDeviceStore((s) => s.isMock);
  const setVoltage = useDeviceStore((s) => s.setVoltage);
  const setCurrent = useDeviceStore((s) => s.setCurrent);

  const [volts, setVolts] = useState(0);
  const [amps, setAmps] = useState(0);
  const [pending, setPending] = useState(false);

  // 设定值同步自遥测（首次或外部刷新时）
  useEffect(() => {
    if (telemetry) {
      setVolts(Number(telemetry.voltageSetpoint.toFixed(2)));
      setAmps(Number(telemetry.currentSetpoint.toFixed(3)));
    }
  }, [telemetry?.voltageSetpoint, telemetry?.currentSetpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    if (
      !maybeConfirm(
        isMock,
        `应用设定：${volts.toFixed(2)} V / ${amps.toFixed(3)} A？（写入 0x0008 / 0x0009）`,
      )
    )
      return;
    setPending(true);
    try {
      await setVoltage(volts);
      await setCurrent(amps);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-200">设定值</h3>

      <ValueControl
        label="电压"
        value={volts}
        onChange={setVolts}
        min={0}
        max={DEVICE_LIMITS.V_MAX}
        step={DEVICE_LIMITS.V_STEP}
        unit="V"
        digits={2}
        thumbColor="#3b82f6"
        testId="setpoint-voltage"
      />

      <ValueControl
        label="电流"
        value={amps}
        onChange={setAmps}
        min={0}
        max={DEVICE_LIMITS.I_MAX}
        step={DEVICE_LIMITS.I_STEP}
        unit="A"
        digits={3}
        thumbColor="#22c55e"
        testId="setpoint-current"
      />

      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {pending ? '应用中…' : '应用设定'}
      </button>

      <p className="text-[11px] text-slate-500">
        地址已真机确认：电压 0x0008（/100）、电流 0x0009（/1000）。
      </p>
    </div>
  );
}
