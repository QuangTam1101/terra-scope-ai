import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { generateSeries } from '../lib/mockData.ts';
import { VARIABLE_META, type CellProperties, type Variable } from '../lib/types.ts';

interface TrendChartProps {
  cell: CellProperties;
  variable: Variable;
  period?: string;
  mode?: 'values' | 'anomaly';
}

export function TrendChart({
  cell,
  variable,
  period = '2001-2024',
  mode = 'values',
}: TrendChartProps) {
  const series = useMemo(() => generateSeries(cell, variable, period), [cell, variable, period]);
  const meta = VARIABLE_META[variable] || {
    name: 'Variable',
    unit: '',
    slopeUnit: 'per decade',
    defaultScale: [0, 100],
  };

  const metric = (cell as any)[variable] || {
    slope: 0,
    significant: false,
    ciLow: null,
    ciHigh: null,
  };

  const isIncreasing = metric.slope >= 0;
  const trendColor = isIncreasing ? '#c4621a' : '#2f6fb3';
  const bandFill = isIncreasing ? 'rgba(196, 98, 26, 0.16)' : 'rgba(47, 111, 179, 0.16)';
  const isSignificant = !!metric.significant;

  // Derive anomaly if mode is anomaly
  const meanVal = series.observed.reduce((a: number, b: number) => a + b, 0) / (series.observed.length || 1);
  const observedData = mode === 'anomaly'
    ? series.observed.map((v: number) => Number((v - meanVal).toFixed(3)))
    : series.observed;

  const fittedData = mode === 'anomaly'
    ? series.fitted.map((v: number) => Number((v - meanVal).toFixed(3)))
    : series.fitted;

  // 95% Confidence Interval Band (around fitted trend)
  const ciSpread = Math.abs((metric.ciHigh ?? metric.slope) - (metric.ciLow ?? metric.slope)) * 0.35 || 0.15;
  const ciUpper = fittedData.map((v: number) => Number((v + ciSpread).toFixed(3)));
  const ciLower = fittedData.map((v: number) => Number((v - ciSpread).toFixed(3)));

  const option = useMemo(() => {
    return {
      animation: true,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#2b2540',
        borderColor: '#4e4860',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#ffffff', fontSize: 12, fontFamily: 'Nunito, sans-serif' },
        extraCssText: 'border-radius: 16px; box-shadow: 0 10px 24px rgba(43,37,64,0.18);',
        formatter: (params: Array<{ seriesName: string; value: number; marker: string; axisValue: string }>) => {
          const year = params[0]?.axisValue;
          let html = `<div style="font-weight: 800; font-size: 12px; margin-bottom: 6px; color: #ede6fb;">YEAR ${year}</div>`;
          params.forEach((p) => {
            if (p.seriesName.includes('CI')) return;
            const val = Number(p.value).toFixed(variable === 'rain' ? 2 : 4);
            html += `<div style="display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 4px;">
              <span style="font-size: 12px; color: #fbf6ec;">${p.marker} ${p.seriesName}</span>
              <strong style="color: #ffffff; font-size: 12px; font-variant-numeric: tabular-nums;">${val} ${mode === 'anomaly' ? `(${meta.unit} anomaly)` : meta.unit}</strong>
            </div>`;
          });
          return html;
        },
      },
      legend: {
        bottom: 0,
        itemGap: 18,
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 5,
        data: ['Observed Measurements', 'Theil–Sen Fitted Trend', '95% CI Uncertainty Band'],
        textStyle: { color: '#4e4860', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif' },
      },
      grid: {
        left: 52,
        right: 20,
        top: 24,
        bottom: 48,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.years.map(String),
        axisLabel: {
          color: '#4e4860',
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'Nunito, sans-serif',
          margin: 10,
          interval: Math.max(0, Math.floor(series.years.length / 5) - 1),
        },
        axisLine: { lineStyle: { color: '#ece3d3' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        name: mode === 'anomaly' ? `Anomaly (${meta.unit})` : `${meta.name} (${meta.unit})`,
        nameTextStyle: { color: '#4e4860', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif', padding: [0, 0, 6, 0] },
        axisLabel: {
          color: '#4e4860',
          fontSize: 11,
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 600,
          formatter: (v: number) => (variable === 'rain' ? v.toFixed(0) : v.toFixed(2)),
        },
        splitLine: {
          lineStyle: { color: '#ece3d3', type: 'dashed' },
        },
      },
      series: [
        {
          name: '95% CI Lower',
          type: 'line',
          data: ciLower,
          lineStyle: { opacity: 0 },
          stack: 'confidence-band',
          symbol: 'none',
        },
        {
          name: '95% CI Uncertainty Band',
          type: 'line',
          data: ciUpper.map((val: number, idx: number) => Number((val - ciLower[idx]).toFixed(3))),
          lineStyle: { opacity: 0 },
          areaStyle: { color: bandFill },
          stack: 'confidence-band',
          symbol: 'none',
        },
        {
          name: 'Observed Measurements',
          type: 'line',
          smooth: 0.2,
          symbol: 'circle',
          symbolSize: 4,
          data: observedData,
          itemStyle: { color: '#5e5872' },
          lineStyle: { width: 1.8, color: '#5e5872', opacity: 0.75 },
        },
        {
          name: 'Theil–Sen Fitted Trend',
          type: 'line',
          symbol: 'none',
          data: fittedData,
          itemStyle: { color: trendColor },
          lineStyle: {
            width: 3.5,
            color: trendColor,
            type: isSignificant ? 'solid' : 'dashed',
          },
        },
      ],
    };
  }, [series, variable, meta, mode, trendColor, bandFill, isSignificant, observedData, fittedData, ciLower, ciUpper]);

  return (
    <div className="h-[250px] sm:h-[280px] w-full">
      <ReactECharts option={option} notMerge style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
