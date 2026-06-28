/**
 * 实时趋势曲线 —— 电压 / 电流 / 功率（取自 Store 历史缓冲）。
 *
 * 升级方案 P1-4：
 *  - 双 Y 轴：电压/电流 左轴、功率 右轴（解决「功率压扁电流」）。
 *  - dataZoom：滚轮 / 拖拽缩放历史区间。
 *  - 暂停/冻结：冻结实时刷新便于细看。
 *  - 导出：CSV / JSON / PNG。
 *  - 轴色随主题（深/浅）自适应。
 */

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useDeviceStore } from '@/store/deviceStore';
import { useSessionStore } from '@/store/sessionStore';
import { downloadCsv, downloadJson, downloadBlob } from '@/utils/export';
import { fmtClock } from '@/utils/format';
import { getTheme } from '@/utils/theme';

echarts.use([
  LineChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

/** 按主题取一组轴 / 文字色。 */
function chartColors() {
  const light = getTheme() === 'light';
  return light
    ? { label: '#475569', line: '#cbd5e1', legend: '#334155' }
    : { label: '#64748b', line: '#1f2937', legend: '#94a3b8' };
}

export function TrendChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const liveHistory = useDeviceStore((s) => s.history);
  const clearHistory = useDeviceStore((s) => s.clearHistory);
  const replay = useSessionStore((s) => s.replay);
  const exitReplay = useSessionStore((s) => s.exitReplay);
  // 回放模式：渲染历史会话点（冻结）；否则渲染实时历史缓冲
  const data = replay ? replay.points : liveHistory;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // 初始化 / 销毁
  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current, undefined, {
      renderer: 'canvas',
    });
    const onResize = () => chartRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // 数据更新（回放时始终刷新历史点；实时模式暂停时不刷新）
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!replay && pausedRef.current) return;
    const xs = data.map((t) => fmtClock(t.timestamp));
    const c = chartColors();
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 44, right: 48, top: 30, bottom: 40 },
      legend: {
        data: ['电压 V', '电流 A', '功率 W'],
        textStyle: { color: c.legend, fontSize: 11 },
        top: 0,
      },
      tooltip: { trigger: 'axis' },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 8, textStyle: { color: c.label } },
      ],
      xAxis: {
        type: 'category',
        data: xs,
        axisLabel: { color: c.label, fontSize: 10 },
        axisLine: { lineStyle: { color: c.line } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'V/A',
          scale: true,
          nameTextStyle: { color: c.label, fontSize: 10 },
          axisLabel: { color: c.label, fontSize: 10 },
          splitLine: { lineStyle: { color: c.line } },
        },
        {
          type: 'value',
          name: 'W',
          scale: true,
          nameTextStyle: { color: c.label, fontSize: 10 },
          axisLabel: { color: c.label, fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        lineSeries('电压 V', data.map((t) => t.voltageActual), '#3b82f6', 0),
        lineSeries('电流 A', data.map((t) => t.currentActual), '#22c55e', 0),
        lineSeries('功率 W', data.map((t) => t.powerActual), '#f59e0b', 1),
      ],
    });
  }, [data, paused, replay]);

  function exportCsv() {
    const rows: Array<Array<string | number>> = [
      [
        'time',
        'voltageSetpoint',
        'currentSetpoint',
        'voltageActual',
        'currentActual',
        'powerActual',
        'temperature',
        'outputOn',
      ],
      ...data.map((t) => [
        fmtClock(t.timestamp),
        t.voltageSetpoint,
        t.currentSetpoint,
        t.voltageActual,
        t.currentActual,
        t.powerActual,
        t.temperature,
        t.outputOn ? 1 : 0,
      ]),
    ];
    downloadCsv(replay ? 'rk6006h-replay' : 'rk6006h-telemetry', rows);
  }

  function exportPng() {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: getTheme() === 'light' ? '#ffffff' : '#0f1419',
    });
    // getDataURL 返回 data: URL，转 Blob 下载
    const blob = dataUrlToBlob(url);
    downloadBlob('rk6006h-trend.png', blob);
  }

  return (
    <div className="panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-sm font-semibold text-ink">
          {replay ? '回放：历史趋势' : '实时趋势'}
          {replay && (
            <span className="ml-2 text-[11px] font-normal text-ink-faint">
              {replay.session.deviceName} · {replay.points.length} 点
            </span>
          )}
          {!replay && paused && (
            <span className="ml-2 text-accent-warn">（已暂停）</span>
          )}
        </h3>
        <div className="flex flex-wrap gap-1">
          {replay ? (
            <button
              type="button"
              onClick={exitReplay}
              className="rounded bg-accent/20 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/30"
            >
              ↩ 返回实时
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10"
              >
                {paused ? '▶ 继续' : '⏸ 暂停'}
              </button>
              <button
                type="button"
                onClick={clearHistory}
                disabled={data.length === 0}
                title="清空当前实时曲线（不影响已保存的历史会话）"
                className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-accent-danger hover:bg-overlay/10 disabled:opacity-40"
              >
                清空
              </button>
            </>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={data.length === 0}
            className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10 disabled:opacity-40"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() =>
              downloadJson(
                replay ? 'rk6006h-replay' : 'rk6006h-telemetry',
                data,
              )
            }
            disabled={data.length === 0}
            className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10 disabled:opacity-40"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={data.length === 0}
            className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted hover:bg-overlay/10 disabled:opacity-40"
          >
            PNG
          </button>
        </div>
      </div>
      <div ref={containerRef} className="h-52 w-full" />
    </div>
  );
}

function lineSeries(
  name: string,
  data: number[],
  color: string,
  yAxisIndex: number,
) {
  return {
    name,
    type: 'line' as const,
    yAxisIndex,
    data,
    smooth: true,
    symbol: 'none',
    lineStyle: { color, width: 1.5 },
    itemStyle: { color },
  };
}

/** data: URL → Blob（供 PNG 下载）。 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const meta = parts[0] ?? '';
  const b64 = parts[1] ?? '';
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
