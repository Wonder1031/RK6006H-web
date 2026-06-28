/** 主仪表盘 —— 实时 V/I/P + 设定值 + 温度 + 输出开关。 */

import { useDeviceStore } from '@/store/deviceStore';
import { Gauge } from './Gauge';
import { OutputSwitch } from './OutputSwitch';
import { TrendChart } from './TrendChart';
import { fmt } from '@/utils/format';

export function Dashboard() {
  const t = useDeviceStore((s) => s.telemetry);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <Gauge label="电压 V" value={t?.voltageActual ?? null} unit="V" digits={2} />
        <Gauge
          label="电流 I"
          value={t?.currentActual ?? null}
          unit="A"
          digits={3}
          accent="ok"
        />
        <Gauge label="功率 P" value={t?.powerActual ?? null} unit="W" digits={2} />
      </div>

      <TrendChart />

      <OutputSwitch />

      <div className="panel grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Info label="设定电压" value={fmt(t?.voltageSetpoint, 2, ' V')} />
        <Info label="设定电流" value={fmt(t?.currentSetpoint, 3, ' A')} />
        <Info label="温度" value={fmt(t?.temperature, 2, ' ℃')} />
      </div>

      <p className="text-xs text-ink-faint">
        缩放：V/100、I/1000、温度/100（真机确认）；功率 = V×I 计算。
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}
