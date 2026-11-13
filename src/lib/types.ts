import type { FeatureCollection, Polygon } from 'geojson';

export type Variable = 'rain' | 'soil' | 'heat' | 'et';
export type EnvVariableId = 'precipitation' | 'soil_moisture' | 'air_temperature' | 'evapotranspiration';
export type DatasetId = 'gpm_imerg' | 'gldas' | 'merra2' | 'gldas_tas' | 'gldas_et';
export type MapMode = 'value' | 'trend';
export type RegionId = 'global' | 'mekong' | 'mekong_delta' | 'mekong_region' | 'north' | 'wisconsin' | 'sahel';
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
  category: 'Atmospheric' | 'Hydrological' | 'Thermal';
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
  landOnly?: boolean;
}

export const ENV_VARIABLES: Record<EnvVariableId, EnvVariableMeta> = {
  precipitation: {
    id: 'precipitation',
    name: 'Precipitation',
    category: 'Atmospheric',
    description: 'Atmospheric water deposition rate measured via spaceborne radar, microwave, and infrared radiometers.',
    defaultUnit: 'mm/month',
    slopeUnit: 'mm/month per decade',
    supportedDatasets: ['gpm_imerg'],
    legacyKey: 'rain',
  },
  soil_moisture: {
    id: 'soil_moisture',
    name: 'Soil Moisture',
    category: 'Hydrological',
    description: 'Volumetric liquid water content in the surface soil layer (0-10 cm), simulated via land surface assimilation.',
    defaultUnit: 'm³/m³',
    slopeUnit: 'm³/m³ per decade',
    supportedDatasets: ['gldas'],
    legacyKey: 'soil',
  },
  air_temperature: {
    id: 'air_temperature',
    name: 'Air Temperature',
    category: 'Thermal',
    description: 'Near-surface 2 m air temperature from atmospheric reanalysis and assimilation systems.',
    defaultUnit: '°C',
    slopeUnit: '°C per decade',
    supportedDatasets: ['merra2', 'gldas_tas'],
    legacyKey: 'heat',
  },
  evapotranspiration: {
    id: 'evapotranspiration',
    name: 'Evapotranspiration',
    category: 'Hydrological',
    description: 'Sum of land evaporation and plant transpiration fluxes to the atmosphere.',
    defaultUnit: 'mm/day',
    slopeUnit: 'mm/day per decade',
    supportedDatasets: ['gldas_et'],
    legacyKey: 'et',
  },
};

export const DATASETS: Record<DatasetId, DatasetMeta> = {
  gpm_imerg: {
    id: 'gpm_imerg',
    name: 'NASA GPM IMERG (V07B Final Run)',
    shortName: 'GPM IMERG',
    provider: 'NASA Goddard Earth Sciences (GES DISC)',
    variableId: 'precipitation',
    spatialResolution: '0.1° × 0.1° (regridded to 1°)',
    temporalResolution: 'Monthly calibrated product',
    coverage: 'Global 60°N - 60°S (land and sea)',
    unit: 'mm/month',
    slopeUnit: 'mm/month per decade',
    description: 'Global Precipitation Measurement Integrated Multi-satellitE Retrievals for GPM. Multi-satellite passive microwave and calibrated infrared precipitation estimation.',
    legacyKey: 'rain',
    landOnly: false,
  },
  gldas: {
    id: 'gldas',
    name: 'NASA GLDAS Noah Soil Moisture (GLDAS-2.1)',
    shortName: 'GLDAS Noah',
    provider: 'NASA / NOAA GMAO',
    variableId: 'soil_moisture',
    spatialResolution: '0.25° × 0.25° (regridded to 1°)',
    temporalResolution: 'Monthly surface layer (0-10 cm)',
    coverage: 'Global land surface (land only)',
    unit: 'm³/m³',
    slopeUnit: 'm³/m³ per decade',
    description: 'Global Land Data Assimilation System Noah Land Surface Model. Physics-based assimilation of satellite radiation and precipitation forcings.',
    legacyKey: 'soil',
    landOnly: true,
  },
  merra2: {
    id: 'merra2',
    name: 'NASA MERRA-2 2 m Air Temperature',
    shortName: 'MERRA-2',
    provider: 'NASA Global Modeling and Assimilation Office (GMAO)',
    variableId: 'air_temperature',
    spatialResolution: '0.5° × 0.625° (regridded to 1°)',
    temporalResolution: 'Monthly mean 2 m temperature',
    coverage: 'Global atmosphere (land and sea)',
    unit: '°C',
    slopeUnit: '°C per decade',
    description: 'Modern-Era Retrospective analysis for Research and Applications, Version 2. Full assimilation of spaceborne satellite atmospheric soundings.',
    legacyKey: 'heat',
    landOnly: false,
  },
  gldas_tas: {
    id: 'gldas_tas',
    name: 'NASA GLDAS Noah Air Temperature',
    shortName: 'GLDAS Noah',
    provider: 'NASA / NOAA GMAO',
    variableId: 'air_temperature',
    spatialResolution: '0.25° × 0.25° (regridded to 1°)',
    temporalResolution: 'Monthly surface temperature',
    coverage: 'Global land surface (land only)',
    unit: '°C',
    slopeUnit: '°C per decade',
    description: 'GLDAS Noah land surface model temperature simulation forced by satellite radiation.',
    legacyKey: 'heat',
    landOnly: true,
  },
  gldas_et: {
    id: 'gldas_et',
    name: 'NASA GLDAS Noah Evapotranspiration',
    shortName: 'GLDAS Noah',
    provider: 'NASA / NOAA GMAO',
    variableId: 'evapotranspiration',
    spatialResolution: '0.25° × 0.25° (regridded to 1°)',
    temporalResolution: 'Monthly total flux',
    coverage: 'Global land surface (land only)',
    unit: 'mm/day',
    slopeUnit: 'mm/day per decade',
    description: 'Physics-based calculation of total surface evaporation and transpiration fluxes.',
    legacyKey: 'et',
    landOnly: true,
  },
};

export const VARIABLE_DATASET_MAP: Record<EnvVariableId, DatasetId[]> = {
  precipitation: ['gpm_imerg'],
  soil_moisture: ['gldas'],
  air_temperature: ['merra2', 'gldas_tas'],
  evapotranspiration: ['gldas_et'],
};

export function getDatasetsForVariable(varId: EnvVariableId | ''): DatasetMeta[] {
  if (!varId || !VARIABLE_DATASET_MAP[varId]) return [];
  return VARIABLE_DATASET_MAP[varId].map((dId) => DATASETS[dId]);
}

export function toLegacyVariable(varId: EnvVariableId | Variable): Variable {
  if (varId === 'precipitation' || varId === 'rain') return 'rain';
  if (varId === 'soil_moisture' || varId === 'soil') return 'soil';
  if (varId === 'air_temperature' || varId === 'heat') return 'heat';
  if (varId === 'evapotranspiration' || varId === 'et') return 'et';
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
  heatValue?: number;
  heatSlope?: number;
  heatP?: number | null;
  heatCiLow?: number | null;
  heatCiHigh?: number | null;
  heatSignificant?: boolean;
  heatSignificantFdr?: boolean;
  heatMissing?: boolean;
  etValue?: number;
  etSlope?: number;
  etP?: number | null;
  etCiLow?: number | null;
  etCiHigh?: number | null;
  etSignificant?: boolean;
  etSignificantFdr?: boolean;
  etMissing?: boolean;
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
    slopeUnit: 'mm/month per decade',
    range: 3,
    valueMin: 50,
    valueMid: 155,
    valueMax: 280,
    provider: 'NASA Goddard Earth Sciences Data and Information Services Center (GES DISC)',
    spatialResolution: '0.1° × 0.1° (~10 km, regridded to 1°)',
    temporalResolution: 'Monthly satellite product',
  },
  soil: {
    id: 'soil',
    name: 'Soil Moisture',
    dataset: 'GLDAS Noah',
    description: 'Global Land Data Assimilation System Noah Land Surface Model (GLDAS-2.1)',
    unit: 'm³/m³',
    slopeUnit: 'm³/m³ per decade',
    range: 0.005,
    valueMin: 0.12,
    valueMid: 0.26,
    valueMax: 0.42,
    provider: 'NASA / NOAA Global Modeling and Assimilation Office',
    spatialResolution: '0.25° × 0.25° (~25 km, regridded to 1°)',
    temporalResolution: 'Monthly surface layer (0-10 cm)',
  },
  heat: {
    id: 'heat',
    name: 'Air Temperature',
    dataset: 'MERRA-2',
    description: 'Modern-Era Retrospective analysis for Research and Applications, Version 2 (2 m Air Temperature)',
    unit: '°C',
    slopeUnit: '°C per decade',
    range: 0.45,
    valueMin: -10,
    valueMid: 15,
    valueMax: 35,
    provider: 'NASA GMAO Atmospheric Reanalysis',
    spatialResolution: '0.5° × 0.625° (regridded to 1°)',
    temporalResolution: 'Monthly mean 2 m temperature',
  },
  et: {
    id: 'et',
    name: 'Evapotranspiration',
    dataset: 'GLDAS Noah',
    description: 'Global Land Data Assimilation System Noah Land Surface Evapotranspiration Flux',
    unit: 'mm/day',
    slopeUnit: 'mm/day per decade',
    range: 0.1,
    valueMin: 0.5,
    valueMid: 2.5,
    valueMax: 6.0,
    provider: 'NASA / NOAA GMAO',
    spatialResolution: '0.25° × 0.25° (regridded to 1°)',
    temporalResolution: 'Monthly flux',
  },
};

export interface RegionMeta {
  id: RegionId;
  name: string;
  country: string;
  description: string;
  center: [number, number]; // [lon, lat]
  bounds: [[number, number], [number, number]]; // [[minLon, minLat], [maxLon, maxLat]]
  isDemo?: boolean;
}

export const REGION_META: Record<RegionId, RegionMeta> = {
  global: {
    id: 'global',
    name: 'Whole world',
    country: 'Global',
    description: 'Global planetary coverage spanning all continents and ocean basins (-180° to 180°, -90° to 90°).',
    center: [0, 20],
    bounds: [[-180, -85], [180, 85]],
    isDemo: true,
  },
  mekong: {
    id: 'mekong',
    name: 'Mekong Delta',
    country: 'Vietnam',
    description: 'Southern agricultural river basin characterized by intensive rice cultivation and seasonal monsoon inundation.',
    center: [105.7, 10.0],
    bounds: [[104.4, 8.5], [106.9, 11.1]],
  },
  mekong_delta: {
    id: 'mekong_delta',
    name: 'Mekong Delta',
    country: 'Vietnam',
    description: 'Southern agricultural river basin characterized by intensive rice cultivation and seasonal monsoon inundation.',
    center: [105.7, 10.0],
    bounds: [[104.4, 8.5], [106.9, 11.1]],
  },
  mekong_region: {
    id: 'mekong_region',
    name: 'Mekong Region',
    country: 'Southeast Asia',
    description: 'Greater Mekong River catchment basin spanning Vietnam, Cambodia, Laos, and Thailand.',
    center: [103.5, 16.0],
    bounds: [[98.0, 8.0], [109.0, 24.0]],
  },
  north: {
    id: 'north',
    name: 'Northern Vietnam',
    country: 'Vietnam',
    description: 'Mountainous and Red River basin region subject to subtropical monsoonal cycles and varied topographical climates.',
    center: [105.85, 21.15],
    bounds: [[104.5, 20.1], [107.25, 22.25]],
  },
  wisconsin: {
    id: 'wisconsin',
    name: 'Wisconsin',
    country: 'United States',
    description: 'Upper Midwestern temperate continental climate zone characterized by seasonal lake-effect climatic buffers.',
    center: [-89.8, 44.8],
    bounds: [[-92.9, 42.5], [-86.8, 47.1]],
  },
  sahel: {
    id: 'sahel',
    name: 'Sahel',
    country: 'Africa',
    description: 'Semiarid ecoclimatic transition zone in Africa between the Sahara desert and Sudanian savanna.',
    center: [8.5, 15.0],
    bounds: [[-18.0, 10.0], [35.0, 20.0]],
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
  if (variable === 'soil') {
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
  if (variable === 'heat') {
    return {
      value: props.heatValue ?? 26.5,
      slope: props.heatSlope ?? 0.28,
      p: props.heatP ?? 0.001,
      ciLow: props.heatCiLow ?? 0.19,
      ciHigh: props.heatCiHigh ?? 0.33,
      significant: props.heatSignificant ?? true,
      significantFdr: props.heatSignificantFdr ?? true,
      missing: props.heatMissing ?? false,
    };
  }
  return {
    value: props.etValue ?? 2.8,
    slope: props.etSlope ?? -0.04,
    p: props.etP ?? 0.15,
    ciLow: props.etCiLow ?? -0.09,
    ciHigh: props.etCiHigh ?? 0.02,
    significant: props.etSignificant ?? false,
    significantFdr: props.etSignificantFdr ?? false,
    missing: props.etMissing ?? false,
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
  parameter?: string;
  parameter_name?: string;
  dataset_name?: string;
  extent?: 'global' | 'land_only' | 'regional';
  available?: boolean;
  native_resolution_deg?: number;
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
  start?: MonthString;
  end?: MonthString;
  units: string;
  method: TrendMethod;
  slope_method: string;
  slope_per_decade: number | null;
  slope_ci: [number | null, number | null] | null;
  ci_level: number;
  ci_method?: string;
  p_value: number | null;
  p_value_autocorr_adjusted?: number | null;
  tau?: number;
  z?: number;
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

export interface ApiValueGridCell {
  lon: number;
  lat: number;
  value: number | null;
  valid_fraction: number;
}

export interface ApiValueGridRequest {
  variable_id: string;
  start: MonthString;
  end: MonthString;
  bbox?: BBox;
  month?: number;
}

export interface ApiValueGridResponse {
  variable_id: string;
  units: string;
  start: MonthString;
  end: MonthString;
  stat: string;
  month: number | null;
  cell_size_deg: number;
  value_range: { min: number; max: number; p02: number; p98: number };
  cells: ApiValueGridCell[];
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
  compare_id?: string;
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
  stable_halves?: boolean;
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
