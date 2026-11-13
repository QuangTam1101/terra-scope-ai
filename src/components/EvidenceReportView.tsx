import { useState } from 'react';
import {
  Download,
  FileCheck2,
  AlertOctagon,
  Printer,
  ShieldCheck,
  Clock,
  Layers,
  MapPin,
  Database,
  Activity,
} from 'lucide-react';
import { Card } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import { TerraScopeApi } from '../lib/api.ts';
import {
  VARIABLE_META,
  REGION_META,
  ENV_VARIABLES,
  DATASETS,
  getMetric,
  formatNumber,
  type CellProperties,
  type RegionId,
  type Variable,
  type EnvVariableId,
  type DatasetId,
} from '../lib/types.ts';

interface EvidenceReportViewProps {
  analysis: {
    variable: Variable;
    region: RegionId;
    period: string;
    envVariable?: EnvVariableId;
    dataset?: DatasetId;
  } | null;
  selectedCell: CellProperties | null;
}

type ReportTab = 'estimators' | 'provenance' | 'limitations';

export function EvidenceReportView({ analysis, selectedCell }: EvidenceReportViewProps) {
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>('estimators');

  const activeVariable: Variable = analysis?.variable ?? 'rain';
  const activeRegion: RegionId = analysis?.region ?? 'mekong';
  const activePeriod: string = analysis?.period ?? '2005-2024';

  const vMeta = VARIABLE_META[activeVariable];
  const rMeta = REGION_META[activeRegion];
  const envMeta = analysis?.envVariable ? ENV_VARIABLES[analysis.envVariable] : null;
  const dsMeta = analysis?.dataset ? DATASETS[analysis.dataset] : null;

  // Regional baseline fallback if no cell was selected
  const regionalFallback = {
    slope: activeVariable === 'rain' ? (activeRegion === 'mekong' ? 2.68 : -1.85) : (activeRegion === 'mekong' ? -0.003 : 0.002),
    ciLow: activeVariable === 'rain' ? (activeRegion === 'mekong' ? 1.42 : -3.15) : (activeRegion === 'mekong' ? -0.005 : 0.0005),
    ciHigh: activeVariable === 'rain' ? (activeRegion === 'mekong' ? 3.94 : -0.55) : (activeRegion === 'mekong' ? -0.001 : 0.0035),
    p: 0.012,
    significant: true,
    value: activeVariable === 'rain' ? (activeRegion === 'mekong' ? 198.4 : 142.1) : (activeRegion === 'mekong' ? 0.32 : 0.28),
    qualityPercent: 94,
    isAggregate: true,
  };

  const metric = selectedCell
    ? { ...getMetric(selectedCell, activeVariable), qualityPercent: selectedCell.qualityPercent, isAggregate: false }
    : regionalFallback;

  const handleDownloadJSON = () => {
    setDownloading(true);
    const reportData = TerraScopeApi.generateReportMetadata(
      activeVariable,
      activeRegion,
      activePeriod,
      selectedCell,
      analysis?.dataset,
      analysis?.envVariable
    );

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terra-scope-evidence-${activeVariable}-${activeRegion}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloading(false), 500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-1.5">
            <FileCheck2 size={13} />
            Scientific Provenance & Audit Trail
          </div>
          <h1 className="page-title">Evidence Dossier & Statistical Report</h1>
          <p className="page-description">
            Complete transparency into Earth observation data lineage, processing methodology, robust
            statistical estimators, and scientific uncertainty limits.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" onClick={handlePrint} className="gap-2 text-xs sm:text-sm h-10 shadow-2xs">
            <Printer size={14} />
            Print / PDF
          </Button>
          <Button onClick={handleDownloadJSON} disabled={downloading} className="gap-2 text-xs sm:text-sm h-10 shadow-sm">
            <Download size={14} />
            {downloading ? 'Exporting...' : 'Export JSON Evidence'}
          </Button>
        </div>
      </div>

      {/* Synthetic Warning Banner */}
      <div className="rounded-2xl border border-[#f5dfc6] bg-[#fdf9f4] p-3.5 text-xs text-[#8a5b1e] flex items-start gap-3 shadow-2xs">
        <AlertOctagon size={16} className="text-[#d28d5f] shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-semibold text-[#9a4b12]">SIMULATION NOTICE:</strong> All
          statistical figures and p-values shown below are generated
          for frontend demonstration. This application is architected to ingest validated findings from the
          team's FastAPI backend.
        </div>
      </div>

      {/* Analysis Overview Cards */}
      <Card className="p-5 sm:p-6 shadow-sm border border-[#e2ebe5] bg-white">
        <div className="flex flex-wrap items-center justify-between border-b border-[#edf3ef] pb-3.5 mb-4 gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#16804a]">
              Analysis Scope
            </span>
            <h2 className="text-base sm:text-lg font-bold text-[#16362a]">
              {vMeta.name} ({vMeta.dataset}) · {rMeta.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#f0f6f2] border border-[#d8e6de] px-3 py-0.5 text-xs font-semibold text-[#16804a]">
              {activePeriod}
            </span>
            {metric.isAggregate ? (
              <span className="rounded-full bg-[#f8faf9] border border-[#dce8e0] px-3 py-0.5 text-[11px] font-medium text-[#4e715f]">
                Basin Aggregate
              </span>
            ) : (
              <span className="rounded-full bg-[#e8f5ed] border border-[#bfe2ce] px-3 py-0.5 text-[11px] font-bold text-[#16804a]">
                Grid Cell {selectedCell?.label}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
            <span className="text-[#71877b] font-medium flex items-center gap-1.5">
              <Layers size={13} className="text-[#16804a]" /> Environmental Variable
            </span>
            <div className="mt-1 font-bold text-sm text-[#16362a]">{envMeta?.name ?? vMeta.name}</div>
            <div className="text-[10px] text-[#71877b] mt-0.5">{envMeta?.category ?? 'Earth Observation'}</div>
          </div>

          <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
            <span className="text-[#71877b] font-medium flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[#16804a]" /> NASA Mission / Product
            </span>
            <div className="mt-1 font-bold text-sm text-[#16362a]">{dsMeta?.name ?? vMeta.dataset}</div>
            <div className="text-[10px] text-[#71877b] mt-0.5">{vMeta.spatialResolution} · {vMeta.temporalResolution}</div>
          </div>

          <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
            <span className="text-[#71877b] font-medium flex items-center gap-1.5">
              <MapPin size={13} className="text-[#16804a]" /> Study Region
            </span>
            <div className="mt-1 font-bold text-sm text-[#16362a]">{rMeta.name}</div>
            <div className="text-[10px] text-[#71877b] mt-0.5">
              {rMeta.center[1]}°N, {rMeta.center[0]}°E
            </div>
          </div>

          <div className="rounded-xl bg-[#fafcfb] p-3 border border-[#e8f0eb]">
            <span className="text-[#71877b] font-medium flex items-center gap-1.5">
              <Clock size={13} className="text-[#16804a]" /> Multi-Decadal Span
            </span>
            <div className="mt-1 font-bold text-sm text-[#16362a]">{activePeriod}</div>
            <div className="text-[10px] text-[#71877b] mt-0.5">Annualized baseline record</div>
          </div>
        </div>
      </Card>

      {/* Segmented Section Navigator (Web) */}
      <div className="flex items-center justify-between border-b border-[#edf3ef] pb-2 print:hidden">
        <div className="segmented-control-track" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'estimators'}
            onClick={() => setActiveTab('estimators')}
            className={`segmented-tab ${activeTab === 'estimators' ? 'segmented-tab-active' : ''}`}
          >
            <Activity size={13} />
            <span>Statistical Estimators</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'provenance'}
            onClick={() => setActiveTab('provenance')}
            className={`segmented-tab ${activeTab === 'provenance' ? 'segmented-tab-active' : ''}`}
          >
            <Database size={13} />
            <span>NASA Data Lineage</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'limitations'}
            onClick={() => setActiveTab('limitations')}
            className={`segmented-tab ${activeTab === 'limitations' ? 'segmented-tab-active' : ''}`}
          >
            <AlertOctagon size={13} />
            <span>Methodology & Caveats</span>
          </button>
        </div>

        {metric.isAggregate && (
          <span className="hidden sm:inline text-[11px] text-[#71877b]">
            Showing basin aggregate values. Select a cell on Dashboard for localized analysis.
          </span>
        )}
      </div>

      {/* Section 1: Statistical Estimators */}
      <div className={`${activeTab === 'estimators' ? 'block' : 'hidden'} print:block space-y-4`}>
        <Card className="p-5 sm:p-6 shadow-sm border border-[#e2ebe5] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#16362a]">
                Non-Parametric Statistical Estimators
              </h3>
              <p className="text-xs text-[#71877b] mt-0.5">
                Computed using rank-based robust algorithms to minimize bias from extreme flood and drought events.
              </p>
            </div>
            <span className="rounded-full bg-[#f0f6f2] border border-[#d8e6de] px-2.5 py-0.5 text-[11px] font-semibold text-[#16804a]">
              {metric.isAggregate ? 'Basin Aggregate' : `Cell: ${selectedCell?.label}`}
            </span>
          </div>

          {/* Desktop & Print Table */}
          <div className="overflow-x-auto rounded-xl border border-[#e2ebe5]">
            <table className="w-full text-left text-xs text-[#16362a]">
              <thead className="bg-[#f8faf9] text-[11px] font-bold uppercase text-[#557563] border-b border-[#e2ebe5]">
                <tr>
                  <th className="py-2.5 px-3.5">Statistical Metric</th>
                  <th className="py-2.5 px-3.5">Algorithm / Method</th>
                  <th className="py-2.5 px-3.5">Estimated Value</th>
                  <th className="py-2.5 px-3.5">Scientific Interpretation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf3ef]">
                <tr className="hover:bg-[#fbfdfc] transition-colors">
                  <td className="py-3 px-3.5 font-semibold text-[#16362a]">Rate of Change (Slope)</td>
                  <td className="py-3 px-3.5 text-[#71877b]">Theil–Sen Robust Linear Estimator</td>
                  <td className="py-3 px-3.5 font-bold text-[#166534]">
                    {metric.slope >= 0 ? '+' : ''}{formatNumber(metric.slope, activeVariable, true)} {vMeta.slopeUnit}
                  </td>
                  <td className="py-3 px-3.5 text-[#71877b]">
                    Median of slopes between all pairwise observation years; immune to extreme flood or drought outliers.
                  </td>
                </tr>
                <tr className="hover:bg-[#fbfdfc] transition-colors">
                  <td className="py-3 px-3.5 font-semibold text-[#16362a]">95% Confidence Interval</td>
                  <td className="py-3 px-3.5 text-[#71877b]">Rank-based Sen–Kendall CI</td>
                  <td className="py-3 px-3.5 font-mono font-medium text-[#16362a]">
                    {metric.ciLow !== null && metric.ciHigh !== null
                      ? `[${formatNumber(metric.ciLow, activeVariable, true)}, ${formatNumber(metric.ciHigh, activeVariable, true)}]`
                      : 'N/A'}
                  </td>
                  <td className="py-3 px-3.5 text-[#71877b]">
                    Plausible range for true trend slope parameter; does not apply to single-year observations.
                  </td>
                </tr>
                <tr className="hover:bg-[#fbfdfc] transition-colors">
                  <td className="py-3 px-3.5 font-semibold text-[#16362a]">Hypothesis Test p-value</td>
                  <td className="py-3 px-3.5 text-[#71877b]">Seasonal Mann–Kendall Monotonic Test</td>
                  <td className="py-3 px-3.5 font-bold text-[#16362a]">
                    {metric.p !== null ? metric.p.toFixed(3) : 'N/A'}{' '}
                    <span className={`text-[10px] font-normal px-2 py-0.5 rounded-full ${metric.significant ? 'bg-[#e4f6eb] text-[#166534]' : 'bg-[#fff0e6] text-[#b45d24]'}`}>
                      {metric.significant ? 'p < 0.05' : 'p ≥ 0.05'}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-[#71877b]">
                    {metric.significant
                      ? 'p < 0.05: Rejects null hypothesis of no trend; observed shift is statistically significant.'
                      : 'p ≥ 0.05: Insufficient evidence to reject natural variation hypothesis.'}
                  </td>
                </tr>
                <tr className="hover:bg-[#fbfdfc] transition-colors">
                  <td className="py-3 px-3.5 font-semibold text-[#16362a]">Mean Aggregated Level</td>
                  <td className="py-3 px-3.5 text-[#71877b]">Temporal Arithmetic Mean</td>
                  <td className="py-3 px-3.5 font-bold text-[#16362a]">
                    {formatNumber(metric.value, activeVariable)} {vMeta.unit}
                  </td>
                  <td className="py-3 px-3.5 text-[#71877b]">
                    Baseline multi-decadal mean across the observation window.
                  </td>
                </tr>
                <tr className="hover:bg-[#fbfdfc] transition-colors">
                  <td className="py-3 px-3.5 font-semibold text-[#16362a]">Observation Completeness</td>
                  <td className="py-3 px-3.5 text-[#71877b]">Valid Observation Ratio</td>
                  <td className="py-3 px-3.5 font-bold text-[#16362a]">
                    {metric.qualityPercent}% valid scans
                  </td>
                  <td className="py-3 px-3.5 text-[#71877b]">
                    High-quality radiometric and model assimilation coverage threshold.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Section 2: NASA Data Lineage & Provenance */}
      <div className={`${activeTab === 'provenance' ? 'block' : 'hidden'} print:block space-y-4`}>
        <Card className="p-6 shadow-sm border border-[#e2ebe5] bg-white space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[#16362a] border-b border-[#edf3ef] pb-3">
            <ShieldCheck size={18} className="text-[#16804a]" />
            <span>NASA Data Pipeline & Provenance Architecture</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-[#617b6c]">
            <div className="rounded-xl border border-[#e8f0eb] bg-[#fafcfb] p-4 space-y-1.5">
              <div className="font-bold text-[#16362a]">Data Provider & Source</div>
              <p>{vMeta.provider}</p>
              <p className="text-[11px] text-[#71877b]">
                Standard calibrated level 3 / level 4 products retrieved from NASA Goddard Earth Sciences Data and Information Services Center (GES DISC).
              </p>
            </div>

            <div className="rounded-xl border border-[#e8f0eb] bg-[#fafcfb] p-4 space-y-1.5">
              <div className="font-bold text-[#16362a]">Spatial Mesh & Projection</div>
              <p>{vMeta.spatialResolution} native spatial grid.</p>
              <p className="text-[11px] text-[#71877b]">
                Reprojected to orthographic WGS84 coordinates to ensure continuous raster interpolation and seamless 2D/3D dual-map alignment.
              </p>
            </div>

            <div className="rounded-xl border border-[#e8f0eb] bg-[#fafcfb] p-4 space-y-1.5">
              <div className="font-bold text-[#16362a]">Temporal Cadence & Aggregation</div>
              <p>{vMeta.temporalResolution} aggregated time series.</p>
              <p className="text-[11px] text-[#71877b]">
                Monthly satellite observations annualized to reduce seasonal monsoonal intra-year variance while preserving multi-decadal climatic signals.
              </p>
            </div>

            <div className="rounded-xl border border-[#e8f0eb] bg-[#fafcfb] p-4 space-y-1.5">
              <div className="font-bold text-[#16362a]">Sensor Fusion & Calibration</div>
              <p>Multi-satellite passive microwave and radiometer fusion.</p>
              <p className="text-[11px] text-[#71877b]">
                Combines passive microwave radiometers, calibrated geostationary infrared observations, and GPCC ground rain-gauge adjustments.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Section 3: Methodology & Caveats */}
      <div className={`${activeTab === 'limitations' ? 'block' : 'hidden'} print:block space-y-4`}>
        <Card className="p-6 shadow-sm border border-[#e2ebe5] bg-white space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-[#16362a] border-b border-[#edf3ef] pb-3">
            <AlertOctagon size={18} className="text-[#d28d5f]" />
            <span>Scientific Limitations, Autocorrelation & Quality Controls</span>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-[#617b6c]">
            <div className="rounded-xl border border-[#f0f4f1] p-3.5 bg-[#fafcfb]">
              <strong className="text-[#16362a] block text-xs mb-1">Topographical & Emissivity Attenuation</strong>
              Passive microwave sensors encounter parallax and land-surface emissivity distortions over rugged terrain (e.g. Northern Annamite Range). Gridded uncertainty bounds widen in mountainous regions.
            </div>

            <div className="rounded-xl border border-[#f0f4f1] p-3.5 bg-[#fafcfb]">
              <strong className="text-[#16362a] block text-xs mb-1">Climatic Serial Autocorrelation</strong>
              Multi-year climatic oscillations (such as El Niño–Southern Oscillation) introduce serial persistence in hydrological time series. Standard OLS linear regressions are biased by such autocorrelations; our Theil–Sen estimator and non-parametric Mann–Kendall test provide robust protection.
            </div>

            <div className="rounded-xl border border-[#f0f4f1] p-3.5 bg-[#fafcfb]">
              <strong className="text-[#16362a] block text-xs mb-1">Zero-Value & Missing Scan Discipline</strong>
              Missing data due to sensor maintenance or cloud masking is strictly flagged as `NaN` or quality-masked, never imputed as zero rainfall or zero soil moisture.
            </div>

            <div className="rounded-xl border border-[#f0f4f1] p-3.5 bg-[#fafcfb]">
              <strong className="text-[#16362a] block text-xs mb-1">FastAPI Backend Integration Contract</strong>
              Standardized JSON schemas ensure seamless integration with the Python backend via documented endpoints (<code className="font-mono text-[10px] bg-[#edf6f0] px-1 py-0.5 rounded text-[#166534]">/variables</code>, <code className="font-mono text-[10px] bg-[#edf6f0] px-1 py-0.5 rounded text-[#166534]">/trends</code>, <code className="font-mono text-[10px] bg-[#edf6f0] px-1 py-0.5 rounded text-[#166534]">/reports</code>).
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
