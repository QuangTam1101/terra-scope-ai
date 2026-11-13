import { useState } from 'react';
import { Card } from './ui/card.tsx';
import { TerraScopeApi } from '../lib/api.ts';
import type { CellProperties, RegionId, Variable, EnvVariableId, DatasetId } from '../lib/types.ts';

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

export function EvidenceReportView({ analysis, selectedCell }: EvidenceReportViewProps) {
  const [includeFindings, setIncludeFindings] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeMaps, setIncludeMaps] = useState(true);
  const [includeDisagree, setIncludeDisagree] = useState(true);
  const [includeAiSummary, setIncludeAiSummary] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const activeVariable: Variable = analysis?.variable ?? 'rain';
  const activeRegion: RegionId = analysis?.region ?? 'mekong';
  const activePeriod: string = analysis?.period ?? '2001-2024';

  const handleExport = (format: 'pdf' | 'md' | 'link') => {
    if (format === 'md') {
      const reportData = TerraScopeApi.generateReportMetadata(
        activeVariable,
        activeRegion,
        activePeriod,
        selectedCell,
        analysis?.dataset,
        analysis?.envVariable
      );

      const markdownContent = `# Terra-Scope AI Evidence Report
**Date:** ${new Date().toISOString()}
**Report ID:** ${reportData.reportId}
**Status:** Preliminary · not yet validated

## Selected Scope
- Variable: ${activeVariable}
- Region: ${activeRegion}
- Period: ${activePeriod}
${selectedCell ? `- Selected Cell: ${selectedCell.label} (${selectedCell.centerLat}°N, ${selectedCell.centerLon}°E)` : ''}

## Methodology
Monthly area means tested with Seasonal Mann–Kendall test and Sen's slope per decade.
Autocorrelation adjustment evaluated with Hamed–Rao test.

## NASA Datasets
- Precipitation: GPM IMERG (GPM_3IMERGM V07)
- Soil Moisture & Evapotranspiration: GLDAS Noah (GLDAS_NOAH025_M 2.1)
- Air Temperature: MERRA-2 (M2IMNXASM 5.12.4) & GLDAS Noah

## Limits
A trend is not a cause. Trend lines are historical estimates, not forecasts.
`;

      const blob = new Blob([markdownContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terra-scope-evidence-report-${activeRegion}.md`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('Markdown report downloaded successfully.');
    } else {
      setExportNotice(`${format.toUpperCase()} export queued. Export uses POST /reports (planned in Phase 2).`);
    }

    setTimeout(() => {
      setExportNotice(null);
    }, 4500);
  };

  return (
    <div className="flex flex-wrap gap-5 items-start max-w-[1200px] w-full">
      {/* Main Report Column */}
      <main className="flex-1 basis-[640px] min-w-0 flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-2.5">
          <h1 className="font-fredoka text-2xl sm:text-3xl font-semibold text-[#2b2540]">
            Evidence report
          </h1>
          <span className="badge-cute bg-[#fff1c9] text-[#6b4e00] font-extrabold text-xs">
            Preliminary · not yet validated
          </span>
        </div>

        {/* Findings Table Card */}
        <Card className="p-4 sm:p-6 flex flex-col gap-2.5">
          <h2 className="font-fredoka text-lg sm:text-xl font-semibold text-[#2b2540]">
            Findings · 2001–2024 · per decade
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs sm:text-sm font-semibold min-w-[620px]">
              <thead>
                <tr className="border-b-2 border-[#ece3d3]">
                  <th className="text-left font-extrabold text-xs text-[#4e4860] py-2 px-2.5">
                    Place · variable · dataset
                  </th>
                  <th className="text-left font-extrabold text-xs text-[#4e4860] py-2 px-2.5">
                    Sen's slope
                  </th>
                  <th className="text-left font-extrabold text-xs text-[#4e4860] py-2 px-2.5">
                    95% CI
                  </th>
                  <th className="text-left font-extrabold text-xs text-[#4e4860] py-2 px-2.5">
                    Mann–Kendall p
                  </th>
                  <th
                    className="text-left font-extrabold text-xs text-[#4e4860] py-2 px-2.5"
                    title="Hamed–Rao test"
                  >
                    Autocorrelation-adjusted p
                  </th>
                  <th className="text-left font-extrabold text-xs text-[#4e4860] py-2 px-2.5">
                    Verdict
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ece3d3]/80">
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Whole world · air temp · MERRA-2</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">+0.14 °C</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[0.139, 0.197]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">0.015</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#d8ecff] text-[#1d4f86] text-xs">Clear trend</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Whole world · rain · GPM IMERG</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">+0.93 mm/month</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[0.57, 1.29]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">0.026</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#d8ecff] text-[#1d4f86] text-xs">Clear trend</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Whole world · soil · GLDAS</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">−0.0038 m³/m³</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[−0.0043, −0.0032]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#d8ecff] text-[#1d4f86] text-xs">Clear trend</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Mekong Delta · air temp · MERRA-2</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">+0.28 °C</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[0.19, 0.33]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#d8ecff] text-[#1d4f86] text-xs">Clear trend</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Mekong Delta · rain · GPM IMERG</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">+3.16 mm/month</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[−1.93, 19.24]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">0.11</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">0.45</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#fff1c9] text-[#6b4e00] text-xs">Not proven yet</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Sahel · air temp · MERRA-2 vs GLDAS</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">−0.30 vs +0.85 °C</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[−0.43, −0.18] / [0.64, 0.94]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">&lt;0.001</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#fff1c9] text-[#6b4e00] text-xs">Datasets disagree</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-2.5 text-[#2b2540]">Sahel vs Wisconsin · air temp · MERRA-2</td>
                  <td className="py-2.5 px-2.5 font-bold tabular-nums text-[#2b2540]">−0.51 °C (diff)</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">[−1.03, −0.02]</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">0.0075</td>
                  <td className="py-2.5 px-2.5 tabular-nums text-[#4e4860]">n/a</td>
                  <td className="py-2.5 px-2.5">
                    <span className="badge-cute bg-[#2b2540] text-white text-xs">Contradiction</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <span className="font-semibold text-xs text-[#4e4860] pt-1">
            CIs from a linear fit on anomalies; verdicts from the Seasonal Mann–Kendall test.
          </span>
        </Card>

        {/* 3 Information Sections */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Card className="p-4 flex flex-col gap-1.5">
            <h2 className="font-fredoka text-base font-semibold text-[#2b2540]">How we tested</h2>
            <p className="font-semibold text-xs leading-relaxed text-[#3d3752]">
              Monthly area means → Seasonal Mann–Kendall test and Sen's slope per decade; second opinion with the Hamed–Rao autocorrelation-adjusted test. Maps: Benjamini–Hochberg FDR at 5%.
            </p>
          </Card>

          <Card className="p-4 flex flex-col gap-1.5">
            <h2 className="font-fredoka text-base font-semibold text-[#2b2540]">NASA datasets</h2>
            <p className="font-semibold text-xs leading-relaxed text-[#3d3752]">
              GPM_3IMERGM V07 (precipitation) · GLDAS_NOAH025_M 2.1 (soil moisture, land temperature, evapotranspiration) · M2IMNXASM 5.12.4 (MERRA-2 2 m air temperature) · NASA GES DISC, regridded to 1°.
            </p>
          </Card>

          <Card className="p-4 flex flex-col gap-1.5">
            <h2 className="font-fredoka text-base font-semibold text-[#2b2540]">Limits</h2>
            <p className="font-semibold text-xs leading-relaxed text-[#3d3752]">
              A trend is not a cause · trend lines are past trends, not forecasts · datasets can disagree (Sahel) · GLDAS covers land only, with no irrigation or flooding · no salinity variable.
            </p>
          </Card>
        </div>
      </main>

      {/* Right Aside: Export Options */}
      <aside
        aria-label="Export"
        className="flex-1 basis-[260px] max-w-[320px] card-cute p-5 flex flex-col gap-3"
      >
        <span className="font-fredoka text-lg font-semibold text-[#2b2540]">Include</span>

        <label className="flex items-center gap-2.5 min-h-[32px] font-bold text-xs text-[#2b2540] cursor-pointer">
          <input
            type="checkbox"
            checked={includeFindings}
            onChange={(e) => setIncludeFindings(e.target.checked)}
            className="w-4 h-4 accent-[#2b2540]"
          />
          Findings table
        </label>

        <label className="flex items-center gap-2.5 min-h-[32px] font-bold text-xs text-[#2b2540] cursor-pointer">
          <input
            type="checkbox"
            checked={includeCharts}
            onChange={(e) => setIncludeCharts(e.target.checked)}
            className="w-4 h-4 accent-[#2b2540]"
          />
          Trend charts with CI bands
        </label>

        <label className="flex items-center gap-2.5 min-h-[32px] font-bold text-xs text-[#2b2540] cursor-pointer">
          <input
            type="checkbox"
            checked={includeMaps}
            onChange={(e) => setIncludeMaps(e.target.checked)}
            className="w-4 h-4 accent-[#2b2540]"
          />
          Trend maps (FDR)
        </label>

        <label className="flex items-center gap-2.5 min-h-[32px] font-bold text-xs text-[#2b2540] cursor-pointer">
          <input
            type="checkbox"
            checked={includeDisagree}
            onChange={(e) => setIncludeDisagree(e.target.checked)}
            className="w-4 h-4 accent-[#2b2540]"
          />
          Datasets-disagree note
        </label>

        <label className="flex items-center gap-2.5 min-h-[32px] font-bold text-xs text-[#2b2540] cursor-pointer">
          <input
            type="checkbox"
            checked={includeAiSummary}
            onChange={(e) => setIncludeAiSummary(e.target.checked)}
            className="w-4 h-4 accent-[#2b2540]"
          />
          AI summary (labelled AI-generated)
        </label>

        <button
          type="button"
          onClick={() => handleExport('pdf')}
          className="btn-cute w-full mt-2"
        >
          Export PDF
        </button>

        <button
          type="button"
          onClick={() => handleExport('md')}
          className="btn-cute soft w-full"
        >
          Export Markdown
        </button>

        <button
          type="button"
          onClick={() => handleExport('link')}
          className="btn-cute soft w-full"
        >
          Share link
        </button>

        {exportNotice && (
          <div className="bg-[#ede6fb] text-[#2b2540] text-xs font-bold p-2.5 rounded-xl mt-1">
            {exportNotice}
          </div>
        )}

        <span className="font-semibold text-xs text-[#4e4860] pt-1">
          Export uses POST /reports (planned).
        </span>
      </aside>
    </div>
  );
}
