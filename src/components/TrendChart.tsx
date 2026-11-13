import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { generateSeries } from '../lib/mockData.ts';
import { VARIABLE_META, type CellProperties, type Variable } from '../lib/types.ts';

interface TrendChartProps {
  cell: CellProperties;
  variable: Variable;
  period?: string;
}

export function TrendChart({ cell, variable, period = '2005-2024' }: TrendChartProps) {
  const series = useMemo(() => generateSeries(cell, variable, period), [cell, variable, period]);
  const meta = VARIABLE_META[variable];

  const option = useMemo(() => {
    return {
      animation: true,
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#16362a',
        borderColor: '#24523e',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#ffffff', fontSize: 11 },
        extraCssText: 'border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); backdrop-filter: blur(8px); max-width: 90vw;',
        formatter: (params: Array<{ seriesName: string; value: number; marker: string; axisValue: string }>) => {
          const year = params[0]?.axisValue;
          let html = `<div style="font-weight: 700; font-size: 11px; margin-bottom: 6px; color: #86efac; letter-spacing: 0.04em;">YEAR ${year}</div>`;
          params.forEach(p => {
            const val = Number(p.value).toFixed(variable === 'rain' ? 2 : 4);
            html += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 4px;">
              <span style="font-size: 11px; color: #d0e4d7;">${p.marker} ${p.seriesName}</span>
              <strong style="color: #ffffff; font-family: monospace; font-size: 11px;">${val} ${meta.unit}</strong>
            </div>`;
          });
          return html;
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        itemGap: 16,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 4,
        data: ['Observed Measurements', 'Theil–Sen Fitted Trend'],
        textStyle: { color: '#617b6c', fontSize: 10, fontWeight: 500 },
        pageIconColor: '#16804a',
        pageTextStyle: { color: '#617b6c', fontSize: 10 },
      },
      grid: {
        left: 45,
        right: 16,
        top: 26,
        bottom: 46,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.years.map(String),
        axisLabel: {
          color: '#71877b',
          fontSize: 10,
          margin: 10,
          interval: Math.max(0, Math.floor(series.years.length / 5) - 1),
        },
        axisLine: { lineStyle: { color: '#d8e5dd' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: `${meta.name} (${meta.unit})`,
        nameTextStyle: { color: '#617b6c', fontSize: 10, padding: [0, 0, 6, 0] },
        axisLabel: {
          color: '#71877b',
          fontSize: 10,
          formatter: (v: number) => (variable === 'rain' ? v.toFixed(0) : v.toFixed(3)),
        },
        splitLine: {
          lineStyle: { color: '#edf4f0', type: 'dashed' },
        },
      },
      series: [
        {
          name: 'Observed Measurements',
          type: 'line',
          smooth: 0.2,
          symbol: 'circle',
          symbolSize: 4,
          data: series.observed,
          itemStyle: { color: '#16804a' },
          lineStyle: { width: 2.2, color: '#16804a' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(22, 128, 74, 0.12)' },
                { offset: 1, color: 'rgba(22, 128, 74, 0.00)' },
              ],
            },
          },
        },
        {
          name: 'Theil–Sen Fitted Trend',
          type: 'line',
          symbol: 'none',
          data: series.fitted,
          itemStyle: { color: '#16362a' },
          lineStyle: { width: 2.0, color: '#16362a', type: 'dashed' },
        },
      ],
    };
  }, [series, variable, meta]);

  return (
    <div className="h-[250px] sm:h-[280px] w-full">
      <ReactECharts option={option} notMerge style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
