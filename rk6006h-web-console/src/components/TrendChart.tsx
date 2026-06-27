/** 实时趋势曲线 —— 滚动展示电压 / 电流 / 功率（取自 Store 历史缓冲）。 */

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useDeviceStore } from '@/store/deviceStore';

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export function TrendChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const history = useDeviceStore((s) => s.history);

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

  // 数据更新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const xs = history.map((t) =>
      new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour12: false }),
    );
    chart.setOption({
      backgroundColor: 'transparent',
      grid: { left: 40, right: 12, top: 28, bottom: 24 },
      legend: {
        data: ['电压 V', '电流 A', '功率 W'],
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 0,
      },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: xs,
        axisLabel: { color: '#64748b', fontSize: 10 },
        axisLine: { lineStyle: { color: '#334155' } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1f2937' } },
      },
      series: [
        lineSeries('电压 V', history.map((t) => t.voltageActual), '#3b82f6'),
        lineSeries('电流 A', history.map((t) => t.currentActual), '#22c55e'),
        lineSeries('功率 W', history.map((t) => t.powerActual), '#f59e0b'),
      ],
    });
  }, [history]);

  return (
    <div className="panel">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">实时趋势</h3>
      <div ref={containerRef} className="h-48 w-full" />
    </div>
  );
}

function lineSeries(name: string, data: number[], color: string) {
  return {
    name,
    type: 'line' as const,
    data,
    smooth: true,
    symbol: 'none',
    lineStyle: { color, width: 1.5 },
    itemStyle: { color },
  };
}
