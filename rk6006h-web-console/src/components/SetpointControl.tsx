/** 设定控制 —— 电压 / 电流设定（高级滑块，FC06 写 0x0008 / 0x0009）。 */

import { useEffect, useState } from "react";
import { useDeviceStore } from "@/store/deviceStore";
import { DEVICE_LIMITS } from "@/config/constants";
import { maybeConfirm } from "@/utils/confirm";
import { checkSetpointSafety } from "@/utils/safety";
import { loadSetting, saveSetting, SettingKey } from "@/utils/storage";
import { sanitizeSetpoint } from "@/utils/validate";
import { ValueControl } from "./ValueControl";

export function SetpointControl() {
  const telemetry = useDeviceStore((s) => s.telemetry);
  const isMock = useDeviceStore((s) => s.isMock);
  const protection = useDeviceStore((s) => s.protection);
  const setVoltage = useDeviceStore((s) => s.setVoltage);
  const setCurrent = useDeviceStore((s) => s.setCurrent);

  // 初始值取自上次设定（刷新后恢复），经范围校验/限幅
  const initial = loadSetting(
    SettingKey.lastSetpoint,
    { voltage: 0, current: 0 },
    (v) => sanitizeSetpoint(v, { voltage: 0, current: 0 }),
  );
  const [volts, setVolts] = useState(initial.voltage);
  const [amps, setAmps] = useState(initial.current);
  const [pending, setPending] = useState(false);

  // 设定值同步自遥测（首次或外部刷新时）
  useEffect(() => {
    if (telemetry) {
      setVolts(Number(telemetry.voltageSetpoint.toFixed(2)));
      setAmps(Number(telemetry.currentSetpoint.toFixed(3)));
    }
  }, [telemetry?.voltageSetpoint, telemetry?.currentSetpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // 持久化最后设定值（含遥测同步后的值），刷新后恢复
  useEffect(() => {
    saveSetting(SettingKey.lastSetpoint, { voltage: volts, current: amps });
  }, [volts, amps]);

  async function apply() {
    // 安全校验：超设备上限（及未来 OVP/OCP 阈值）→ 在确认框中提示
    const warnings = checkSetpointSafety(volts, amps, protection);
    const warnText =
      warnings.length > 0
        ? `\n⚠ ${warnings.map((w) => w.message).join("；")}`
        : "";
    if (
      !(await maybeConfirm(
        isMock,
        `应用设定：${volts.toFixed(2)} V / ${amps.toFixed(3)} A？（写入 0x0008 / 0x0009）${warnText}`,
        warnings.length > 0
          ? { variant: "warn", dontAskKey: "setpoint-apply" }
          : undefined,
      ))
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
      <h3 className="text-sm font-semibold text-ink">设定值</h3>

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
        {pending ? "应用中…" : "应用设定"}
      </button>

      <p className="text-[11px] text-ink-faint">
        地址已真机确认：电压 0x0008（/100）、电流 0x0009（/1000）。
      </p>
    </div>
  );
}
