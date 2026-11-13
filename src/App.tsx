import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Compass,
  Database,
  Globe,
  Grid3X3,
  Map as MapIcon,
  MapPinned,
  Play,
  TrendingUp,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { TerraMap } from './components/TerraMap.tsx';
import { GlobeMap } from './components/GlobeMap.tsx';
import { RegionSelector } from './components/RegionSelector.tsx';
import { TrendChart } from './components/TrendChart.tsx';
import { OnboardingGuide } from './components/OnboardingGuide.tsx';
import { AIEarthDetective } from './components/AIEarthDetective.tsx';
import { ComparisonView } from './components/ComparisonView.tsx';
import { EvidenceReportView } from './components/EvidenceReportView.tsx';
import { Button } from './components/ui/button.tsx';
import { Card } from './components/ui/card.tsx';
import { InfoTooltip } from './components/ui/tooltip.tsx';
import { TerraScopeApi } from './lib/api.ts';
import { generateGrid } from './lib/mockData.ts';
import { getSelectionBounds } from './lib/geoUtils.ts';
import {
  formatNumber,
  getMetric,
  REGION_META,
  VARIABLE_META,
  ENV_VARIABLES,
  DATASETS,
  VARIABLE_DATASET_MAP,
  getDatasetsForVariable,
  toLegacyVariable,
  type CellProperties,
  type MapMode,
  type RegionId,
  type Variable,
  type EnvVariableId,
  type DatasetId,
  type GeographicSelection,
  type RegionSelectionMode,
  type DrawMode,
} from './lib/types.ts';

const fieldClass =
  'mt-1 block h-10 w-full rounded-xl border border-[#dce7e0] bg-[#fafcfb] px-3 text-xs sm:text-sm font-medium text-[#16362a] outline-none transition duration-150 focus:border-[#16804a] focus:bg-white focus:ring-2 focus:ring-[#16804a]/15';
const periods = ['2005-2024', '2010-2024', '2015-2024'];
type Page = 'Dashboard' | 'Compare Regions' | 'Evidence Report';
type Analysis = {
  envVariable: EnvVariableId;
  dataset: DatasetId;
  variable: Variable;
  region: RegionId;
  period: string;
  geoSelection?: GeographicSelection;
  bounds?: [[number, number], [number, number]];
  status?: 'complete' | 'unsupported_region';
  warnings?: string[];
};
const PAGES: Page[] = ['Dashboard', 'Compare Regions', 'Evidence Report'];

function StatisticsPanel({ cell, variable }: { cell: CellProperties; variable: Variable }) {
  const metric = getMetric(cell, variable);
  const meta = VARIABLE_META[variable];

  return (
    <Card className="p-5 sm:p-6 shadow-sm border border-[#e2ebe5] bg-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#edf3ef] pb-3.5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#16804a]">
            Selected Grid Location
          </span>
          <h3 className="text-base sm:text-lg font-bold text-[#16362a]">{cell.label}</h3>
        </div>
        <div className="flex flex-col items-end">
          <span className="rounded-full bg-[#f0f6f2] border border-[#d8e6de] px-2.5 py-1 font-mono text-[11px] font-semibold text-[#166534]">
            {cell.centerLat >= 0 ? `${cell.centerLat}°N` : `${Math.abs(cell.centerLat)}°S`},{' '}
            {cell.centerLon >= 0 ? `${cell.centerLon}°E` : `${Math.abs(cell.centerLon)}°W`}
          </span>
          <span className="text-[10px] text-[#71877b] mt-0.5">Cell ID: {cell.id}</span>
        </div>
      </div>

      {/* Primary Trend Highlight Card */}
      <div className="my-4 flex items-center gap-3.5 rounded-xl bg-[#f8faf9] p-4 border border-[#e5eee8]">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            metric.slope >= 0 ? 'bg-[#e2f5e8] text-[#167a49]' : 'bg-[#fff1e5] text-[#b56b31]'
          }`}
        >
          {metric.slope >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-[#617b6c]">
            <span>Theil–Sen Trend Rate</span>
            <InfoTooltip
              title="Theil-Sen Trend Slope"
              content="The median rate of change per year computed across all pairwise time intervals. Unlike ordinary least squares (OLS), it is immune to extreme flood or drought outliers."
            />
          </div>
          <p className="text-2xl font-black text-[#16643c] tracking-tight mt-0.5">
            {metric.missing ? (
              'Insufficient Data'
            ) : (
              <>
                {metric.slope >= 0 ? '+' : ''}
                {formatNumber(metric.slope, variable, true)}{' '}
                <span className="text-xs font-semibold text-[#5a7966]">{meta.slopeUnit}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Grid of Statistical Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
        <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
          <span className="text-[#617b6c] flex items-center justify-between">
            Mean Level
            <InfoTooltip
              title="Mean Level"
              content="Aggregated average value across the multi-decadal observation window."
            />
          </span>
          <div className="mt-1 font-bold text-sm text-[#16362a]">
            {metric.missing ? 'N/A' : `${formatNumber(metric.value, variable)} ${meta.unit}`}
          </div>
        </div>

        <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
          <span className="text-[#617b6c] flex items-center justify-between">
            95% Slope CI
            <InfoTooltip
              title="95% Confidence Interval"
              content="The statistical range of plausible true slopes. This interval applies exclusively to the slope rate parameter, never to individual yearly observations."
            />
          </span>
          <div className="mt-1 font-mono font-medium text-xs text-[#16362a]">
            {metric.ciLow === null || metric.ciHigh === null
              ? 'N/A'
              : `[${formatNumber(metric.ciLow, variable, true)}, ${formatNumber(metric.ciHigh, variable, true)}]`}
          </div>
        </div>

        <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
          <span className="text-[#617b6c] flex items-center justify-between">
            Mann–Kendall p-value
            <InfoTooltip
              title="Mann-Kendall p-value"
              content="Probability of observing this trend if no genuine monotonic trend existed (null hypothesis H0). Values < 0.05 reject H0."
            />
          </span>
          <div className="mt-1 font-bold text-sm text-[#16362a]">
            {metric.p === null ? 'N/A' : metric.p.toFixed(3)}
          </div>
        </div>

        <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
          <span className="text-[#617b6c]">Observation Quality</span>
          <div className="mt-1 font-bold text-sm text-[#16362a]">
            {cell.qualityPercent}% valid scans
          </div>
        </div>
      </div>

      {/* Accessible Statistical Interpretation */}
      <div className="mt-4 rounded-xl bg-[#f0f7f3] p-3 text-xs leading-relaxed text-[#204e35] border border-[#d4e8dc]">
        <strong>Interpretation: </strong>
        {metric.missing
          ? 'This cell lacks sufficient consecutive observations to satisfy the quality threshold.'
          : metric.significant
          ? `Sample p-value (${metric.p?.toFixed(3)}) indicates statistical significance at α = 0.05. The environmental shift is unlikely to be stochastic noise.`
          : `Sample p-value (${metric.p?.toFixed(3)}) exceeds 0.05. Although a non-zero slope is estimated, evidence is insufficient to reject the null hypothesis.`}
      </div>
    </Card>
  );
}

function ChartPanel({
  cell,
  variable,
  period,
}: {
  cell: CellProperties;
  variable: Variable;
  period: string;
}) {
  const meta = VARIABLE_META[variable];

  return (
    <Card className="min-w-0 p-5 sm:p-6 shadow-sm border border-[#e2ebe5] bg-white">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#edf3ef] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f5ed] text-[#16804a]">
            <BarChart3 size={17} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#16362a]">
              Annual {meta.name} Time Series
            </h3>
            <p className="text-xs text-[#617b6c]">
              NASA observations with overlaid Theil–Sen robust trend estimate ({period})
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#f8faf9] border border-[#dce8e0] px-2.5 py-0.5 text-xs font-medium text-[#4e715f]">
          {cell.label}
        </span>
      </div>

      <TrendChart cell={cell} variable={variable} period={period} />

      <div className="mt-2 border-t border-[#edf3ef] pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#71877b]">
        <span>Hover over data points to inspect annual measurements.</span>
        <span className="font-medium text-[#16804a]">
          Method: Non-parametric median slope fitting
        </span>
      </div>
    </Card>
  );
}

function EmptyEvidence() {
  return (
    <Card className="flex min-h-[200px] flex-col items-center justify-center gap-2.5 px-6 py-10 text-center shadow-xs border-dashed border-[#c8ded0] bg-white">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f5ed] text-[#16804a]">
        <MapPinned size={22} />
      </div>
      <div>
        <h3 className="font-bold text-sm sm:text-base text-[#16362a]">
          Click any geographic location on the map
        </h3>
        <p className="max-w-md text-xs leading-relaxed text-[#617b6c] mt-1">
          Select any cell within the analyzed study region in either 2D or 3D view to inspect its
          rate of change, confidence interval, p-value, and interactive annual time series.
        </p>
      </div>
    </Card>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('Dashboard');
  const [draftVariable, setDraftVariable] = useState<EnvVariableId | ''>('');
  const [draftDataset, setDraftDataset] = useState<DatasetId | ''>('');
  const [draftRegion, setDraftRegion] = useState<RegionId | ''>('');
  const [draftPeriod, setDraftPeriod] = useState('');
  const [regionMode, setRegionMode] = useState<RegionSelectionMode>('preset');
  const [geoSelection, setGeoSelection] = useState<GeographicSelection | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('none');
  const [polygonVertexCount, setPolygonVertexCount] = useState(0);
  const [showDataGrid, setShowDataGrid] = useState(false);
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [paramsCollapsed, setParamsCollapsed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mode, setMode] = useState<MapMode>('trend');
  const [mapDimension, setMapDimension] = useState<'2d' | '3d'>('2d');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  const navigateToPage = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const hasRegion = regionMode === 'preset' ? !!draftRegion : !!geoSelection;
  const readyToAnalyze = !!(draftVariable && draftDataset && hasRegion && draftPeriod);

  const grid = useMemo(() => {
    if (!analysis) return null;
    if (analysis.geoSelection && analysis.geoSelection.type !== 'preset') {
      const bounds = getSelectionBounds(analysis.geoSelection);
      return generateGrid(bounds, analysis.period);
    }
    return generateGrid(analysis.region, analysis.period);
  }, [analysis]);

  const selected =
    grid?.features.find((f) => f.properties.id === selectedCellId)?.properties ?? null;

  const resetResult = () => {
    setAnalysis(null);
    setSelectedCellId(null);
    setParamsCollapsed(false);
  };

  const analyze = async () => {
    const regionValid = regionMode === 'preset' ? !!draftRegion : !!geoSelection;
    if (!draftVariable || !draftDataset || !regionValid || !draftPeriod) return;
    setIsAnalyzing(true);
    setUnsupportedMessage(null);

    const legacyVar = toLegacyVariable(draftVariable);
    const selection: GeographicSelection =
      regionMode === 'preset'
        ? {
            type: 'preset',
            regionId: draftRegion as RegionId,
            name: REGION_META[draftRegion as RegionId].name,
          }
        : geoSelection!;

    try {
      const res = await TerraScopeApi.runAnalysis({
        variable: legacyVar,
        envVariable: draftVariable,
        dataset: draftDataset,
        region: regionMode === 'preset' ? (draftRegion as RegionId) : 'mekong',
        geoSelection: selection,
        period: draftPeriod,
      });

      if (res.status === 'unsupported_region') {
        setUnsupportedMessage(
          res.errorMessage ??
            'The selected geographic location is outside this prototype’s calibrated data cache. In this demonstration, high-resolution gridded observations are available across Southeast Asia (8.5°N–23.5°N, 102°E–110°E). Global planetary retrieval via the NASA Earthdata Harmony API is scheduled for Phase 2.'
        );
        setAnalysis(null);
        setSelectedCellId(null);
        return;
      }

      setAnalysis({
        envVariable: draftVariable,
        dataset: draftDataset,
        variable: legacyVar,
        region: regionMode === 'preset' ? (draftRegion as RegionId) : 'mekong',
        period: draftPeriod,
        geoSelection: selection,
        bounds: res.region.bounds,
        status: 'complete',
        warnings: res.warnings,
      });
      setSelectedCellId(null);
      setMode('trend');
      setDrawMode('none');
      setParamsCollapsed(true);
      navigateToPage('Dashboard');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** Rule R12: 1-Click Demo for new users */
  const handleRunDemo = async () => {
    setDraftVariable('precipitation');
    setDraftDataset('gpm_imerg');
    setRegionMode('preset');
    setDraftRegion('mekong');
    setDraftPeriod('2005-2024');
    setGeoSelection({
      type: 'preset',
      regionId: 'mekong',
      name: REGION_META.mekong.name,
    });
    setIsAnalyzing(true);
    setUnsupportedMessage(null);
    try {
      const res = await TerraScopeApi.runAnalysis({
        variable: 'rain',
        envVariable: 'precipitation',
        dataset: 'gpm_imerg',
        region: 'mekong',
        period: '2005-2024',
      });
      setAnalysis({
        envVariable: 'precipitation',
        dataset: 'gpm_imerg',
        variable: 'rain',
        region: 'mekong',
        period: '2005-2024',
        bounds: res.region.bounds,
        status: 'complete',
        warnings: res.warnings,
      });
      setSelectedCellId(null);
      setMode('trend');
      setDrawMode('none');
      setParamsCollapsed(true);
      navigateToPage('Dashboard');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectVariable = (variable: EnvVariableId | '') => {
    setDraftVariable(variable);
    // Reset dataset if it's incompatible with the newly selected environmental variable
    if (!variable || (draftDataset && !VARIABLE_DATASET_MAP[variable]?.includes(draftDataset))) {
      setDraftDataset('');
    }
    resetResult();
    setUnsupportedMessage(null);
  };

  const selectDataset = (dataset: DatasetId | '') => {
    setDraftDataset(dataset);
    resetResult();
    setUnsupportedMessage(null);
  };

  const selectPeriod = (period: string) => {
    setDraftPeriod(period);
    resetResult();
    setUnsupportedMessage(null);
  };

  return (
    <div className="min-h-screen bg-[#f7faf8] text-[#16362a] flex flex-col font-sans">
      {/* Sleek, Compact Header */}
      <header className="border-b border-[#e2ebe5] bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-4 px-4 py-2.5 sm:px-7">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16362a] text-white shadow-xs">
              <Compass size={20} className="text-[#36ca89]" />
            </span>
            <div>
              <div className="text-base sm:text-lg font-black tracking-tight text-[#16362a] flex items-center gap-1.5">
                Terra-Scope
                <span className="rounded-md bg-[#e8f5ed] border border-[#cbe8d6] px-1.5 py-0.2 text-[10px] font-bold text-[#16804a]">
                  AI
                </span>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#71877b]">
                Earth Observation Intelligence
              </p>
            </div>
          </div>

          {/* Integrated Navigation Tabs */}
          <nav className="hidden md:flex items-center" aria-label="Main navigation">
            <div className="segmented-control-track">
              {PAGES.map((p) => {
                const isActive = page === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => navigateToPage(p)}
                    className={`segmented-tab ${isActive ? 'segmented-tab-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Discreet Synthetic Data Notice */}
          <div className="flex items-center">
            <div className="flex items-center gap-1.5 rounded-full bg-[#fdf9f4] border border-[#f5dfc6] px-2.5 py-1 text-[11px] font-medium text-[#93521b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
              <span className="hidden sm:inline">Simulated NASA Data Prototype</span>
              <span className="sm:hidden">Demo Data</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="md:hidden border-t border-[#edf3ef] px-4 py-1.5 flex justify-center overflow-x-auto">
          <div className="segmented-control-track">
            {PAGES.map((p) => {
              const isActive = page === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => navigateToPage(p)}
                  className={`segmented-tab ${isActive ? 'segmented-tab-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="mx-auto max-w-[1520px] w-full flex-1 px-4 pb-14 pt-5 sm:px-7">
        {page === 'Dashboard' && (
          <div className="space-y-5">
            {/* Welcoming Onboarding Hero with 1-Click Demo (Rule R12) */}
            <OnboardingGuide
              hasVariable={!!draftVariable}
              hasDataset={!!draftDataset}
              hasRegion={!!draftRegion}
              hasPeriod={!!draftPeriod}
              isAnalyzed={!!analysis}
              onRunDemo={handleRunDemo}
            />

            {/* Backend Quality Warnings (Rule R6) */}
            {analysis?.warnings && analysis.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block text-amber-900">
                    Backend Satellite Data Warnings:
                  </strong>
                  <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-amber-800">
                    {analysis.warnings.map((w, wi) => (
                      <li key={wi}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Dashboard Workspace Grid */}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              {/* Left Column: Analysis Configuration Panel */}
              {analysis && paramsCollapsed ? (
                <Card className="p-4 sm:p-5 shadow-sm border border-[#d6e7dc] bg-gradient-to-b from-white to-[#f8fbf9] space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[#edf3ef] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8f5ed] text-[#16804a]">
                        <Check size={14} className="stroke-[2.5]" />
                      </span>
                      <div>
                        <div className="text-xs font-bold text-[#16362a]">Active Analysis</div>
                        <div className="text-[10px] text-[#557563]">
                          {analysis.period} Multi-Decadal
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setParamsCollapsed(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#d2e3d7] bg-white px-2.5 py-1 text-xs font-semibold text-[#16804a] shadow-2xs hover:bg-[#f0f7f3] transition-colors"
                      title="Modify analysis parameters"
                    >
                      <SlidersHorizontal size={11} />
                      <span>Edit Parameters</span>
                    </button>
                  </div>

                  <div className="divide-y divide-[#edf3ef] rounded-xl border border-[#e4ece6] bg-white px-3 py-1 text-xs">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[11px] text-[#71877b]">Variable</span>
                      <span className="font-semibold text-[#16362a] text-[11px]">
                        {ENV_VARIABLES[analysis.envVariable]?.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[11px] text-[#71877b]">NASA Dataset</span>
                      <span className="font-semibold text-[#16362a] text-[11px]">
                        {DATASETS[analysis.dataset]?.shortName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[11px] text-[#71877b]">Region</span>
                      <span className="font-semibold text-[#16362a] text-[11px] text-right truncate max-w-[140px]">
                        {analysis.geoSelection?.type === 'preset'
                          ? REGION_META[analysis.geoSelection.regionId].name
                          : analysis.geoSelection?.label ?? REGION_META[analysis.region].name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[11px] text-[#71877b]">Observation Window</span>
                      <span className="font-semibold text-[#16362a] text-[11px]">
                        {analysis.period}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={resetResult}
                      className="w-full rounded-xl border border-[#dce7e0] bg-[#fafcfb] py-2 text-xs font-medium text-[#617b6c] hover:bg-[#f2f6f4] hover:text-[#16362a] transition-colors"
                    >
                      Reset / New Query
                    </button>
                  </div>
                </Card>
              ) : (
                <Card className="p-5 shadow-sm border border-[#e2ebe5] bg-white space-y-4">
                  <div className="flex items-center justify-between border-b border-[#edf3ef] pb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-[#16362a]">
                      <Database size={16} className="text-[#16804a]" />
                      <span>Analysis Parameters</span>
                    </div>
                    {analysis && (
                      <button
                        type="button"
                        onClick={() => setParamsCollapsed(true)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[#617b6c] hover:bg-[#f0f5f2] hover:text-[#16362a] transition"
                        title="Collapse parameters to view more map area"
                      >
                        <ChevronUp size={13} />
                        <span>Collapse</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* 1. Environmental Variable Selector */}
                    <div>
                      <label htmlFor="env-variable" className="field-label">
                        <span>Environmental Variable</span>
                        <InfoTooltip
                          title="Environmental Variable"
                          content={
                            draftVariable
                              ? ENV_VARIABLES[draftVariable].description
                              : 'Primary physical Earth system property to inspect. Initially supports Precipitation and Soil Moisture, with architecture prepared for Land Surface Temperature and Vegetation indices.'
                          }
                          metadata={
                            draftVariable
                              ? [
                                  { label: 'Variable', value: ENV_VARIABLES[draftVariable].name },
                                  {
                                    label: 'Physical Realm',
                                    value:
                                      draftVariable === 'precipitation'
                                        ? 'Atmospheric Hydrology'
                                        : 'Terrestrial Soil Hydrology',
                                  },
                                  {
                                    label: 'Compatible Missions',
                                    value: VARIABLE_DATASET_MAP[draftVariable]
                                      .map((id) => DATASETS[id].shortName)
                                      .join(', '),
                                  },
                                ]
                              : undefined
                          }
                        />
                      </label>
                      <select
                        id="env-variable"
                        className={fieldClass}
                        value={draftVariable}
                        onChange={(e) => selectVariable(e.target.value as EnvVariableId | '')}
                      >
                        <option value="">Choose an environmental variable</option>
                        <option value="precipitation">Precipitation (Atmospheric)</option>
                        <option value="soil_moisture">Soil Moisture (Hydrological)</option>
                      </select>
                    </div>

                    {/* 2. NASA Dataset Selector */}
                    <div>
                      <label htmlFor="nasa-dataset" className="field-label">
                        <span>NASA Dataset</span>
                        <InfoTooltip
                          title="NASA Observation Mission / Model"
                          content="Validated satellite mission or assimilation system supplying observations for the selected environmental variable. Automatically filters to compatible datasets."
                          metadata={
                            draftDataset
                              ? [
                                  { label: 'Mission / Product', value: DATASETS[draftDataset].name },
                                  { label: 'Provider', value: DATASETS[draftDataset].provider },
                                  {
                                    label: 'Spatial Resolution',
                                    value: DATASETS[draftDataset].spatialResolution,
                                  },
                                  {
                                    label: 'Temporal Resolution',
                                    value: DATASETS[draftDataset].temporalResolution,
                                  },
                                  { label: 'Coverage', value: DATASETS[draftDataset].coverage },
                                  { label: 'Measurement Unit', value: DATASETS[draftDataset].unit },
                                ]
                              : undefined
                          }
                        />
                      </label>
                      <select
                        id="nasa-dataset"
                        className={`${fieldClass} ${!draftVariable ? 'opacity-60 cursor-not-allowed bg-[#f3f6f4]' : ''}`}
                        value={draftDataset}
                        disabled={!draftVariable}
                        onChange={(e) => selectDataset(e.target.value as DatasetId | '')}
                      >
                        {!draftVariable ? (
                          <option value="">Select variable first</option>
                        ) : (
                          <>
                            <option value="">Choose a NASA dataset</option>
                            {getDatasetsForVariable(draftVariable).map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name} ({d.unit})
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>

                    {/* 3. Study Region Selector */}
                    <RegionSelector
                      regionMode={regionMode}
                      onRegionModeChange={(m) => {
                        setRegionMode(m);
                        resetResult();
                        setUnsupportedMessage(null);
                      }}
                      presetRegion={draftRegion}
                      onPresetRegionChange={(r) => {
                        setDraftRegion(r);
                        resetResult();
                        setUnsupportedMessage(null);
                      }}
                      geoSelection={geoSelection}
                      onGeoSelectionChange={(sel) => {
                        setGeoSelection(sel);
                        resetResult();
                        setUnsupportedMessage(null);
                      }}
                      drawMode={drawMode}
                      onDrawModeChange={(dm) => {
                        setDrawMode(dm);
                        if (dm !== 'none' && mapDimension === '3d' && dm !== 'point') {
                          setMapDimension('2d');
                        }
                      }}
                      polygonVertexCount={polygonVertexCount}
                      onFinishPolygon={() => {
                        setDrawMode('none');
                      }}
                    />

                    {/* 4. Time Range Selector */}
                    <div>
                      <label htmlFor="period" className="field-label">
                        <span>Time Range</span>
                        <InfoTooltip
                          title="Time Range"
                          content="Select the observation time window for the non-parametric trend computation."
                        />
                      </label>
                      <select
                        id="period"
                        className={fieldClass}
                        value={draftPeriod}
                        onChange={(e) => selectPeriod(e.target.value)}
                      >
                        <option value="">Choose a time range</option>
                        {periods.map((p) => (
                          <option key={p} value={p}>
                            {p.replace('-', ' to ')} (Annualized)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Unsupported Region Notification Banner */}
                    {unsupportedMessage && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                        <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold block text-amber-900">Outside Prototype Coverage</span>
                          <p className="mt-0.5 leading-relaxed text-[11px] text-amber-800">
                            {unsupportedMessage}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Run Analysis Action Button */}
                    <div className="pt-2">
                      <Button
                        className="w-full h-11 text-xs sm:text-sm font-semibold shadow-sm"
                        disabled={!readyToAnalyze || isAnalyzing}
                        onClick={analyze}
                      >
                        {isAnalyzing ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Processing Satellite Data...</span>
                          </>
                        ) : (
                          <>
                            <Play size={14} fill="currentColor" />
                            <span>Run Trend Analysis</span>
                          </>
                        )}
                      </Button>
                      {!readyToAnalyze && (
                        <p className="mt-1.5 text-center text-[11px] text-[#71877b]">
                          Complete all fields to run analysis.
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* Right Column: Geographic Map & Results */}
              <div className="min-w-0 space-y-5">
                {/* Map Card Container */}
                <Card className="p-4 sm:p-5 shadow-sm border border-[#e2ebe5] bg-white">
                  {/* Unified Sleek Map Header Toolbar */}
                  <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-[#edf3ef] pb-3">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-[#617b6c]">
                        <span className="font-bold text-[#16804a]">
                          {analysis?.geoSelection
                            ? analysis.geoSelection.type === 'preset'
                              ? REGION_META[analysis.geoSelection.regionId].name
                              : analysis.geoSelection.label ?? 'Custom Selected Area'
                            : regionMode === 'custom' && geoSelection
                            ? geoSelection.type === 'preset'
                              ? REGION_META[geoSelection.regionId].name
                              : geoSelection.label ?? 'Custom Selected Area'
                            : draftRegion
                            ? REGION_META[draftRegion].name
                            : 'Global View'}
                        </span>
                        {analysis && (
                          <span className="text-[#849a8d]">
                            · {ENV_VARIABLES[analysis.envVariable]?.name} ({DATASETS[analysis.dataset]?.shortName})
                          </span>
                        )}
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-[#16362a]">
                        Geospatial Observation Mesh
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Measured Value | Trend Over Time (when analyzed) */}
                      {analysis && (
                        <div className="segmented-control-track" role="group" aria-label="Overlay mode">
                          <button
                            type="button"
                            className={`segmented-tab ${mode === 'value' ? 'segmented-tab-active' : ''}`}
                            onClick={() => setMode('value')}
                            aria-pressed={mode === 'value'}
                            title="Spatial variation of average measured values"
                          >
                            <Activity size={12} />
                            <span>Value</span>
                          </button>
                          <button
                            type="button"
                            className={`segmented-tab ${mode === 'trend' ? 'segmented-tab-active' : ''}`}
                            onClick={() => setMode('trend')}
                            aria-pressed={mode === 'trend'}
                            title="Theil-Sen trend over time"
                          >
                            <TrendingUp size={12} />
                            <span>Trend</span>
                          </button>
                        </div>
                      )}

                      {/* Show Original Data Grid Toggle */}
                      {grid && (
                        <button
                          type="button"
                          onClick={() => setShowDataGrid(!showDataGrid)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                            showDataGrid
                              ? 'border-[#16804a] bg-[#e8f5ed] text-[#16804a] ring-1 ring-[#16804a]/20'
                              : 'border-[#dce7e0] bg-[#fafcfb] text-[#557564] hover:border-[#b7d3c3] hover:text-[#16362a]'
                          }`}
                          title="Toggle between continuous smoothed raster and discrete satellite measurement cells"
                          aria-pressed={showDataGrid}
                        >
                          <Grid3X3 size={13} className={showDataGrid ? 'text-[#16804a]' : 'text-[#71877b]'} />
                          <span>Grid: {showDataGrid ? 'ON' : 'OFF'}</span>
                        </button>
                      )}

                      {/* 2D Map | 3D Globe Segmented Control */}
                      <div className="segmented-control-track" role="group" aria-label="Earth map dimension">
                        <button
                          type="button"
                          className={`segmented-tab ${mapDimension === '2d' ? 'segmented-tab-active' : ''}`}
                          onClick={() => setMapDimension('2d')}
                          aria-pressed={mapDimension === '2d'}
                        >
                          <MapIcon size={12} />
                          <span>2D Map</span>
                        </button>
                        <button
                          type="button"
                          className={`segmented-tab ${mapDimension === '3d' ? 'segmented-tab-active' : ''}`}
                          onClick={() => setMapDimension('3d')}
                          aria-pressed={mapDimension === '3d'}
                        >
                          <Globe size={12} />
                          <span>3D Globe</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Active Map Component */}
                  {mapDimension === '2d' ? (
                    <TerraMap
                      draftRegion={regionMode === 'preset' ? draftRegion : ''}
                      analyzedRegion={analysis?.region ?? null}
                      variable={analysis?.variable ?? null}
                      mode={mode}
                      grid={grid}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                      showDataGrid={showDataGrid}
                      drawMode={drawMode}
                      customSelection={regionMode === 'custom' ? geoSelection : null}
                      onCustomSelectionChange={(sel) => {
                        setGeoSelection(sel);
                        resetResult();
                        setUnsupportedMessage(null);
                      }}
                      onPolygonVertexChange={setPolygonVertexCount}
                      analysisBounds={analysis?.bounds}
                    />
                  ) : (
                    <GlobeMap
                      draftRegion={regionMode === 'preset' ? draftRegion : ''}
                      analyzedRegion={analysis?.region ?? null}
                      variable={analysis?.variable ?? null}
                      mode={mode}
                      grid={grid}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                      showDataGrid={showDataGrid}
                      drawMode={drawMode}
                      customSelection={regionMode === 'custom' ? geoSelection : null}
                      onCustomSelectionChange={(sel) => {
                        setGeoSelection(sel);
                        resetResult();
                        setUnsupportedMessage(null);
                      }}
                      analysisBounds={analysis?.bounds}
                    />
                  )}

                  {/* Map Hint */}
                  {analysis && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#71877b]">
                      <span>
                        {mode === 'value'
                          ? 'Showing spatial variation of average measured values across the study region.'
                          : 'Diverging palette: Orange indicates decreasing, neutral near zero, green indicates increasing trend.'}
                      </span>
                      <span className="font-medium text-[#16804a]">
                        Switch between 2D Map and 3D Globe at any time without losing state.
                      </span>
                    </div>
                  )}
                </Card>

                {/* Evidence Section: Appears Only After Analysis */}
                {analysis &&
                  (selected ? (
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <StatisticsPanel cell={selected} variable={analysis.variable} />
                      <ChartPanel
                        cell={selected}
                        variable={analysis.variable}
                        period={analysis.period}
                      />
                    </div>
                  ) : (
                    <EmptyEvidence />
                  ))}

                {/* Pre-Analysis State Placeholder */}
                {!analysis && (
                  <Card className="flex flex-col items-center gap-2.5 px-6 py-9 text-center shadow-xs border-dashed border-[#cfe2d5] bg-white">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f5ed] text-[#16804a]">
                      <Activity size={22} />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-[#16362a]">
                        Analysis Results Will Appear Here
                      </h3>
                      <p className="max-w-md text-xs leading-relaxed text-[#617b6c] mt-1">
                        The georeferenced raster heatmap, trend scale, location-specific statistics,
                        and scientific time-series chart remain hidden until you run an analysis.
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Page 2: Compare Regions */}
        {page === 'Compare Regions' && (
          <ComparisonView
            initialVariable={analysis?.variable ?? 'rain'}
            initialPeriod={analysis?.period ?? '2005-2024'}
          />
        )}

        {/* Page 3: Evidence Report */}
        {page === 'Evidence Report' && (
          <EvidenceReportView analysis={analysis} selectedCell={selected} />
        )}
      </main>

      {/* Floating AI Earth Detective Assistant */}
      <AIEarthDetective
        currentVariable={analysis?.variable ?? null}
        currentRegion={analysis?.region ?? null}
        currentPeriod={analysis?.period}
        selectedCell={selected}
        metric={analysis && selected ? getMetric(selected, analysis.variable) : null}
      />

      {/* Refined Unified Footer */}
      <footer className="mt-auto border-t border-[#e2ebe5] bg-white py-4 text-xs text-[#71877b]">
        <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-3 px-4 sm:px-7">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#16362a]">Terra-Scope AI</span>
            <span>· NASA Space Apps Challenge Frontend Prototype</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span>FastAPI Architecture: /variables · /regions · /trends · /series · /compare · /explain · /reports</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
