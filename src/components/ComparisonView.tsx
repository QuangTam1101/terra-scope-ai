import { useState, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  ArrowRightLeft,
  AlertTriangle,
  AlertCircle,
  Layers,
  Calendar,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Card } from './ui/card.tsx';
import { InfoTooltip } from './ui/tooltip.tsx';
import { TerraScopeApi, type RegionalComparisonResponse } from '../lib/api.ts';
import {
  REGION_META,
  VARIABLE_META,
  formatNumber,
  type RegionId,
  type Variable,
} from '../lib/types.ts';

interface ComparisonViewProps {
  initialVariable?: Variable;
  initialPeriod?: string;
}

const periods = ['2005-2024', '2010-2024', '2015-2024'];
const fieldClass =
  'mt-1 block h-10 w-full rounded-xl border border-[#dce7e0] bg-[#fafcfb] px-3 text-xs sm:text-sm font-medium text-[#16362a] outline-none transition duration-150 focus:border-[#16804a] focus:bg-white focus:ring-2 focus:ring-[#16804a]/15';

export function ComparisonView({
  initialVariable = 'rain',
  initialPeriod = '2005-2024',
}: ComparisonViewProps) {
  const [regionA, setRegionA] = useState<RegionId>('mekong');
  const [regionB, setRegionB] = useState<RegionId>('north');
  const [variable, setVariable] = useState<Variable>(initialVariable);
  const [period, setPeriod] = useState<string>(initialPeriod);
  const [comparison, setComparison] = useState<RegionalComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const isInvalidComparison = regionA === regionB;

  const runComparison = async () => {
    if (isInvalidComparison) {
      setComparison(null);
      return;
    }
    setLoading(true);
    try {
      const result = await TerraScopeApi.compareRegions(regionA, regionB, variable, period);
      setComparison(result);
    } catch {
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runComparison();
  }, [regionA, regionB, variable, period, isInvalidComparison]);

  // Synchronous extraction for ECharts
  const [seriesData, setSeriesData] = useState<{
    years: number[];
    observedA: number[];
    fittedA: number[];
    observedB: number[];
    fittedB: number[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (comparison && !isInvalidComparison) {
      Promise.all([
        TerraScopeApi.getSeries(comparison.regionA.sampleCell, variable, period),
        TerraScopeApi.getSeries(comparison.regionB.sampleCell, variable, period),
      ]).then(([sA, sB]) => {
        if (active) {
          setSeriesData({
            years: sA.years,
            observedA: sA.observed,
            fittedA: sA.fitted,
            observedB: sB.observed,
            fittedB: sB.fitted,
          });
        }
      });
    } else {
      setSeriesData(null);
    }
    return () => {
      active = false;
    };
  }, [comparison, variable, period, isInvalidComparison]);

  const chartOption = useMemo(() => {
    if (!seriesData || isInvalidComparison) return {};
    const meta = VARIABLE_META[variable];
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
          let html = `<div style="font-weight: 700; font-size: 11px; margin-bottom: 6px; color: #86efac; letter-spacing: 0.04em;">REGIONAL COMPARISON · ${year}</div>`;
          params.forEach(p => {
            html += `<div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 4px;">
              <span style="font-size: 11px; color: #d0e4d7;">${p.marker} ${p.seriesName}</span>
              <strong style="color: #ffffff; font-family: monospace; font-size: 11px;">${Number(p.value).toFixed(variable === 'rain' ? 2 : 4)} ${meta.unit}</strong>
            </div>`;
          });
          return html;
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        itemGap: 14,
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 4,
        textStyle: { color: '#617b6c', fontSize: 10, fontWeight: 500 },
        pageIconColor: '#16804a',
        pageTextStyle: { color: '#617b6c', fontSize: 10 },
        data: [
          `${REGION_META[regionA].name} (Obs)`,
          `${REGION_META[regionA].name} (Trend)`,
          `${REGION_META[regionB].name} (Obs)`,
          `${REGION_META[regionB].name} (Trend)`,
        ],
      },
      grid: { left: 68, right: 20, top: 26, bottom: 56 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: seriesData.years.map(String),
        axisLabel: {
          color: '#71877b',
          fontSize: 10,
          margin: 10,
          interval: Math.max(0, Math.floor(seriesData.years.length / 5) - 1),
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
        splitLine: { lineStyle: { color: '#edf4f0', type: 'dashed' } },
      },
      series: [
        {
          name: `${REGION_META[regionA].name} (Obs)`,
          type: 'line',
          smooth: 0.2,
          symbolSize: 4,
          data: seriesData.observedA,
          itemStyle: { color: '#16804a' },
          lineStyle: { width: 2.2 },
        },
        {
          name: `${REGION_META[regionA].name} (Trend)`,
          type: 'line',
          symbol: 'none',
          data: seriesData.fittedA,
          itemStyle: { color: '#166534' },
          lineStyle: { width: 2.0, type: 'dashed' },
        },
        {
          name: `${REGION_META[regionB].name} (Obs)`,
          type: 'line',
          smooth: 0.2,
          symbolSize: 4,
          data: seriesData.observedB,
          itemStyle: { color: '#d28d5f' },
          lineStyle: { width: 2.2 },
        },
        {
          name: `${REGION_META[regionB].name} (Trend)`,
          type: 'line',
          symbol: 'none',
          data: seriesData.fittedB,
          itemStyle: { color: '#b2622f' },
          lineStyle: { width: 2.0, type: 'dashed' },
        },
      ],
    };
  }, [seriesData, regionA, regionB, variable, isInvalidComparison]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="eyebrow flex items-center gap-1.5">
          <ArrowRightLeft size={13} />
          Contradiction Hunter & Regional Disparity
        </div>
        <h1 className="page-title">Compare Regional Environmental Trends</h1>
        <p className="page-description">
          Detect contradictory or diverging trajectories between distinct study areas. Evaluate whether
          observed environmental shifts are isolated to localized river basins or consistent across broader biomes.
        </p>
      </div>

      {/* Control Strip */}
      <Card className="p-5 shadow-sm border border-[#e2ebe5] bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="comp-region-a" className="field-label">
              Region A (Primary)
            </label>
            <select
              id="comp-region-a"
              className={fieldClass}
              value={regionA}
              onChange={(e) => {
                const next = e.target.value as RegionId;
                setRegionA(next);
                // If user deliberately or accidentally selects same as regionB, auto-shift regionB
                if (next === regionB) {
                  setRegionB(next === 'mekong' ? 'north' : 'mekong');
                }
              }}
            >
              <option value="mekong" disabled={regionB === 'mekong'}>
                Mekong Delta {regionB === 'mekong' ? '(In Use for B)' : ''}
              </option>
              <option value="north" disabled={regionB === 'north'}>
                Northern Vietnam {regionB === 'north' ? '(In Use for B)' : ''}
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="comp-region-b" className="field-label">
              Region B (Comparison)
            </label>
            <select
              id="comp-region-b"
              className={fieldClass}
              value={regionB}
              onChange={(e) => {
                const next = e.target.value as RegionId;
                setRegionB(next);
                if (next === regionA) {
                  setRegionA(next === 'mekong' ? 'north' : 'mekong');
                }
              }}
            >
              <option value="north" disabled={regionA === 'north'}>
                Northern Vietnam {regionA === 'north' ? '(In Use for A)' : ''}
              </option>
              <option value="mekong" disabled={regionA === 'mekong'}>
                Mekong Delta {regionA === 'mekong' ? '(In Use for A)' : ''}
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="comp-variable" className="field-label">
              <span className="flex items-center gap-1">
                <Layers size={13} className="text-[#16804a]" />
                Environmental Variable
              </span>
            </label>
            <select
              id="comp-variable"
              className={fieldClass}
              value={variable}
              onChange={(e) => setVariable(e.target.value as Variable)}
            >
              <option value="rain">Precipitation (GPM IMERG)</option>
              <option value="soil">Soil Moisture (GLDAS)</option>
            </select>
          </div>

          <div>
            <label htmlFor="comp-period" className="field-label">
              <span className="flex items-center gap-1">
                <Calendar size={13} className="text-[#16804a]" />
                Shared Time Period
              </span>
            </label>
            <select
              id="comp-period"
              className={fieldClass}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p.replace('-', ' to ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Invalid Comparison Validation Banner */}
      {isInvalidComparison && (
        <Card className="p-5 shadow-sm border border-[#f5c2c7] bg-[#fff8f8]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dc3545] text-white shadow-xs">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#842029]">
                Invalid Comparison: Identical Regions Selected
              </h3>
              <p className="mt-1 text-xs text-[#a02334] leading-relaxed">
                Region A and Region B cannot be identical ({REGION_META[regionA]?.name}). Comparing a region against itself yields a zero slope differential (&Delta; = 0) and cannot evaluate spatial divergence. Select two distinct geographic regions above.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRegionB(regionA === 'mekong' ? 'north' : 'mekong');
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#842029] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#6c1a22] transition shadow-xs"
              >
                Auto-select {regionA === 'mekong' ? 'Northern Vietnam' : 'Mekong Delta'} for Region B
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Contradiction Hunter Callout */}
      {comparison && (
        <Card
          className={`p-5 shadow-sm border transition-all ${
            comparison.hasContradiction
              ? 'border-[#f5dfc6] bg-gradient-to-r from-[#fefbf7] to-white'
              : 'border-[#cde8d6] bg-gradient-to-r from-[#f7fdf9] to-white'
          }`}
        >
          {/* Backend Warnings (Rule R6) */}
          {comparison.warnings && comparison.warnings.length > 0 && (
            <div className="mb-3.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[11px] font-bold">Comparison Data Advisory:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                  {comparison.warnings.map((w, wi) => (
                    <li key={wi}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-xs ${
                  comparison.hasContradiction
                    ? 'bg-[#d28d5f] text-white'
                    : 'bg-[#16804a] text-white'
                }`}
              >
                {comparison.hasContradiction ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      comparison.hasContradiction
                        ? 'bg-[#ffeedd] text-[#b45d24]'
                        : 'bg-[#e3f6ea] text-[#166534]'
                    }`}
                  >
                    {comparison.hasContradiction
                      ? 'Opposing Trajectories Detected'
                      : 'Directional Agreement'}
                  </span>
                  <span className="text-xs text-[#71877b] font-mono">
                    Δ Slope: {Math.abs(comparison.deltaSlope).toFixed(3)}{' '}
                    {comparison.variable.slopeUnit}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#16362a] mt-1">
                  {comparison.contradictionSummary}
                </h3>
              </div>
            </div>
          </div>

          {/* Collapsible Scientific Caveat (Progressive Disclosure) */}
          <details className="group mt-3 rounded-lg border border-[#e8efe9] bg-[#fafcfb] text-xs">
            <summary className="flex cursor-pointer items-center justify-between p-2.5 font-medium text-[#5c7a68] hover:text-[#16362a] transition-colors select-none">
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-[#b45d24]">Statistical Caveat:</span>
                Interpreting trend directionality vs interaction significance
              </span>
              <span className="text-[10px] text-[#86a293] group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="border-t border-[#edf3ef] p-3 text-[11px] leading-relaxed text-[#617b6c]">
              Opposite estimated trend slopes (e.g. one positive, one negative) do not automatically prove a statistically supported difference between regional time series. A formal interaction hypothesis test is scheduled for backend <code className="bg-[#edf5f0] px-1 py-0.5 rounded font-mono text-[10px] text-[#166534]">/compare</code>.
            </div>
          </details>
        </Card>
      )}

      {/* Side-by-Side Statistics */}
      {comparison && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Region A Card */}
          <Card className="p-5 shadow-sm border border-[#e2ebe5] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf3ef] pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#16804a]">
                  Region A
                </span>
                <h3 className="text-base sm:text-lg font-bold text-[#16362a]">
                  {comparison.regionA.meta.name}
                </h3>
                <p className="text-xs text-[#71877b]">{comparison.regionA.meta.country}</p>
              </div>
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  comparison.regionA.trendDirection === 'increasing'
                    ? 'bg-[#e4f6eb] text-[#166534]'
                    : 'bg-[#ffeedd] text-[#b45d24]'
                }`}
              >
                {comparison.regionA.trendDirection === 'increasing' ? (
                  <>
                    <TrendingUp size={13} /> Increasing
                  </>
                ) : (
                  <>
                    <TrendingDown size={13} /> Decreasing
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b] flex items-center justify-between">
                  Theil–Sen Slope
                  <InfoTooltip
                    title="Theil-Sen Slope"
                    content="Median of slopes between all pairwise observation years. Insensitive to outliers."
                  />
                </span>
                <div className="mt-1 text-base font-bold text-[#16643c]">
                  {formatNumber(comparison.regionA.meanSlope, variable, true)}{' '}
                  <span className="text-[10px] font-normal text-[#71877b]">
                    {comparison.variable.slopeUnit}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b]">Mean Level</span>
                <div className="mt-1 text-base font-bold text-[#16362a]">
                  {formatNumber(comparison.regionA.meanValue, variable)}{' '}
                  <span className="text-[10px] font-normal text-[#71877b]">
                    {comparison.variable.unit}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b] flex items-center justify-between">
                  Avg p-value
                  <InfoTooltip
                    title="Mann-Kendall p-value"
                    content="Tests whether a monotonic trend exists against null hypothesis."
                  />
                </span>
                <div className="mt-1 text-sm font-bold text-[#16362a]">
                  {comparison.regionA.pValAvg.toFixed(3)}
                </div>
              </div>

              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b]">Data Completeness</span>
                <div className="mt-1 text-sm font-bold text-[#16362a]">
                  {comparison.regionA.completeness}% valid
                </div>
              </div>
            </div>
          </Card>

          {/* Region B Card */}
          <Card className="p-5 shadow-sm border border-[#e2ebe5] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf3ef] pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#d28d5f]">
                  Region B
                </span>
                <h3 className="text-base sm:text-lg font-bold text-[#16362a]">
                  {comparison.regionB.meta.name}
                </h3>
                <p className="text-xs text-[#71877b]">{comparison.regionB.meta.country}</p>
              </div>
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  comparison.regionB.trendDirection === 'increasing'
                    ? 'bg-[#e4f6eb] text-[#166534]'
                    : 'bg-[#ffeedd] text-[#b45d24]'
                }`}
              >
                {comparison.regionB.trendDirection === 'increasing' ? (
                  <>
                    <TrendingUp size={13} /> Increasing
                  </>
                ) : (
                  <>
                    <TrendingDown size={13} /> Decreasing
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b] flex items-center justify-between">
                  Theil–Sen Slope
                  <InfoTooltip
                    title="Theil-Sen Slope"
                    content="Median of slopes between all pairwise observation years. Insensitive to outliers."
                  />
                </span>
                <div className="mt-1 text-base font-bold text-[#16643c]">
                  {formatNumber(comparison.regionB.meanSlope, variable, true)}{' '}
                  <span className="text-[10px] font-normal text-[#71877b]">
                    {comparison.variable.slopeUnit}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b]">Mean Level</span>
                <div className="mt-1 text-base font-bold text-[#16362a]">
                  {formatNumber(comparison.regionB.meanValue, variable)}{' '}
                  <span className="text-[10px] font-normal text-[#71877b]">
                    {comparison.variable.unit}
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b] flex items-center justify-between">
                  Avg p-value
                  <InfoTooltip
                    title="Mann-Kendall p-value"
                    content="Tests whether a monotonic trend exists against null hypothesis."
                  />
                </span>
                <div className="mt-1 text-sm font-bold text-[#16362a]">
                  {comparison.regionB.pValAvg.toFixed(3)}
                </div>
              </div>

              <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
                <span className="text-[#71877b]">Data Completeness</span>
                <div className="mt-1 text-sm font-bold text-[#16362a]">
                  {comparison.regionB.completeness}% valid
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Aligned Scientific Time Series */}
      <Card className="p-5 shadow-sm border border-[#e2ebe5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#16362a]">
              Synchronized Multi-Decadal Time Series
            </h3>
            <p className="text-xs text-[#71877b]">
              Overlaid annual observations and fitted trends. Hover to compare regional values directly.
            </p>
          </div>
          <span className="rounded-full bg-[#f0f6f2] border border-[#d8e6de] px-3 py-1 text-[11px] font-semibold text-[#16804a]">
            {VARIABLE_META[variable].dataset} · {period}
          </span>
        </div>

        {!loading && seriesData && !isInvalidComparison ? (
          <div className="h-[280px] sm:h-[350px] w-full">
            <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} notMerge />
          </div>
        ) : (
          <div className="flex h-[280px] sm:h-[350px] items-center justify-center text-xs text-[#71877b]">
            {isInvalidComparison
              ? 'Comparison chart is paused until two distinct study regions are selected.'
              : loading
              ? 'Analyzing and calculating regional difference...'
              : 'Loading regional series...'}
          </div>
        )}
      </Card>
    </div>
  );
}
