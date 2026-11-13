import { useState, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card } from './ui/card.tsx';
import { TerraScopeApi, type RegionalComparisonResponse } from '../lib/api.ts';
import {
  VARIABLE_META,
  formatNumber,
  type RegionId,
  type Variable,
} from '../lib/types.ts';

interface ComparisonViewProps {
  initialVariable?: Variable;
  initialPeriod?: string;
  onOpenDetective?: (query?: string) => void;
}

interface CuratedPair {
  id: string;
  title: string;
  sub: string;
  varLabel: string;
  tag: string;
  aLabel: string;
  bLabel: string;
  sa: number;
  sb: number;
  unit: string;
  diff: string;
  ci: string;
  p: string;
  confirmed: boolean;
  badge: string;
  bcls: string;
  bboxA: [number, number, number, number];
  bboxB: [number, number, number, number];
  note: string;
  regionAId?: RegionId;
  regionBId?: RegionId;
}

const CURATED_PAIRS: CuratedPair[] = [
  {
    id: 'sahel-wisconsin',
    title: 'Sahel ↓ vs Wisconsin ↑',
    sub: 'Air temperature · MERRA-2 · real result',
    varLabel: 'Air temperature · MERRA-2 · 2001–2024',
    tag: 'Real result',
    aLabel: 'Sahel −0.30 °C',
    bLabel: 'Wisconsin +0.22 °C',
    sa: -0.30,
    sb: 0.22,
    unit: '°C',
    diff: '−0.51 °C',
    ci: '[−1.03, −0.02]',
    p: '0.0075',
    confirmed: true,
    badge: 'Contradiction',
    bcls: 'bg-[#2b2540] text-white',
    bboxA: [-17, 10, 30, 18],
    bboxB: [-92.9, 42.5, -86.8, 47.1],
    note: 'Opposite directions and a significant difference, stable in both halves of the record (POST /compare). Not neighbours: found by comparing presets.',
    regionAId: 'sahel',
    regionBId: 'wisconsin',
  },
  {
    id: 'north-south-sahel',
    title: 'North Sahel ↓ vs South Sahel ↑',
    sub: 'Soil moisture · GLDAS · illustrative',
    varLabel: 'Soil moisture · GLDAS · 2001–2024',
    tag: 'Illustrative',
    aLabel: 'North −0.0031 m³/m³',
    bLabel: 'South +0.0024 m³/m³',
    sa: -0.0031,
    sb: 0.0024,
    unit: 'm³/m³',
    diff: '−0.0055 m³/m³',
    ci: '[−0.0081, −0.0029]',
    p: '0.002',
    confirmed: true,
    badge: 'Contradiction',
    bcls: 'bg-[#2b2540] text-white',
    bboxA: [-10, 15, 20, 20],
    bboxB: [-10, 10, 20, 15],
    note: 'Illustrative auto-find result for neighbouring areas. Numbers are examples only.',
  },
  {
    id: 'upper-lower-mekong',
    title: 'Upper Mekong ↑ vs Mekong Delta ↓',
    sub: 'Rainfall · GPM IMERG · illustrative',
    varLabel: 'Precipitation · GPM IMERG · 2001–2024',
    tag: 'Illustrative',
    aLabel: 'Upper +1.8 mm/month',
    bLabel: 'Delta −0.9 mm/month',
    sa: 1.8,
    sb: -0.9,
    unit: 'mm/month',
    diff: '+2.7 mm/month',
    ci: '[−1.4, 6.8]',
    p: '0.19',
    confirmed: false,
    badge: 'Needs validation',
    bcls: 'bg-[#fff1c9] text-[#6b4e00]',
    bboxA: [98, 21, 102, 28],
    bboxB: [104.4, 8.5, 106.9, 11.1],
    note: 'Opposite directions, but the difference could be chance, so it is not proven. Illustrative numbers.',
    regionAId: 'mekong_region',
    regionBId: 'mekong_delta',
  },
];

export function ComparisonView({
  initialVariable = 'rain',
  initialPeriod = '2001-2024',
  onOpenDetective,
}: ComparisonViewProps) {
  const [selectedPairIndex, setSelectedPairIndex] = useState(0);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customRegionA, setCustomRegionA] = useState<RegionId>('sahel');
  const [customRegionB, setCustomRegionB] = useState<RegionId>('wisconsin');
  const [comparison, setComparison] = useState<RegionalComparisonResponse | null>(null);

  const cur = CURATED_PAIRS[selectedPairIndex];

  // Run dynamic comparison when in custom mode
  useEffect(() => {
    if (!isCustomMode) return;
    if (customRegionA === customRegionB) {
      setComparison(null);
      return;
    }
    let active = true;
    TerraScopeApi.compareRegions(customRegionA, customRegionB, initialVariable, initialPeriod)
      .then((res) => {
        if (active) setComparison(res);
      })
      .catch(() => {
        if (active) setComparison(null);
      });

    return () => {
      active = false;
    };
  }, [isCustomMode, customRegionA, customRegionB, initialVariable, initialPeriod]);

  // Color logic: orange for increasing, blue for decreasing
  const colorA = (isCustomMode && comparison ? comparison.regionA.meanSlope >= 0 : cur.sa >= 0)
    ? '#c4621a'
    : '#2f6fb3';
  const colorB = (isCustomMode && comparison ? comparison.regionB.meanSlope >= 0 : cur.sb >= 0)
    ? '#c4621a'
    : '#2f6fb3';

  // Generate schematic or real points for the chart
  const chartOption = useMemo(() => {
    const years = Array.from({ length: 24 }, (_, i) => 2001 + i);
    const n = years.length;

    const pointsA: number[] = [];
    const pointsB: number[] = [];
    const trendA: number[] = [];
    const trendB: number[] = [];

    const sa = isCustomMode && comparison ? comparison.regionA.meanSlope : cur.sa;
    const sb = isCustomMode && comparison ? comparison.regionB.meanSlope : cur.sb;
    const baseA = 15;
    const baseB = 12;

    for (let i = 0; i < n; i++) {
      const valA = baseA + (sa / 10) * (i - n / 2) + Math.sin(i * 1.3) * 0.4;
      const valB = baseB + (sb / 10) * (i - n / 2) + Math.cos(i * 1.5) * 0.4;
      pointsA.push(Number(valA.toFixed(2)));
      pointsB.push(Number(valB.toFixed(2)));
      trendA.push(Number((baseA + (sa / 10) * (i - n / 2)).toFixed(2)));
      trendB.push(Number((baseB + (sb / 10) * (i - n / 2)).toFixed(2)));
    }

    return {
      animation: true,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#2b2540',
        borderColor: '#4e4860',
        textStyle: { color: '#ffffff', fontSize: 12, fontFamily: 'Nunito, sans-serif' },
        extraCssText: 'border-radius: 14px; box-shadow: 0 8px 20px rgba(43,37,64,0.18);',
      },
      legend: {
        bottom: 0,
        itemGap: 16,
        data: ['Area A Series', 'Area A Trend', 'Area B Series', 'Area B Trend'],
        textStyle: { color: '#4e4860', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif' },
      },
      grid: { left: 45, right: 20, top: 20, bottom: 45 },
      xAxis: {
        type: 'category',
        data: years.map(String),
        axisLabel: { color: '#4e4860', fontSize: 11, fontWeight: 700, fontFamily: 'Nunito, sans-serif' },
        axisLine: { lineStyle: { color: '#ece3d3' } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: '#ece3d3', type: 'dashed' } },
        axisLabel: { color: '#4e4860', fontSize: 11, fontWeight: 600, fontFamily: 'Nunito, sans-serif' },
      },
      series: [
        {
          name: 'Area A Series',
          type: 'line',
          smooth: 0.2,
          symbol: 'none',
          data: pointsA,
          itemStyle: { color: colorA },
          lineStyle: { width: 1.4, color: colorA, opacity: 0.5 },
        },
        {
          name: 'Area A Trend',
          type: 'line',
          symbol: 'none',
          data: trendA,
          itemStyle: { color: colorA },
          lineStyle: { width: 3.5, color: colorA },
        },
        {
          name: 'Area B Series',
          type: 'line',
          smooth: 0.2,
          symbol: 'none',
          data: pointsB,
          itemStyle: { color: colorB },
          lineStyle: { width: 1.4, color: colorB, opacity: 0.5, type: 'dashed' },
        },
        {
          name: 'Area B Trend',
          type: 'line',
          symbol: 'none',
          data: trendB,
          itemStyle: { color: colorB },
          lineStyle: { width: 3.5, color: colorB, type: 'dashed' },
        },
      ],
    };
  }, [cur, isCustomMode, comparison, colorA, colorB]);

  // Schematic bounding box coordinates
  const bboxToPct = (b: [number, number, number, number]) => {
    const left = ((b[0] + 180) / 360) * 100;
    const top = ((90 - b[3]) / 180) * 100;
    const width = Math.max(2, ((b[2] - b[0]) / 360) * 100);
    const height = Math.max(2, ((b[3] - b[1]) / 180) * 100);
    return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
  };

  const boxAPos = bboxToPct(cur.bboxA);
  const boxBPos = bboxToPct(cur.bboxB);

  return (
    <div className="flex flex-col gap-5 max-w-[1200px] w-full">
      {/* Title & Description */}
      <div className="flex flex-col gap-1.5">
        <h1 className="font-fredoka text-2xl sm:text-3xl font-semibold text-[#2b2540]">
          Contradiction hunt
        </h1>
        <p className="text-sm sm:text-base font-semibold leading-relaxed text-[#3d3752] max-w-3xl">
          Terra looks for areas whose trends point opposite ways. A contradiction is only confirmed
          when the directions differ AND the difference between the slopes is significant.
        </p>
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {/* Left column: Curated Pairs & Disagreement callouts */}
        <section
          aria-label="Found pairs"
          className="flex-1 basis-[300px] max-w-[380px] flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-sm text-[#2b2540]">Auto-found pairs</span>
            <button
              type="button"
              onClick={() => setIsCustomMode(!isCustomMode)}
              className="text-xs font-bold text-[#4e4860] hover:text-[#2b2540] underline underline-offset-2"
            >
              {isCustomMode ? 'Show auto pairs' : 'Custom pair'}
            </button>
          </div>

          {!isCustomMode ? (
            <div className="flex flex-col gap-2.5">
              {CURATED_PAIRS.map((p, idx) => {
                const isSelected = selectedPairIndex === idx;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPairIndex(idx)}
                    className={`w-full min-h-[76px] rounded-[24px] bg-white p-3.5 sm:p-4 flex flex-col items-start gap-1.5 cursor-pointer text-left transition-all ${
                      isSelected
                        ? 'border-2 border-[#2b2540] shadow-card bg-[#fdfbff]'
                        : 'border border-[#ece3d3]/80 hover:border-[#2b2540]/40'
                    }`}
                  >
                    <b className="font-extrabold text-base text-[#2b2540]">{p.title}</b>
                    <span className="font-semibold text-xs text-[#4e4860]">{p.sub}</span>
                    <span className={`inline-flex items-center min-h-[26px] px-3 rounded-full font-extrabold text-xs ${p.bcls}`}>
                      {p.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <Card className="p-4 flex flex-col gap-3">
              <span className="font-bold text-sm text-[#2b2540]">Custom region comparison</span>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[#4e4860]">Area A</label>
                <select
                  value={customRegionA}
                  onChange={(e) => setCustomRegionA(e.target.value as RegionId)}
                  className="min-h-[40px] rounded-full border-2 border-[#ece3d3] px-3 text-xs font-bold text-[#2b2540]"
                >
                  <option value="sahel">Sahel</option>
                  <option value="wisconsin">Wisconsin</option>
                  <option value="mekong_delta">Mekong Delta</option>
                  <option value="mekong_region">Mekong Region</option>
                  <option value="global">Whole world</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[#4e4860]">Area B</label>
                <select
                  value={customRegionB}
                  onChange={(e) => setCustomRegionB(e.target.value as RegionId)}
                  className="min-h-[40px] rounded-full border-2 border-[#ece3d3] px-3 text-xs font-bold text-[#2b2540]"
                >
                  <option value="wisconsin">Wisconsin</option>
                  <option value="sahel">Sahel</option>
                  <option value="mekong_delta">Mekong Delta</option>
                  <option value="mekong_region">Mekong Region</option>
                  <option value="global">Whole world</option>
                </select>
              </div>

              {customRegionA === customRegionB && (
                <span className="text-xs font-bold text-[#e8735a]">
                  Please select two different regions to compare.
                </span>
              )}
            </Card>
          )}

          {/* Sahel dataset disagreement callout */}
          <div className="bg-[#fff1c9] text-[#5a4100] rounded-[24px] p-4 font-bold text-xs sm:text-sm leading-relaxed">
            Datasets disagree · Sahel air temperature: MERRA-2 −0.30 °C/decade (cooling) vs GLDAS +0.85 °C/decade (warming), both p &lt; 0.001. Choosing the dataset matters, and results need validation.
          </div>
        </section>

        {/* Right column: Schematic Map, Dual Chart, Difference A - B */}
        <section className="flex-2 basis-[520px] min-w-0 flex flex-col gap-4">
          {/* Schematic Geographic Location Map */}
          <Card className="p-3">
            <div
              role="img"
              aria-label="Schematic world map highlighting Area A and Area B"
              className="relative w-full aspect-[2.6/1] rounded-[20px] overflow-hidden bg-[#cdeaf0]"
            >
              <svg
                viewBox="0 0 360 138"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="absolute inset-0 w-full height-full"
              >
                <path
                  d="M20,35 Q60,20 120,40 Q160,25 220,30 Q280,35 340,30 L340,90 Q300,100 240,85 Q180,95 120,85 Q60,95 20,85 Z"
                  fill="#f3e3c3"
                  stroke="#f3e3c3"
                  strokeWidth="6"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Area A Box */}
              <div
                style={{
                  position: 'absolute',
                  left: boxAPos.left,
                  top: boxAPos.top,
                  width: boxAPos.width,
                  height: boxAPos.height,
                  borderColor: colorA,
                }}
                className="min-w-[14px] min-h-[14px] border-2 rounded-[6px] bg-white/30"
              >
                <span
                  style={{ backgroundColor: colorA }}
                  className="absolute -top-5 left-0 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full"
                >
                  A
                </span>
              </div>

              {/* Area B Box */}
              <div
                style={{
                  position: 'absolute',
                  left: boxBPos.left,
                  top: boxBPos.top,
                  width: boxBPos.width,
                  height: boxBPos.height,
                  borderColor: colorB,
                }}
                className="min-w-[14px] min-h-[14px] border-2 border-dashed rounded-[6px] bg-white/30"
              >
                <span
                  style={{ backgroundColor: colorB }}
                  className="absolute -top-5 left-0 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full"
                >
                  B
                </span>
              </div>

              <span className="absolute left-3 bottom-2.5 font-bold text-[11px] text-[#2b2540] bg-white/85 px-2 py-0.5 rounded-full">
                Schematic map · Contradiction areas
              </span>
            </div>
          </Card>

          {/* Dual Time Series Comparison Chart */}
          <Card className="p-4 sm:p-5 flex flex-col gap-2">
            <div className="flex justify-between font-extrabold text-sm text-[#2b2540]">
              <span>{isCustomMode ? 'Custom Comparison' : cur.varLabel}</span>
              <span className="text-[#4e4860] font-semibold">{isCustomMode ? 'Calculated' : cur.tag}</span>
            </div>

            <div className="h-[210px] w-full">
              <ReactECharts option={chartOption} notMerge style={{ height: '100%', width: '100%' }} />
            </div>

            <div className="flex flex-wrap gap-3 font-bold text-xs text-[#4e4860] border-t border-[#ece3d3]/80 pt-2">
              <span>Solid: A {isCustomMode && comparison ? `${comparison.regionA.meta.name} ${formatNumber(comparison.regionA.meanSlope, initialVariable, true)}` : cur.aLabel}</span>
              <span>Dashed: B {isCustomMode && comparison ? `${comparison.regionB.meta.name} ${formatNumber(comparison.regionB.meanSlope, initialVariable, true)}` : cur.bLabel}</span>
              <span className="text-[#2b2540]">orange = increasing · blue = decreasing · past trends, not forecasts</span>
            </div>
          </Card>

          {/* Difference A - B Card */}
          <Card className="p-4 sm:p-5 flex flex-col gap-2.5">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm sm:text-base text-[#2b2540]">Difference A − B</span>
              <span className={`inline-flex items-center min-h-[28px] px-3 rounded-full font-extrabold text-xs ${isCustomMode && comparison ? (comparison.hasContradiction ? 'bg-[#2b2540] text-white' : 'bg-[#fff1c9] text-[#6b4e00]') : cur.bcls}`}>
                {isCustomMode && comparison ? (comparison.hasContradiction ? 'Contradiction' : 'No contradiction') : cur.badge}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sc-cute">
                <b>{isCustomMode && comparison ? `${comparison.deltaSlope >= 0 ? '+' : ''}${formatNumber(comparison.deltaSlope, initialVariable, true)} ${VARIABLE_META[initialVariable].slopeUnit}` : `${cur.diff} per decade`}</b>
                <small>per decade</small>
              </div>
              <div className="sc-cute">
                <b>{cur.ci}</b>
                <small>95% CI of difference</small>
              </div>
              <div className="sc-cute">
                <b>{cur.p}</b>
                <small>p-value</small>
              </div>
            </div>

            <span className="font-semibold text-xs sm:text-sm text-[#3d3752] leading-relaxed">
              {isCustomMode && comparison ? comparison.contradictionSummary : cur.note}
            </span>

            {onOpenDetective && (
              <button
                type="button"
                onClick={() => onOpenDetective(`Why do trends differ between ${isCustomMode && comparison ? comparison.regionA.meta.name : 'Sahel'} and ${isCustomMode && comparison ? comparison.regionB.meta.name : 'Wisconsin'}?`)}
                className="btn-cute self-start mt-1 text-xs"
              >
                Ask Terra about this contradiction
              </button>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
