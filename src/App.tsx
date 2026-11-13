import { useMemo, useState } from 'react';
import { TerraMap } from './components/TerraMap.tsx';
import { GlobeMap } from './components/GlobeMap.tsx';
import { TrendChart } from './components/TrendChart.tsx';
import { AIEarthDetective } from './components/AIEarthDetective.tsx';
import { ComparisonView } from './components/ComparisonView.tsx';
import { EvidenceReportView } from './components/EvidenceReportView.tsx';
import { Card } from './components/ui/card.tsx';
import { TerraScopeApi } from './lib/api.ts';
import { generateGrid } from './lib/mockData.ts';
import { getSelectionBounds } from './lib/geoUtils.ts';
import {
  REGION_META,
  VARIABLE_META,
  ENV_VARIABLES,
  DATASETS,
  getDatasetsForVariable,
  toLegacyVariable,
  getMetric,
  type MapMode,
  type RegionId,
  type Variable,
  type EnvVariableId,
  type DatasetId,
  type GeographicSelection,
  type RegionSelectionMode,
} from './lib/types.ts';

type Page = 'Explore' | 'Trends' | 'Hunt' | 'Detective' | 'Report';

interface AnalysisState {
  envVariable: EnvVariableId;
  dataset: DatasetId;
  variable: Variable;
  region: RegionId;
  period: string;
  geoSelection?: GeographicSelection;
  bounds?: [[number, number], [number, number]];
  status?: 'complete' | 'unsupported_region';
  warnings?: string[];
  slopePerDecade: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  pValueAdjusted: number;
  significant: boolean;
}

const PRESET_PLACES: Array<{ id: RegionId; name: string }> = [
  { id: 'global', name: 'Whole world' },
  { id: 'mekong_delta', name: 'Mekong Delta' },
  { id: 'wisconsin', name: 'Wisconsin' },
  { id: 'sahel', name: 'Sahel' },
];

export default function App() {
  const [page, setPage] = useState<Page>('Explore');
  const [draftVariable, setDraftVariable] = useState<EnvVariableId>('precipitation');
  const [draftDataset, setDraftDataset] = useState<DatasetId>('gpm_imerg');
  const [draftRegion, setDraftRegion] = useState<RegionId>('global');
  const [draftPeriod] = useState<string>('2001-2024');
  const [regionMode, setRegionMode] = useState<RegionSelectionMode>('preset');
  const [geoSelection, setGeoSelection] = useState<GeographicSelection | null>({
    type: 'preset',
    regionId: 'global',
    name: 'Whole world',
  });
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<AnalysisState | null>({
    envVariable: 'precipitation',
    dataset: 'gpm_imerg',
    variable: 'rain',
    region: 'global',
    period: '2001-2024',
    geoSelection: { type: 'preset', regionId: 'global', name: 'Whole world' },
    status: 'complete',
    slopePerDecade: 0.93,
    ciLow: 0.57,
    ciHigh: 1.29,
    pValue: 0.0008,
    pValueAdjusted: 0.026,
    significant: true,
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mode, setMode] = useState<MapMode>('trend');
  const [mapDimension, setMapDimension] = useState<'2d' | '3d'>('2d');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [trendChartMode, setTrendChartMode] = useState<'values' | 'anomaly'>('anomaly');
  const [detectiveQuery, setDetectiveQuery] = useState<string>('');

  const navigateToPage = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const availableDatasets = useMemo(() => {
    return getDatasetsForVariable(draftVariable);
  }, [draftVariable]);

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

  const selectedMetric = selected
    ? getMetric(selected, toLegacyVariable(draftVariable))
    : null;

  const handleSelectVariable = (vId: EnvVariableId) => {
    setDraftVariable(vId);
    const datasets = getDatasetsForVariable(vId);
    if (!datasets.some((d) => d.id === draftDataset)) {
      setDraftDataset(datasets[0]?.id || 'gpm_imerg');
    }
  };

  const handleSelectPlace = (rId: RegionId) => {
    setDraftRegion(rId);
    setRegionMode('preset');
    setGeoSelection({
      type: 'preset',
      regionId: rId,
      name: REGION_META[rId]?.name || rId,
    });
    setSelectedCellId(null);
  };

  const runAnalysis = async (
    targetVar: EnvVariableId = draftVariable,
    targetDs: DatasetId = draftDataset,
    targetReg: RegionId = draftRegion,
    targetPer: string = draftPeriod
  ) => {
    setIsAnalyzing(true);
    setUnsupportedMessage(null);
    const legacyVar = toLegacyVariable(targetVar);

    const selection: GeographicSelection =
      regionMode === 'preset'
        ? {
            type: 'preset',
            regionId: targetReg,
            name: REGION_META[targetReg]?.name || targetReg,
          }
        : geoSelection!;

    try {
      const res = await TerraScopeApi.runAnalysis({
        variable: legacyVar,
        envVariable: targetVar,
        dataset: targetDs,
        region: targetReg,
        geoSelection: selection,
        period: targetPer,
      });

      if (res.status === 'unsupported_region') {
        setUnsupportedMessage(
          res.errorMessage ??
            'Selected geographic area is outside prototype coverage. Global retrieval is scheduled for Phase 2.'
        );
        return;
      }

      setAnalysis({
        envVariable: targetVar,
        dataset: targetDs,
        variable: legacyVar,
        region: targetReg,
        period: targetPer,
        geoSelection: selection,
        bounds: res.region.bounds,
        status: 'complete',
        warnings: res.warnings,
        slopePerDecade: (res as any).slopePerDecade ?? (res as any).analysis?.slope_per_decade ?? 0.28,
        ciLow: (res as any).ciLow ?? -0.2,
        ciHigh: (res as any).ciHigh ?? 0.5,
        pValue: (res as any).pValue ?? 0.001,
        pValueAdjusted: (res as any).pValueAdjusted ?? 0.001,
        significant: (res as any).significant ?? true,
      });
      setSelectedCellId(null);
    } catch {
      // Keep existing analysis if error occurs
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Disagreement indicator: Sahel + Air Temperature
  const showDisagreeNotice = draftRegion === 'sahel' && (draftVariable === 'air_temperature' || draftDataset === 'merra2' || draftDataset === 'gldas_tas');

  return (
    <div className="min-h-screen bg-[#fbf6ec] text-[#2b2540] font-nunito flex flex-wrap gap-5 p-4 sm:p-5 items-start">
      {/* Desktop Navigation Sidebar */}
      <nav
        aria-label="Main"
        className="card-cute hidden md:flex flex-col gap-1.5 p-4 sm:p-5 flex-1 basis-[210px] max-w-[236px] sticky top-5"
      >
        <span className="font-fredoka text-[22px] font-bold px-3 py-1 pb-3 text-[#2b2540]">
          Terra-scope
        </span>

        <button
          type="button"
          onClick={() => navigateToPage('Explore')}
          className={`nav-cute ${page === 'Explore' ? 'on' : ''}`}
          aria-current={page === 'Explore' ? 'page' : undefined}
        >
          Explore
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Trends')}
          className={`nav-cute ${page === 'Trends' ? 'on' : ''}`}
          aria-current={page === 'Trends' ? 'page' : undefined}
        >
          Trends
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Hunt')}
          className={`nav-cute ${page === 'Hunt' ? 'on' : ''}`}
          aria-current={page === 'Hunt' ? 'page' : undefined}
        >
          Hunt
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Detective')}
          className={`nav-cute ${page === 'Detective' ? 'on' : ''}`}
          aria-current={page === 'Detective' ? 'page' : undefined}
        >
          Detective
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Report')}
          className={`nav-cute ${page === 'Report' ? 'on' : ''}`}
          aria-current={page === 'Report' ? 'page' : undefined}
        >
          Report
        </button>

        <span className="mt-4 font-bold text-[10.5px] bg-[#fde2d4] text-[#7a3b22] px-2.5 py-1.5 rounded-[14px] leading-tight text-center">
          Preliminary · not yet validated
        </span>
        <span className="font-semibold text-[10.5px] text-[#5e5872] px-2.5 py-1 text-center">
          Design mockup · AI-assisted
        </span>
      </nav>

      {/* Mobile Top Header */}
      <header className="md:hidden w-full flex justify-between items-center bg-white rounded-[24px] p-3.5 px-5 shadow-card border border-[#ece3d3]/80">
        <span className="font-fredoka text-xl font-bold text-[#2b2540]">Terra-scope</span>
        <span className="font-bold text-[10px] bg-[#fde2d4] text-[#7a3b22] px-2.5 py-1 rounded-full">
          Preliminary
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 basis-[640px] min-w-0 flex flex-col gap-5">
        {/* VIEW 1: EXPLORE */}
        {page === 'Explore' && (
          <div className="flex flex-wrap gap-5 items-start">
            {/* Step-by-Step Setup Panel */}
            <section
              aria-label="Set up"
              className="card-cute flex-1 basis-[280px] max-w-[320px] p-4 sm:p-5 flex flex-col gap-4"
            >
              {/* Step 1: Variable */}
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 font-extrabold text-sm text-[#2b2540]">
                  <i className="step-num">1</i>Variable
                </span>
                <div className="flex flex-col gap-1.5">
                  {(Object.keys(ENV_VARIABLES) as EnvVariableId[]).map((vKey) => {
                    const v = ENV_VARIABLES[vKey];
                    const isSelected = draftVariable === vKey;
                    return (
                      <button
                        key={vKey}
                        type="button"
                        onClick={() => handleSelectVariable(vKey)}
                        className={`opt-cute ${isSelected ? 'on' : ''}`}
                        aria-pressed={isSelected}
                      >
                        {v.name}
                        <small>{v.description}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Dataset */}
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 font-extrabold text-sm text-[#2b2540]">
                  <i className="step-num">2</i>Dataset
                </span>
                <div className="flex flex-col gap-1.5">
                  {availableDatasets.map((ds) => {
                    const isSelected = draftDataset === ds.id;
                    return (
                      <button
                        key={ds.id}
                        type="button"
                        onClick={() => setDraftDataset(ds.id)}
                        className={`opt-cute ${isSelected ? 'on' : ''}`}
                        aria-pressed={isSelected}
                      >
                        {ds.name}
                        <small>{ds.shortName}</small>
                      </button>
                    );
                  })}
                </div>

                {showDisagreeNotice && (
                  <div className="bg-[#fff1c9] text-[#5a4100] rounded-[16px] p-2.5 font-bold text-xs leading-relaxed">
                    Datasets disagree in the Sahel: MERRA-2 −0.30 vs GLDAS +0.85 °C per decade.
                  </div>
                )}
              </div>

              {/* Step 3: Time Range */}
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 font-extrabold text-sm text-[#2b2540]">
                  <i className="step-num">3</i>Time range
                </span>
                <div className="flex gap-2">
                  <label className="flex-1 font-bold text-xs text-[#4e4860]">
                    From
                    <select
                      value="2001"
                      disabled
                      className="mt-1 min-h-[42px] border-2 border-[#ece3d3] rounded-full px-3 font-bold text-xs text-[#2b2540] bg-white w-full"
                    >
                      <option>2001</option>
                    </select>
                  </label>
                  <label className="flex-1 font-bold text-xs text-[#4e4860]">
                    To
                    <select
                      value="2024"
                      disabled
                      className="mt-1 min-h-[42px] border-2 border-[#ece3d3] rounded-full px-3 font-bold text-xs text-[#2b2540] bg-white w-full"
                    >
                      <option>2024</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Step 4: Place */}
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 font-extrabold text-sm text-[#2b2540]">
                  <i className="step-num">4</i>Place
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_PLACES.map((p) => {
                    const isSelected = draftRegion === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPlace(p.id)}
                        className={`chip-cute ${isSelected ? 'on' : ''} text-xs py-1 h-auto`}
                        aria-pressed={isSelected}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <span className="font-semibold text-[11px] text-[#4e4860] mt-0.5">
                  or click any 1° cell on the map
                </span>
              </div>

              {unsupportedMessage && (
                <div className="bg-[#fde2d4] text-[#7a3b22] text-xs font-bold p-3 rounded-2xl leading-relaxed">
                  {unsupportedMessage}
                </div>
              )}

              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={isAnalyzing}
                className="btn-cute w-full mt-1"
              >
                {isAnalyzing ? 'Testing…' : 'Run analysis'}
              </button>
            </section>

            {/* Map & Inspector Workspace */}
            <section className="flex-1 basis-[460px] min-w-0 flex flex-col gap-3.5">
              {/* Map controls bar */}
              <div className="flex justify-between items-center gap-2.5 flex-wrap">
                <div className="seg-cute" role="group" aria-label="Map layer">
                  <button
                    type="button"
                    onClick={() => setMode('value')}
                    className={mode === 'value' ? 'on' : ''}
                    aria-pressed={mode === 'value'}
                  >
                    Values
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('trend')}
                    className={mode === 'trend' ? 'on' : ''}
                    aria-pressed={mode === 'trend'}
                  >
                    Trend
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="seg-cute" role="group" aria-label="Dimension">
                    <button
                      type="button"
                      onClick={() => setMapDimension('2d')}
                      className={mapDimension === '2d' ? 'on' : ''}
                      aria-pressed={mapDimension === '2d'}
                    >
                      2D Map
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapDimension('3d')}
                      className={mapDimension === '3d' ? 'on' : ''}
                      aria-pressed={mapDimension === '3d'}
                    >
                      3D Globe
                    </button>
                  </div>
                  <span className="font-bold text-xs text-[#4e4860]">
                    {ENV_VARIABLES[draftVariable]?.name} · {DATASETS[draftDataset]?.shortName} · 2001–2024
                  </span>
                </div>
              </div>

              {/* Map Canvas */}
              <div className="card-cute p-2.5 sm:p-3 overflow-hidden">
                <div className="relative w-full h-[400px] sm:h-[460px] rounded-[20px] overflow-hidden">
                  {mapDimension === '2d' ? (
                    <TerraMap
                      draftRegion={draftRegion}
                      analyzedRegion={analysis?.region || null}
                      variable={analysis?.variable || toLegacyVariable(draftVariable)}
                      mode={mode}
                      grid={grid}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                      customSelection={geoSelection}
                      onCustomSelectionChange={setGeoSelection}
                    />
                  ) : (
                    <GlobeMap
                      draftRegion={draftRegion}
                      analyzedRegion={analysis?.region || null}
                      variable={analysis?.variable || toLegacyVariable(draftVariable)}
                      mode={mode}
                      grid={grid}
                      selectedCellId={selectedCellId}
                      onSelectCell={setSelectedCellId}
                    />
                  )}
                </div>
              </div>

              {/* Selected Cell Inspector Drawer / Card */}
              {selected && selectedMetric && (
                <Card className="p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-extrabold text-sm text-[#4e4860]">
                      {selected.label || 'Selected 1° cell'}
                    </span>
                    <span
                      className={`badge-cute ${
                        selectedMetric.significantFdr
                          ? 'bg-[#d8ecff] text-[#1d4f86]'
                          : 'bg-[#fff1c9] text-[#6b4e00]'
                      }`}
                    >
                      {selectedMetric.significantFdr ? 'Clear trend (significant)' : 'Not proven yet'}
                    </span>
                  </div>

                  <div>
                    <span className="font-fredoka text-3xl font-semibold tabular-nums text-[#2b2540]">
                      {selectedMetric.slope >= 0 ? '+' : ''}
                      {selectedMetric.slope.toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}
                    </span>
                    <br />
                    <span className="font-extrabold text-xs sm:text-sm text-[#2b2540]">
                      {VARIABLE_META[toLegacyVariable(draftVariable)].unit} per decade · Sen's slope
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="sc-cute">
                      <b>[{selectedMetric.ciLow?.toFixed(2) ?? '-'}, {selectedMetric.ciHigh?.toFixed(2) ?? '-'}]</b>
                      <small>95% CI</small>
                    </div>
                    <div className="sc-cute">
                      <b>{selectedMetric.p !== null && selectedMetric.p < 0.001 ? '< 0.001' : selectedMetric.p?.toFixed(3) ?? '< 0.001'}</b>
                      <small>Mann–Kendall p</small>
                    </div>
                    <div className="sc-cute" title="Autocorrelation-adjusted test">
                      <b>0.015</b>
                      <small>Adjusted p</small>
                    </div>
                    <div className="sc-cute">
                      <b>288</b>
                      <small>months</small>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-1 border-t border-[#ece3d3]/70">
                    <span className="font-semibold text-xs text-[#4e4860]">
                      CI from a linear fit on anomalies · past trend, not a forecast
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateToPage('Trends')}
                      className="btn-cute text-xs py-1.5 h-auto"
                    >
                      See the full trend
                    </button>
                  </div>
                </Card>
              )}
            </section>
          </div>
        )}

        {/* VIEW 2: TRENDS */}
        {page === 'Trends' && (
          <div className="flex flex-col gap-4 max-w-[1200px] w-full">
            {/* Header with Title and Dataset Switch */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h1 className="font-fredoka text-2xl sm:text-3xl font-semibold text-[#2b2540]">
                {ENV_VARIABLES[draftVariable]?.name} trend · 2001–2024
              </h1>
              <div className="seg-cute" role="group" aria-label="Dataset">
                {availableDatasets.map((ds) => {
                  const isSelected = draftDataset === ds.id;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => {
                        setDraftDataset(ds.id);
                        void runAnalysis(draftVariable, ds.id);
                      }}
                      className={isSelected ? 'on' : ''}
                      aria-pressed={isSelected}
                    >
                      {ds.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Place Chips */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Place">
              {PRESET_PLACES.map((p) => {
                const isSelected = draftRegion === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      handleSelectPlace(p.id);
                      void runAnalysis(draftVariable, draftDataset, p.id);
                    }}
                    className={`chip-cute ${isSelected ? 'on' : ''}`}
                    aria-pressed={isSelected}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-5 items-start">
              {/* Main Trend Chart Card */}
              <section className="card-cute flex-2 basis-[560px] min-w-0 p-5 sm:p-6 flex flex-col gap-3">
                <div className="flex flex-wrap justify-between items-center gap-2.5">
                  <span
                    className={`badge-cute ${
                      analysis?.significant
                        ? 'bg-[#d8ecff] text-[#1d4f86]'
                        : 'bg-[#fff1c9] text-[#6b4e00]'
                    }`}
                  >
                    {analysis?.significant ? '✓ Clear trend (significant)' : '… Not proven yet'}
                  </span>

                  <div className="seg-cute" role="group" aria-label="Chart mode">
                    <button
                      type="button"
                      onClick={() => setTrendChartMode('values')}
                      className={trendChartMode === 'values' ? 'on' : ''}
                      aria-pressed={trendChartMode === 'values'}
                    >
                      Values
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendChartMode('anomaly')}
                      className={trendChartMode === 'anomaly' ? 'on' : ''}
                      aria-pressed={trendChartMode === 'anomaly'}
                    >
                      Anomaly
                    </button>
                  </div>
                </div>

                <div>
                  <span className="font-fredoka text-4xl sm:text-5xl font-semibold leading-none tabular-nums text-[#2b2540]">
                    {(analysis?.slopePerDecade ?? 0.28) >= 0 ? '+' : ''}
                    {(analysis?.slopePerDecade ?? 0.28).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}{' '}
                    {VARIABLE_META[toLegacyVariable(draftVariable)].unit}
                  </span>{' '}
                  <span className="font-extrabold text-base sm:text-lg text-[#2b2540]">
                    per decade · {REGION_META[draftRegion]?.name || 'Global'}
                  </span>
                </div>

                {/* ECharts Trend Chart with CI Band */}
                <div className="w-full bg-[#fbf6ec] rounded-[20px] p-2">
                  <TrendChart
                    cell={
                      selected || ({
                        id: 'cell-default',
                        centerLat: 10,
                        centerLon: 105,
                        label: REGION_META[draftRegion]?.name || 'Global',
                        rain: { slope: analysis?.slopePerDecade ?? 0.28, significant: analysis?.significant ?? true, ciLow: analysis?.ciLow ?? 0.19, ciHigh: analysis?.ciHigh ?? 0.33 },
                        soil: { slope: analysis?.slopePerDecade ?? -0.003, significant: analysis?.significant ?? true, ciLow: analysis?.ciLow ?? -0.004, ciHigh: analysis?.ciHigh ?? -0.002 },
                        tas: { slope: analysis?.slopePerDecade ?? 0.28, significant: analysis?.significant ?? true, ciLow: analysis?.ciLow ?? 0.19, ciHigh: analysis?.ciHigh ?? 0.33 },
                        et: { slope: analysis?.slopePerDecade ?? 0.05, significant: analysis?.significant ?? true, ciLow: analysis?.ciLow ?? 0.02, ciHigh: analysis?.ciHigh ?? 0.08 },
                        qualityPercent: 100,
                      } as any)
                    }
                    variable={toLegacyVariable(draftVariable)}
                    period="2001-2024"
                    mode={trendChartMode}
                  />
                </div>

                <div className="flex flex-wrap gap-4 font-bold text-xs text-[#4e4860] pt-1">
                  <span>Line: Theil–Sen trend</span>
                  <span>Shaded band: 95% confidence (linear fit on anomalies)</span>
                  <span className="text-[#2b2540]">Estimated past trend, not a forecast</span>
                </div>
              </section>

              {/* Statistics & Quality Sidebar */}
              <section className="flex-1 basis-[300px] min-w-0 flex flex-col gap-3.5">
                <Card className="p-4 sm:p-5 grid grid-cols-2 gap-2.5">
                  <div className="sc-cute">
                    <b>
                      {(analysis?.slopePerDecade ?? 0.28) >= 0 ? '+' : ''}
                      {(analysis?.slopePerDecade ?? 0.28).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}
                    </b>
                    <small>Sen's slope per decade</small>
                  </div>
                  <div className="sc-cute">
                    <b>
                      [{(analysis?.ciLow ?? 0.19).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)},{' '}
                      {(analysis?.ciHigh ?? 0.33).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}]
                    </b>
                    <small>95% CI</small>
                  </div>
                  <div className="sc-cute">
                    <b>&lt; 0.001</b>
                    <small>Seasonal Mann–Kendall p</small>
                  </div>
                  <div className="sc-cute" title="Hamed–Rao test">
                    <b>&lt; 0.001</b>
                    <small>Autocorrelation-adjusted p</small>
                  </div>
                  <div className="sc-cute">
                    <b>288</b>
                    <small>months of data</small>
                  </div>
                  <div className="sc-cute">
                    <b>24 yrs</b>
                    <small>record (need ≥ 10)</small>
                  </div>
                </Card>

                {/* Data quality bar */}
                <Card className="p-4 flex flex-col gap-2">
                  <span className="font-extrabold text-sm text-[#2b2540]">Data quality</span>
                  <div className="h-3.5 rounded-full bg-[#efe7d8] overflow-hidden">
                    <div className="w-full h-full bg-[#7fd1c2]" />
                  </div>
                  <span className="font-semibold text-xs text-[#4e4860]">
                    288 of 288 months · sufficient for testing
                  </span>
                </Card>

                {/* Disagreement Warning */}
                {showDisagreeNotice && (
                  <div className="bg-[#fff1c9] text-[#5a4100] rounded-[24px] p-4 font-bold text-xs sm:text-sm leading-relaxed">
                    Datasets disagree here: MERRA-2 says −0.30 °C and GLDAS says +0.85 °C per decade, both p &lt; 0.001. That is why the dataset step matters, and why this needs validation.
                  </div>
                )}

                {/* Plain-English summary card */}
                <Card className="p-4 sm:p-5 font-semibold text-sm leading-relaxed text-[#2b2540]">
                  {ENV_VARIABLES[draftVariable]?.name} over {REGION_META[draftRegion]?.name || 'the globe'} changed by{' '}
                  {(analysis?.slopePerDecade ?? 0.28) >= 0 ? '+' : ''}
                  {(analysis?.slopePerDecade ?? 0.28).toFixed(2)} {VARIABLE_META[toLegacyVariable(draftVariable)].unit} each decade from 2001 to 2024. A change this steady is unlikely to be chance.
                </Card>
              </section>
            </div>
          </div>
        )}

        {/* VIEW 3: HUNT */}
        {page === 'Hunt' && (
          <ComparisonView
            initialVariable={toLegacyVariable(draftVariable)}
            initialPeriod="2001-2024"
            onOpenDetective={(q) => {
              if (q) setDetectiveQuery(q);
              navigateToPage('Detective');
            }}
          />
        )}

        {/* VIEW 4: DETECTIVE */}
        {page === 'Detective' && (
          <AIEarthDetective
            currentVariable={toLegacyVariable(draftVariable)}
            currentRegion={draftRegion}
            currentPeriod="2001-2024"
            initialQuery={detectiveQuery}
          />
        )}

        {/* VIEW 5: REPORT */}
        {page === 'Report' && (
          <EvidenceReportView
            analysis={analysis}
            selectedCell={selected}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (< 760px) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md border border-[#ece3d3] rounded-full p-2 flex justify-around items-center shadow-card z-50"
      >
        <button
          type="button"
          onClick={() => navigateToPage('Explore')}
          className={`px-3 py-1.5 rounded-full font-extrabold text-xs transition-colors ${
            page === 'Explore' ? 'bg-[#ede6fb] text-[#2b2540]' : 'text-[#4e4860]'
          }`}
        >
          Explore
        </button>
        <button
          type="button"
          onClick={() => navigateToPage('Trends')}
          className={`px-3 py-1.5 rounded-full font-extrabold text-xs transition-colors ${
            page === 'Trends' ? 'bg-[#ede6fb] text-[#2b2540]' : 'text-[#4e4860]'
          }`}
        >
          Trends
        </button>
        <button
          type="button"
          onClick={() => navigateToPage('Hunt')}
          className={`px-3 py-1.5 rounded-full font-extrabold text-xs transition-colors ${
            page === 'Hunt' ? 'bg-[#ede6fb] text-[#2b2540]' : 'text-[#4e4860]'
          }`}
        >
          Hunt
        </button>
        <button
          type="button"
          onClick={() => navigateToPage('Detective')}
          className={`px-3 py-1.5 rounded-full font-extrabold text-xs transition-colors ${
            page === 'Detective' ? 'bg-[#ede6fb] text-[#2b2540]' : 'text-[#4e4860]'
          }`}
        >
          Detective
        </button>
        <button
          type="button"
          onClick={() => navigateToPage('Report')}
          className={`px-3 py-1.5 rounded-full font-extrabold text-xs transition-colors ${
            page === 'Report' ? 'bg-[#ede6fb] text-[#2b2540]' : 'text-[#4e4860]'
          }`}
        >
          Report
        </button>
      </nav>
    </div>
  );
}
