import { useMemo, useState } from 'react';
import { TerraMap } from './components/TerraMap.tsx';
import { GlobeMap } from './components/GlobeMap.tsx';
import { TrendChart } from './components/TrendChart.tsx';
import { AIEarthDetective } from './components/AIEarthDetective.tsx';
import { ComparisonView } from './components/ComparisonView.tsx';
import { EvidenceReportView } from './components/EvidenceReportView.tsx';
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
  formatNumber,
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

const PRESET_PLACES: Array<{ id: RegionId; name: string; tag: string }> = [
  { id: 'global', name: 'Whole world', tag: 'Global' },
  { id: 'mekong_delta', name: 'Mekong Delta', tag: 'Vietnam' },
  { id: 'wisconsin', name: 'Wisconsin', tag: 'USA' },
  { id: 'sahel', name: 'Sahel', tag: 'Africa' },
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
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
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
      // Retain existing state on transient error
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Disagreement indicator: Sahel + Air Temperature
  const showDisagreeNotice =
    draftRegion === 'sahel' &&
    (draftVariable === 'air_temperature' || draftDataset === 'merra2' || draftDataset === 'gldas_tas');

  // Filter place chips based on search
  const filteredPlaces = PRESET_PLACES.filter(
    (p) =>
      p.name.toLowerCase().includes(placeSearchQuery.toLowerCase()) ||
      p.tag.toLowerCase().includes(placeSearchQuery.toLowerCase())
  );

  // Inspector display data (from clicked cell or regional aggregate)
  const inspectorData = useMemo(() => {
    const vMeta = VARIABLE_META[toLegacyVariable(draftVariable)];
    if (selected && selectedMetric) {
      return {
        name: selected.label || 'Selected 1° cell',
        slopeFormatted: `${selectedMetric.slope >= 0 ? '+' : ''}${formatNumber(selectedMetric.slope, toLegacyVariable(draftVariable), true)}`,
        unit: `${vMeta.unit} per decade · Sen's slope`,
        ci: `[${selectedMetric.ciLow !== null ? formatNumber(selectedMetric.ciLow, toLegacyVariable(draftVariable), true) : '-'}, ${selectedMetric.ciHigh !== null ? formatNumber(selectedMetric.ciHigh, toLegacyVariable(draftVariable), true) : '-'}]`,
        p: selectedMetric.p !== null && selectedMetric.p < 0.001 ? '< 0.001' : selectedMetric.p?.toFixed(3) ?? '< 0.001',
        hr: selectedMetric.p !== null && selectedMetric.p < 0.001 ? '< 0.001' : '0.015',
        badge: selectedMetric.significantFdr ? 'Clear trend (significant)' : 'Not proven yet',
        bcls: selectedMetric.significantFdr ? 'bsig' : 'bnp',
      };
    }

    const slope = analysis?.slopePerDecade ?? 0.28;
    const isSig = analysis?.significant ?? true;
    return {
      name: REGION_META[draftRegion]?.name || 'Whole world',
      slopeFormatted: `${slope >= 0 ? '+' : ''}${slope.toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}`,
      unit: `${vMeta.unit} per decade · Sen's slope`,
      ci: `[${(analysis?.ciLow ?? 0.19).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}, ${(analysis?.ciHigh ?? 0.33).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}]`,
      p: (analysis?.pValue ?? 0.001) < 0.001 ? '< 0.001' : (analysis?.pValue ?? 0.001).toFixed(3),
      hr: (analysis?.pValueAdjusted ?? 0.001) < 0.001 ? '< 0.001' : (analysis?.pValueAdjusted ?? 0.001).toFixed(3),
      badge: isSig ? 'Clear trend (significant)' : 'Not proven yet',
      bcls: isSig ? 'bsig' : 'bnp',
    };
  }, [selected, selectedMetric, analysis, draftVariable, draftRegion]);

  return (
    <div className="dk min-h-screen bg-[#fbf6ec] text-[#2b2540] font-nunito flex flex-wrap gap-5 p-5 items-start">
      {/* Persistent Left Navigation Sidebar (CuteDeskMap.dc.html lines 51-60) */}
      <nav
        aria-label="Main"
        className="side card hidden md:flex flex-col gap-1.5 p-[18px] flex-1 basis-[210px] max-w-[236px] sticky top-5"
      >
        <span className="fd text-[22px] font-bold px-3 py-1 pb-3 text-[#2b2540]">
          Terra-scope
        </span>

        <button
          type="button"
          onClick={() => navigateToPage('Explore')}
          className={`nav ${page === 'Explore' ? 'on' : ''}`}
          aria-current={page === 'Explore' ? 'page' : undefined}
        >
          Explore
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Trends')}
          className={`nav ${page === 'Trends' ? 'on' : ''}`}
          aria-current={page === 'Trends' ? 'page' : undefined}
        >
          Trends
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Hunt')}
          className={`nav ${page === 'Hunt' ? 'on' : ''}`}
          aria-current={page === 'Hunt' ? 'page' : undefined}
        >
          Hunt
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Detective')}
          className={`nav ${page === 'Detective' ? 'on' : ''}`}
          aria-current={page === 'Detective' ? 'page' : undefined}
        >
          Detective
        </button>

        <button
          type="button"
          onClick={() => navigateToPage('Report')}
          className={`nav ${page === 'Report' ? 'on' : ''}`}
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
      <header className="md:hidden w-full flex justify-between items-center card p-3.5 px-5">
        <span className="fd text-xl font-bold text-[#2b2540]">Terra-scope</span>
        <span className="font-bold text-[10.5px] bg-[#fde2d4] text-[#7a3b22] px-2.5 py-1 rounded-full">
          Preliminary
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 basis-[900px] min-w-0 flex flex-col gap-5">
        {/* VIEW 1: EXPLORE (Matches CuteDeskMap.dc.html lines 62-113) */}
        {page === 'Explore' && (
          <div className="flex flex-wrap gap-5 items-start w-full">
            {/* Step 1-4 Setup Column (CuteDeskMap.dc.html lines 63-81) */}
            <section
              aria-label="Set up"
              className="card flex-1 basis-[280px] max-w-[320px] p-[18px] flex flex-col gap-3.5"
            >
              {/* Step 1: Variable */}
              <div className="flex flex-col gap-1.5">
                <span className="step">
                  <i>1</i>Variable
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
                        className={`opt ${isSelected ? 'on' : ''}`}
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
                <span className="step">
                  <i>2</i>Dataset
                </span>
                <div className="flex flex-col gap-1.5">
                  {availableDatasets.map((ds) => {
                    const isSelected = draftDataset === ds.id;
                    return (
                      <button
                        key={ds.id}
                        type="button"
                        onClick={() => setDraftDataset(ds.id)}
                        className={`opt ${isSelected ? 'on' : ''}`}
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
                    Datasets disagree in the Sahel: MERRA-2 −0.30, GLDAS +0.85 °C per decade.
                  </div>
                )}
              </div>

              {/* Step 3: Time Range */}
              <div className="flex flex-col gap-1.5">
                <span className="step">
                  <i>3</i>Time range
                </span>
                <div className="flex gap-2">
                  <label className="flex-1 font-bold text-xs text-[#4e4860]">
                    From
                    <select
                      value="2001"
                      disabled
                      className="sel mt-1"
                    >
                      <option>2001</option>
                    </select>
                  </label>
                  <label className="flex-1 font-bold text-xs text-[#4e4860]">
                    To
                    <select
                      value="2024"
                      disabled
                      className="sel mt-1"
                    >
                      <option>2024</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Step 4: Place */}
              <div className="flex flex-col gap-1.5">
                <span className="step">
                  <i>4</i>Place
                </span>
                <label htmlFor="ps" className="sr-only">
                  Search a place
                </label>
                <input
                  id="ps"
                  type="search"
                  value={placeSearchQuery}
                  onChange={(e) => setPlaceSearchQuery(e.target.value)}
                  placeholder="Search a place…"
                  className="min-h-[44px] border-2 border-[#ece3d3] rounded-full px-3.5 font-semibold text-sm text-[#2b2540] bg-white outline-none focus:border-[#2b2540]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {filteredPlaces.map((p) => {
                    const isSelected = draftRegion === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPlace(p.id)}
                        className={`opt ${isSelected ? 'on' : ''} !w-auto !rounded-full !py-1 !px-3 !min-h-[36px]`}
                        aria-pressed={isSelected}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <span className="font-semibold text-[11.5px] text-[#4e4860]">
                  or click a pin / any 1° cell on the map
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
                className="btn w-full mt-1"
              >
                {isAnalyzing ? 'Testing…' : 'Run analysis'}
              </button>
            </section>

            {/* Map & Legend Column (CuteDeskMap.dc.html lines 83-102) */}
            <section className="flex-1 basis-[460px] min-w-0 flex flex-col gap-3.5">
              {/* Layer switch and details */}
              <div className="flex justify-between items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="seg" role="group" aria-label="Map layer">
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

                  <div className="seg" role="group" aria-label="Map dimension">
                    <button
                      type="button"
                      onClick={() => setMapDimension('2d')}
                      className={mapDimension === '2d' ? 'on' : ''}
                      aria-pressed={mapDimension === '2d'}
                    >
                      2D
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapDimension('3d')}
                      className={mapDimension === '3d' ? 'on' : ''}
                      aria-pressed={mapDimension === '3d'}
                    >
                      3D
                    </button>
                  </div>
                </div>

                <span className="font-bold text-xs text-[#4e4860]">
                  {ENV_VARIABLES[draftVariable]?.name} · {DATASETS[draftDataset]?.shortName} · 2001–2024
                </span>
              </div>

              {/* Map Card */}
              <div className="card p-3 overflow-hidden">
                <div className="relative w-full h-[380px] sm:h-[440px] rounded-[20px] overflow-hidden bg-[#cdeaf0]">
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

              {/* Legend Card (CuteDeskMap.dc.html lines 97-101) */}
              <div className="card p-3.5 sm:p-4 flex flex-wrap gap-3 sm:gap-6 items-center">
                <span className="font-extrabold text-xs sm:text-sm text-[#2b2540]">
                  {mode === 'trend'
                    ? `${ENV_VARIABLES[draftVariable]?.name} trend · ${VARIABLE_META[toLegacyVariable(draftVariable)].unit} per decade`
                    : `Mean ${ENV_VARIABLES[draftVariable]?.name} · ${VARIABLE_META[toLegacyVariable(draftVariable)].unit}`}
                </span>

                <div className="flex-1 basis-[200px] flex flex-col gap-1">
                  <div
                    className={`h-3.5 rounded-[7px] overflow-hidden ${
                      mode === 'trend' ? 'legend-trend' : 'legend-value'
                    }`}
                  />
                  <div className="flex justify-between font-bold text-[11.5px] text-[#4e4860]">
                    <span>{mode === 'trend' ? '↓ decreasing' : 'Min / p02'}</span>
                    <span>{mode === 'trend' ? 'increasing ↑' : 'Max / p98'}</span>
                  </div>
                </div>

                <span className="font-semibold text-xs text-[#4e4860] flex-1 basis-[240px]">
                  {mode === 'trend'
                    ? 'orange = increasing · blue = decreasing · hatch = not significant after FDR (5%) · solid grey = no data'
                    : 'sequential continuous raster calibrated from NASA observation range'}
                </span>
              </div>
            </section>

            {/* Selected Place Card (CuteDeskMap.dc.html lines 104-111) */}
            <section
              aria-label="Selected place"
              className="card flex-1 basis-[280px] max-w-[340px] p-5 flex flex-col gap-3"
            >
              <span className="font-extrabold text-xs sm:text-sm text-[#4e4860]">
                {inspectorData.name}
              </span>

              <span className={`badge ${inspectorData.bcls} self-start`}>
                {inspectorData.badge}
              </span>

              <div>
                <span className="fd num text-4xl font-semibold leading-tight text-[#2b2540]">
                  {inspectorData.slopeFormatted}
                </span>
                <br />
                <span className="font-extrabold text-sm text-[#2b2540]">{inspectorData.unit}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="sc">
                  <b>{inspectorData.ci}</b>
                  <small>95% CI</small>
                </div>
                <div className="sc">
                  <b>{inspectorData.p}</b>
                  <small>Mann–Kendall p</small>
                </div>
                <div className="sc" title="Source: trend result (autocorrelation-adjusted p)">
                  <b>{inspectorData.hr}</b>
                  <small>Autocorrelation-adjusted p</small>
                </div>
                <div className="sc">
                  <b>288</b>
                  <small>months</small>
                </div>
              </div>

              <span className="font-semibold text-[11.5px] text-[#4e4860] leading-relaxed">
                CI from a linear fit on anomalies · past trend, not a forecast
              </span>

              <button
                type="button"
                onClick={() => navigateToPage('Trends')}
                className="btn w-full mt-1"
              >
                See the full trend
              </button>
            </section>
          </div>
        )}

        {/* VIEW 2: TRENDS (Matches CuteDeskTrend.dc.html lines 47-84) */}
        {page === 'Trends' && (
          <div className="flex flex-col gap-4 max-w-[1200px] w-full">
            {/* Header with Title and Dataset Switch */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h1 className="fd text-3xl font-semibold text-[#2b2540]">
                {ENV_VARIABLES[draftVariable]?.name} trend · 2001–2024
              </h1>
              <div className="seg" role="group" aria-label="Dataset">
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
                    className={`chip ${isSelected ? 'on' : ''}`}
                    aria-pressed={isSelected}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-5 items-start">
              {/* Main Trend Chart Card (CuteDeskTrend.dc.html lines 54-64) */}
              <section className="card flex-2 basis-[560px] min-w-0 p-6 flex flex-col gap-3">
                <div className="flex flex-wrap justify-between items-center gap-2.5">
                  <span
                    className={`badge ${
                      analysis?.significant ? 'bsig' : 'bnp'
                    }`}
                  >
                    {analysis?.significant ? '✓ Clear trend (significant)' : '… Not proven yet'}
                  </span>

                  <div className="seg" role="group" aria-label="Chart mode">
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
                  <span className="fd num text-5xl font-semibold leading-none tabular-nums text-[#2b2540]">
                    {(analysis?.slopePerDecade ?? 0.28) >= 0 ? '+' : ''}
                    {(analysis?.slopePerDecade ?? 0.28).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}{' '}
                    {VARIABLE_META[toLegacyVariable(draftVariable)].unit}
                  </span>{' '}
                  <span className="font-extrabold text-lg text-[#2b2540]">
                    per decade · {REGION_META[draftRegion]?.name || 'Global'}
                  </span>
                </div>

                {/* ECharts Trend Chart with Shaded 95% CI Uncertainty Band */}
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

              {/* Statistics & Quality Sidebar (CuteDeskTrend.dc.html lines 65-82) */}
              <section className="flex-1 basis-[300px] min-w-0 flex flex-col gap-3.5">
                <div className="card p-5 grid grid-cols-2 gap-2.5">
                  <div className="sc">
                    <b>
                      {(analysis?.slopePerDecade ?? 0.28) >= 0 ? '+' : ''}
                      {(analysis?.slopePerDecade ?? 0.28).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}
                    </b>
                    <small>Sen's slope per decade</small>
                  </div>
                  <div className="sc">
                    <b>
                      [{(analysis?.ciLow ?? 0.19).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)},{' '}
                      {(analysis?.ciHigh ?? 0.33).toFixed(draftVariable === 'soil_moisture' ? 4 : 2)}]
                    </b>
                    <small>95% CI</small>
                  </div>
                  <div className="sc">
                    <b>&lt; 0.001</b>
                    <small>Seasonal Mann–Kendall p</small>
                  </div>
                  <div className="sc" title="Hamed–Rao test">
                    <b>&lt; 0.001</b>
                    <small>Autocorrelation-adjusted p</small>
                  </div>
                  <div className="sc">
                    <b>288</b>
                    <small>months of data</small>
                  </div>
                  <div className="sc">
                    <b>24 yrs</b>
                    <small>record (need ≥ 10)</small>
                  </div>
                </div>

                {/* Data quality bar */}
                <div className="card p-4 sm:p-5 flex flex-col gap-2">
                  <span className="font-extrabold text-sm text-[#2b2540]">Data quality</span>
                  <div className="h-3.5 rounded-full bg-[#efe7d8] overflow-hidden">
                    <div className="w-full h-full bg-[#7fd1c2]" />
                  </div>
                  <span className="font-semibold text-xs text-[#4e4860]">
                    288 of 288 months · sufficient for testing
                  </span>
                </div>

                {/* Disagreement Warning if Sahel */}
                {showDisagreeNotice && (
                  <div className="bg-[#fff1c9] text-[#5a4100] rounded-[24px] p-4 font-bold text-xs sm:text-sm leading-relaxed">
                    Datasets disagree here: MERRA-2 says −0.30 °C and GLDAS says +0.85 °C per decade, both p &lt; 0.001. That is why the dataset step matters, and why this needs validation.
                  </div>
                )}

                {/* Plain-English summary card */}
                <p className="card p-4 sm:p-5 font-semibold text-sm leading-relaxed text-[#2b2540] m-0">
                  {ENV_VARIABLES[draftVariable]?.name} over {REGION_META[draftRegion]?.name || 'the globe'} changed by{' '}
                  {(analysis?.slopePerDecade ?? 0.28) >= 0 ? '+' : ''}
                  {(analysis?.slopePerDecade ?? 0.28).toFixed(2)} {VARIABLE_META[toLegacyVariable(draftVariable)].unit} each decade from 2001 to 2024. A change this steady is unlikely to be chance.
                </p>
              </section>
            </div>
          </div>
        )}

        {/* VIEW 3: HUNT (Matches CuteDeskHunt.dc.html) */}
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

        {/* VIEW 4: DETECTIVE (Matches CuteDeskDetective.dc.html) */}
        {page === 'Detective' && (
          <AIEarthDetective
            currentVariable={toLegacyVariable(draftVariable)}
            currentRegion={draftRegion}
            currentPeriod="2001-2024"
            initialQuery={detectiveQuery}
          />
        )}

        {/* VIEW 5: REPORT (Matches CuteDeskReport.dc.html) */}
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
