# Terra-Scope AI: Interactive Earth Observation & Environmental Trend Analysis

**NASA International Space Apps Challenge Platform**

Terra-Scope AI transforms complex multi-decadal NASA Earth observations into intuitive, interactive, scientifically credible environmental intelligence. Built with **React 19**, **TypeScript**, **Tailwind CSS**, **MapLibre GL**, a custom orthographic **Canvas2D 3D Globe**, and **Apache ECharts**.

> **SIMULATION & PROTOTYPE NOTICE:** All satellite observations, raster overlays, Theil–Sen slopes, Seasonal Mann–Kendall p-values, confidence intervals, and reports in this prototype are synthetically generated for UI/UX demonstration. They illustrate the exact proposed data contracts for our team's upcoming FastAPI backend and must not yet be cited as published scientific evidence.

---

## 1. Quick Start & Local Execution

Prerequisites: **Node.js 22** (or Node.js 20.19+) and **npm**.

```bash
# Install dependencies
npm install

# Launch local development server
npm run dev
```

Open **http://localhost:5173** in any modern web browser.

### Verification & Testing Commands

```bash
npm run test    # Runs 15 automated unit & workflow tests (globe projection, selection, invalidation, comparison)
npm run check   # Strict TypeScript static type check (tsc --noEmit)
npm run build   # Production bundle compilation (Vite + PostCSS + Tailwind)
npm run preview # Preview the compiled production build locally
```

---

## 2. Core Architectural & UX Pillars

### 10-Second First-Time User Experience
- **First visit**: Opens directly to a pristine global Earth map in 2D.
- **Zero data clutter**: No premature heatmaps, fabricated conclusions, or empty technical charts.
- **Welcoming 3-step guide**:
  1. *Choose your dataset* (NASA GPM IMERG Precipitation or GLDAS Soil Moisture).
  2. *Select a study region and multi-decadal time range* (Mekong Delta or Northern Vietnam).
  3. *Run analysis and explore results* (Reveals the georeferenced raster and enables geographic cell inspection).
- **Interactive validation**: The "Run Analysis" button remains disabled until all 3 required parameters are chosen. Changing any parameter immediately clears stale results.

### Dual-Map Engine: 2D Geographic Map + 3D Spherical Globe
- **2D Map (MapLibre GL)**: Interactive world map with zoom/pan, region boundary auto-fit, SVG fallback for systems without WebGL, coordinate readout on cursor hover, and click-to-select cell inspection.
- **3D Globe (Canvas2D Spherical Engine)**: A mathematically accurate orthographic spherical Earth projection rendering bundled coastline geometry. Supports touch and drag rotation, mouse wheel zoom, ⌖ region focus, and ◎ global view reset without requiring heavy WebGL frameworks.
- **Shared Analysis State**: Switching between 2D Map and 3D Globe **never resets** the selected dataset, region, time range, raster overlay mode, selected location, or time-series chart.

### Environmental Heatmap & Trend Visualizations
- **Measured Value Mode**: Continuous sequential green palette representing lower to higher average measured values, with numerical bounds and measurement units (`mm/month` or `m³/m³`).
- **Trend Over Time Mode**: Diverging palette: Orange (decreasing trend), light neutral (near-zero change), and green (increasing trend), with numerical slope units (`mm/month/year` or `m³/m³/year`).
- **Statistical Significance Indicators**: Explicit badge and tooltip callouts for $p < 0.05$ vs $p \ge 0.05$. Non-significant cells and missing data are clearly marked. Missing observations are never encoded as zero.

### Detailed Location Analysis & Scientific Line Charts
- Clicking any cell in 2D or 3D reveals:
  - Exact geographic coordinates (Latitude / Longitude).
  - Theil–Sen robust trend slope (median pairwise rate, robust to outliers).
  - 95% Confidence Interval on the slope.
  - Seasonal Mann–Kendall test p-value.
  - Observation completeness ratio.
  - Contextual tooltips explaining statistical concepts in plain language.
- **Apache ECharts Time-Series**:
  - Crisp teal/green solid line showing annual observations.
  - Contrasting dark green dashed line showing the fitted Theil–Sen trend line.
  - Rich interactive tooltips and responsive viewport resizing.

---

## 3. Dedicated Platform Pages

The application structure consists of exactly three main pages:

### Page 1: Dashboard (Primary Workspace)
Combines dataset configuration, study region focusing, dual 2D/3D maps, georeferenced environmental overlays, statistical inspection panels, and time-series charts in a single unified view.

### Page 2: Compare Regions (Contradiction Hunter)
- Directly answers: *Are neighboring or distant regions experiencing divergent or contradictory environmental trends?*
- Side-by-side regional comparison cards for Region A and Region B.
- Dynamic **Contradiction Hunter** callout detecting opposing trajectory slopes.
- $\Delta\text{ Slope}$ calculation.
- Aligned, synchronized multi-decadal time-series chart overlaying both regions.
- **Critical Scientific Caveat**: Highlights that opposite slope directions do not automatically prove a statistically significant difference between trends until confirmed by formal interaction tests.

### Page 3: Evidence Report
- Complete provenance and audit dossier for researchers and decision-makers.
- Summary of dataset parameters, spatial/temporal resolution, and selected cell metrics.
- Comprehensive table of statistical estimators and hypothesis test methods.
- Detailed breakdown of NASA sensor pipelines, known limitations, and uncertainty factors.
- **One-click Export**: Download structured JSON evidence reports with complete reproducibility metadata, and print-ready dossier formatting.

### AI Earth Detective (Unobtrusive Assistant)
- Floating assistant drawer accessible across all views.
- Educational explainers for complex statistics ($p$-values, confidence intervals, sensor fusion, Theil–Sen slope).
- Demonstrates how the planned FastAPI `/explain` endpoint will generate natural-language syntheses grounded in verified NASA data.

---

## 4. Backend API Integration Contract

All client communications route through `src/lib/api.ts`, which normalizes data structures so presentation components remain decoupled from individual NASA HDF5/NetCDF raw formats.

| Endpoint | Method | Planned FastAPI Functionality | Current Prototype State |
|---|---|---|---|
| `/variables` | GET | List available NASA observation datasets & units | Normalized metadata served from `VARIABLE_META` |
| `/regions` | GET | List supported geographic study areas & bounding boxes | Normalized metadata served from `REGION_META` |
| `/trends` | POST | Compute Theil–Sen slopes, Mann–Kendall $p$-values, and spatial raster | Simulated 600ms async latency with grid generator |
| `/series` | GET | Fetch annualized observation points & fitted trend line | Synchronized series generator with annual points |
| `/compare` | POST | Statistical comparison & interaction test between 2 regions | Dual-region comparison with contradiction detector |
| `/explain` | POST | LLM-assisted environmental synthesis with citations | Interactive preview with scientific explainers |
| `/reports` | GET | Download verifiable JSON evidence dossier | Standardized JSON export with provenance metadata |

---

## 5. Summary of Files Changed & Implemented

- `src/App.tsx`: Refined primary layout, welcoming 10-second onboarding, shared state manager, loading indicators, and page switcher.
- `src/components/TerraMap.tsx`: Enhanced 2D MapLibre map with reset to global view (◎), focus region (⌖), cursor coordinate readout, and numerical legend.
- `src/components/GlobeMap.tsx`: Enhanced 3D Canvas2D globe with touch controls, zoom controls, coordinate tracking, and numerical legend.
- `src/components/TrendChart.tsx`: Scientific Apache ECharts line chart with smooth observations, contrasting dashed trend, and rich tooltips.
- `src/components/OnboardingGuide.tsx`: Welcoming 3-step workflow guide explaining what to do within 10 seconds of opening.
- `src/components/AIEarthDetective.tsx`: Unobtrusive floating assistant drawer with preset educational queries and `/explain` integration.
- `src/components/ComparisonView.tsx`: Full Compare Regions page with Contradiction Hunter, slope delta, aligned charts, and statistical caveats.
- `src/components/EvidenceReportView.tsx`: Full Evidence Report page with methodology, sensor provenance, statistical tables, and JSON export.
- `src/components/ui/tooltip.tsx`: Accessible interactive statistical tooltips for $p$-values, confidence intervals, and Theil–Sen slope.
- `src/lib/api.ts`: Clean backend API abstraction layer implementing normalized client interfaces for all 7 planned FastAPI routes.
- `src/lib/types.ts`: Enhanced type definitions for variables, regions, metrics, and API contracts.
- `src/lib/mockData.ts`: Realistic synthetic grid and series generator with coordinates and completeness flags.
- `tests/workflow.test.mjs`: 10 comprehensive workflow tests verifying onboarding, invalidation, state preservation, comparisons, and reports.
- `tests/globe.test.mjs`: 5 mathematical projection and hit-testing tests for the 3D globe.

---

## 6. Test & Build Status

- **Unit & Workflow Tests**: 15/15 passed (`npm run test`).
- **Static Type Checking**: 0 errors (`npm run check` / `tsc --noEmit`).
- **Production Bundle Build**: 100% successful (`npm run build` completed in ~8.6s with Vite v6.4.6).
