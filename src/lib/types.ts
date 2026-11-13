import type { FeatureCollection, Polygon } from 'geojson';

export type Variable = 'rain' | 'soil';
export type EnvVariableId = 'precipitation' | 'soil_moisture';
export type DatasetId = 'gpm_imerg' | 'gldas';
export type MapMode = 'value' | 'trend';
export type RegionId = 'mekong' | 'north';
export type RegionSelectionMode = 'preset' | 'custom';
export type DrawMode = 'none' | 'point' | 'rectangle' | 'polygon';

export type GeographicSelection =
  | { type: 'preset'; regionId: RegionId; name: string }
  | { type: 'point'; coordinates: [number, number]; label?: string }
  | { type: 'bbox'; bounds: [[number, number], [number, number]]; label?: string }
  | { type: 'polygon'; coordinates: [number, number][][]; label?: string };

export interface EnvVariableMeta {
  id: EnvVariableId;
  name: string;
  category: 'Atmospheric' | 'Hydrological';
  description: string;
  defaultUnit: string;
  slopeUnit: string;
  supportedDatasets: DatasetId[];
  legacyKey: Variable;
}

export interface DatasetMeta {
  id: DatasetId;
  name: string;
  shortName: string;
  provider: string;
  variableId: EnvVariableId;
  spatialResolution: string;
  temporalResolution: string;
  coverage: string;
  unit: string;
  slopeUnit: string;
  description: string;
  legacyKey: Variable;
}

export const ENV_VARIABLES: Record<EnvVariableId, EnvVariableMeta> = {
  precipitation: {
    id: 'precipitation',
    name: 'Precipitation',
    category: 'Atmospheric',
    description: 'Atmospheric water deposition rate measured via spaceborne radar, microwave, and infrared radiometers.',
    defaultUnit: 'mm/month',
    slopeUnit: 'mm/month/year',
    supportedDatasets: ['gpm_imerg'],
    legacyKey: 'rain',
  },
  soil_moisture: {
    id: 'soil_moisture',
    name: 'Soil Moisture',
    category: 'Hydrological',
    description: 'Volumetric liquid water content in the surface soil layer (0-10 cm), simulated via land surface assimilation.',
    defaultUnit: 'm³/m³',
    slopeUnit: 'm³/m³/year',
    supportedDatasets: ['gldas'],
    legacyKey: 'soil',
  },
};

export const DATASETS: Record<DatasetId, DatasetMeta> = {
  gpm_imerg: {
    id: 'gpm_imerg',
    name: 'NASA GPM IMERG (V07B Final Run)',
    shortName: 'GPM IMERG',
    provider: 'NASA Goddard Earth Sciences (GES DISC)',
    variableId: 'precipitation',
    spatialResolution: '0.1° × 0.1° (~10 km)',
    temporalResolution: 'Monthly calibrated product',
    coverage: 'Global 60°N - 60°S',
    unit: 'mm/month',
    slopeUnit: 'mm/month/year',
    description: 'Global Precipitation Measurement Integrated Multi-satellitE Retrievals for GPM. Multi-satellite passive microwave and calibrated infrared precipitation estimation.',
    legacyKey: 'rain',
  },
  gldas: {
    id: 'gldas',
    name: 'NASA GLDAS Noah (GLDAS-2.1)',
    shortName: 'GLDAS',
    provider: 'NASA / NOAA GMAO',
    variableId: 'soil_moisture',
    spatialResolution: '0.25° × 0.25° (~25 km)',
    temporalResolution: 'Monthly surface layer (0-10 cm)',
    coverage: 'Global land surface',
    unit: 'm³/m³',
    slopeUnit: 'm³/m³/year',
    description: 'Global Land Data Assimilation System Noah Land Surface Model. Physics-based assimilation of satellite radiation and precipitation forcings.',
    legacyKey: 'soil',
  },
};

export const VARIABLE_DATASET_MAP: Record<EnvVariableId, DatasetId[]> = {
  precipitation: ['gpm_imerg'],
  soil_moisture: ['gldas'],
};

export function getDatasetsForVariable(varId: EnvVariableId | ''): DatasetMeta[] {
  if (!varId || !VARIABLE_DATASET_MAP[varId]) return [];
  return VARIABLE_DATASET_MAP[varId].map((dId) => DATASETS[dId]);
}

export function toLegacyVariable(varId: EnvVariableId | Variable): Variable {
  if (varId === 'precipitation' || varId === 'rain') return 'rain';
  if (varId === 'soil_moisture' || varId === 'soil') return 'soil';
  return 'rain';
}

export type CellProperties = {
  id: string;
  label: string;
  centerLon: number;
  centerLat: number;
  rainValue: number;
  rainSlope: number;
  rainP: number | null;
  rainCiLow: number | null;
  rainCiHigh: number | null;
  rainSignificant: boolean;
  rainSignificantFdr?: boolean;
  rainMissing: boolean;
  soilValue: number;
  soilSlope: number;
  soilP: number | null;
  soilCiLow: number | null;
  soilCiHigh: number | null;
  soilSignificant: boolean;
  soilSignificantFdr?: boolean;
  soilMissing: boolean;
  qualityPercent: number;
};

export type Grid = FeatureCollection<Polygon, CellProperties>;

export type Metric = {
  value: number;
  slope: number;
  p: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  significant: boolean;
  significantFdr?: boolean;
  missing: boolean;
};

export interface VariableMeta {
  id: Variable;
  name: string;
  dataset: string;
  description: string;
  unit: string;
  slopeUnit: string;
  range: number;
  valueMin: number;
  valueMid: number;
  valueMax: number;
  provider: string;
  spatialResolution: string;
  temporalResolution: string;
}

export const VARIABLE_META: Record<Variable, VariableMeta> = {
  rain: {
    id: 'rain',
    name: 'Precipitation',
    dataset: 'GPM IMERG',
    description: 'Global Precipitation Measurement Integrated Multi-satellitE Retrievals for GPM (V07B Final Run)',
    unit: 'mm/month',
    slopeUnit: 'mm/month/year',
    range: 3,
    valueMin: 50,
    valueMid: 155,
    valueMax: 280,
    provider: 'NASA Goddard Earth Sciences Data and Information Services Center (GES DISC)',
    spatialResolution: '0.1° × 0.1° (~10 km)',
    temporalResolution: 'Monthly satellite product',
  },
  soil: {
    id: 'soil',
    name: 'Soil Moisture',
    dataset: 'GLDAS',
    description: 'Global Land Data Assimilation System Noah Land Surface Model (GLDAS-2.1)',
    unit: 'm³/m³',
    slopeUnit: 'm³/m³/year',
    range: 0.005,
    valueMin: 0.12,
    valueMid: 0.26,
    valueMax: 0.42,
    provider: 'NASA / NOAA Global Modeling and Assimilation Office',
    spatialResolution: '0.25° × 0.25° (~25 km)',
    temporalResolution: 'Monthly surface layer (0-10 cm)',
  },
};

export interface RegionMeta {
  id: RegionId;
  name: string;
  country: string;
  description: string;
  center: [number, number]; // [lon, lat]
  bounds: [[number, number], [number, number]]; // [[minLon, minLat], [maxLon, maxLat]]
}

export const REGION_META: Record<RegionId, RegionMeta> = {
  mekong: {
    id: 'mekong',
    name: 'Mekong Delta',
    country: 'Vietnam',
    description: 'Southern agricultural river basin characterized by intensive rice cultivation and seasonal monsoon inundation.',
    center: [105.75, 10.3],
    bounds: [[104.65, 9.2], [106.85, 11.45]],
  },
  north: {
    id: 'north',
    name: 'Northern Vietnam',
    country: 'Vietnam',
    description: 'Mountainous and Red River basin region subject to subtropical monsoonal cycles and varied topographical climates.',
    center: [105.85, 21.15],
    bounds: [[104.5, 20.1], [107.25, 22.25]],
  },
};

export function getMetric(props: CellProperties, variable: Variable): Metric {
  if (variable === 'rain') {
    return {
      value: props.rainValue,
      slope: props.rainSlope,
      p: props.rainP,
      ciLow: props.rainCiLow,
      ciHigh: props.rainCiHigh,
      significant: props.rainSignificant,
      significantFdr: props.rainSignificantFdr ?? props.rainSignificant,
      missing: props.rainMissing,
    };
  }
  return {
    value: props.soilValue,
    slope: props.soilSlope,
    p: props.soilP,
    ciLow: props.soilCiLow,
    ciHigh: props.soilCiHigh,
    significant: props.soilSignificant,
    significantFdr: props.soilSignificantFdr ?? props.soilSignificant,
    missing: props.soilMissing,
  };
}

export function formatNumber(value: number, variable: Variable, isSlope = false) {
  return value.toFixed(variable === 'rain' ? (isSlope ? 2 : 1) : (isSlope ? 4 : 3));
}

// ============================================================================
// Official Frontend <-> Backend Contract Types (Hợp đồng Frontend ↔ Backend v0.1)
// ============================================================================

export type MonthString = string; // "YYYY-MM" (e.g. "2001-01")
export type BBox = [number, number, number, number]; // [west, south, east, north]

export type RegionRef =
  | { type: 'preset'; id: string; name?: string }
  | { type: 'bbox'; bbox: BBox; name?: string }
  | { type: 'geojson'; geometry: FeatureCollection | Polygon | any; name?: string };

export type Direction = 'increasing' | 'decreasing' | 'no_trend';
export type TrendMethod = 'seasonal_mk' | 'mk_anomaly';

export interface DataSource {
  product: string;
  version: string;
  provider: string;
  url: string;
  citation?: string;
}

export interface Quality {
  n_months: number;
  missing_months: number;
  coverage_fraction: number;
  sufficient: boolean;
}

export interface ApiVariableItem {
  id: string;
  name: string;
  category: string;
  description_simple: string;
  description_technical?: string;
  units: string;
  display_units: string;
  temporal_resolution: string;
  spatial_resolution_deg: number;
  coverage: { start: MonthString; end: MonthString };
  source: DataSource;
}

export interface ApiVariablesResponse {
  variables: ApiVariableItem[];
}

export interface ApiRegionItem {
  id: string;
  name: string;
  bbox: BBox;
  geometry?: any;
  is_demo?: boolean;
}

export interface ApiRegionsResponse {
  regions: ApiRegionItem[];
  limits: { max_bbox_area_deg2: number };
}

export interface ApiSeriesPoint {
  t: MonthString;
  value: number | null;
  anomaly: number | null;
  valid_fraction: number;
}

export interface ApiSeriesRequest {
  variable_id: string;
  region: RegionRef;
  start: MonthString;
  end: MonthString;
}

export interface ApiSeriesResponse {
  variable_id: string;
  region: RegionRef;
  units: string;
  points: ApiSeriesPoint[];
  climatology: number[]; // 12 elements
  quality: Quality;
  source: DataSource;
  warnings?: string[];
}

export interface ApiTrendRequest {
  variable_id: string;
  region: RegionRef;
  start: MonthString;
  end: MonthString;
  method?: TrendMethod;
  alpha?: number;
}

export interface ApiTrendResponse {
  trend_id: string;
  variable_id: string;
  region: RegionRef;
  units: string;
  method: TrendMethod;
  slope_method: string;
  slope_per_decade: number | null;
  slope_ci: [number | null, number | null] | null;
  ci_level: number;
  p_value: number | null;
  tau?: number;
  alpha: number;
  significant: boolean | null;
  direction: Direction;
  n: number;
  autocorrelation_adjusted?: boolean;
  trend_line?: Array<{ t: MonthString; value: number }>;
  quality: Quality;
  plain_summary: string;
  source: DataSource;
  warnings?: string[];
}

export interface ApiGridCell {
  lon: number;
  lat: number;
  slope_per_decade: number | null;
  p_value: number | null;
  q_value?: number | null;
  significant_fdr: boolean | null;
  valid: boolean;
}

export interface ApiGridResponse {
  variable_id: string;
  units: string;
  cell_size_deg: number;
  fdr_method?: string;
  alpha: number;
  value_range: { min_slope: number; max_slope: number };
  cells: ApiGridCell[];
  precomputed: boolean;
  warnings?: string[];
}

export interface ApiCompareRequest {
  variable_id: string;
  region_a: RegionRef;
  region_b: RegionRef;
  start: MonthString;
  end: MonthString;
  method?: TrendMethod;
  alpha?: number;
}

export interface ApiCompareResponse {
  a: ApiTrendResponse;
  b: ApiTrendResponse;
  difference: {
    slope_diff_per_decade: number;
    ci: [number, number];
    p_value: number;
    significant: boolean;
    test: string;
  };
  is_contradiction: boolean;
  verdict: 'opposite_significant' | 'opposite_not_significant' | 'same_direction' | 'insufficient_data';
  plain_summary: string;
  warnings?: string[];
}

export interface ApiJobResponse<T = any> {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress?: number;
  result?: T | null;
  error?: ApiErrorPayload | null;
  status_url?: string;
}

export interface ApiCitedNumber {
  label: string;
  value: number;
  units: string;
  source_field: string;
}

export interface ApiAction {
  type: string;
  params: Record<string, any>;
}

export interface ApiExplainRequest {
  question: string;
  context?: {
    trend_ids?: string[];
    variable_id?: string;
    region?: RegionRef;
    period?: string;
  };
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ApiExplainResponse {
  answer: string;
  cited_numbers?: ApiCitedNumber[];
  actions?: ApiAction[];
  disclaimer: string;
  model?: string;
  warnings?: string[];
}

export interface ApiReportRequest {
  trend_ids: string[];
  compare_ids?: string[];
  format: 'pdf' | 'md' | 'html';
}

export interface ApiReportResponse {
  report_id: string;
  status: 'done' | 'queued' | 'running';
  download_url?: string;
  expires_at?: string;
  warnings?: string[];
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'REGION_TOO_LARGE'
  | 'INVALID_TIME_RANGE'
  | 'NOT_FOUND'
  | 'NO_DATA'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export interface ApiErrorPayload {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, any>;
  retryable?: boolean;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}
