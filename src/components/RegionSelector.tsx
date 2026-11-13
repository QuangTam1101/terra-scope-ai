import {
  MapPin,
  Square,
  Shapes,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import {
  type GeographicSelection,
  type RegionId,
  type RegionSelectionMode,
  type DrawMode,
  REGION_META,
} from '../lib/types.ts';
import {
  calculateBBoxAreaKm2,
  calculatePolygonAreaKm2,
  formatCoordinates,
  getSelectionBounds,
  isBoundsWithinCoverage,
} from '../lib/geoUtils.ts';
import { InfoTooltip } from './ui/tooltip.tsx';

interface RegionSelectorProps {
  regionMode: RegionSelectionMode;
  onRegionModeChange: (mode: RegionSelectionMode) => void;
  presetRegion: RegionId | '';
  onPresetRegionChange: (region: RegionId | '') => void;
  geoSelection: GeographicSelection | null;
  onGeoSelectionChange: (selection: GeographicSelection | null) => void;
  drawMode: DrawMode;
  onDrawModeChange: (mode: DrawMode) => void;
  polygonVertexCount?: number;
  onFinishPolygon?: () => void;
}

const fieldClass =
  'mt-1 block h-10 w-full rounded-xl border border-[#dce7e0] bg-[#fafcfb] px-3 text-xs sm:text-sm font-medium text-[#16362a] outline-none transition duration-150 focus:border-[#16804a] focus:bg-white focus:ring-2 focus:ring-[#16804a]/15';

export function RegionSelector({
  regionMode,
  onRegionModeChange,
  presetRegion,
  onPresetRegionChange,
  geoSelection,
  onGeoSelectionChange,
  drawMode,
  onDrawModeChange,
  polygonVertexCount = 0,
  onFinishPolygon,
}: RegionSelectorProps) {
  const isCustomMode = regionMode === 'custom';

  // Compute summary metrics if custom region is selected
  let customSummary: {
    title: string;
    description: string;
    areaText?: string;
    isSupported: boolean;
  } | null = null;

  if (geoSelection && geoSelection.type !== 'preset') {
    const bounds = getSelectionBounds(geoSelection);
    const isSupported = isBoundsWithinCoverage(bounds);

    if (geoSelection.type === 'point') {
      const [lon, lat] = geoSelection.coordinates;
      customSummary = {
        title: 'Custom Location (Point)',
        description: `Coordinates: ${formatCoordinates(lat, lon)}`,
        areaText: '~35 km radius sampling envelope',
        isSupported,
      };
    } else if (geoSelection.type === 'bbox') {
      const [[w, s], [e, n]] = geoSelection.bounds;
      const area = calculateBBoxAreaKm2(geoSelection.bounds);
      customSummary = {
        title: 'Custom Bounding Box',
        description: `${formatCoordinates(s, w)} to ${formatCoordinates(n, e)}`,
        areaText: `Approx. ${area.toLocaleString()} km² surface area`,
        isSupported,
      };
    } else if (geoSelection.type === 'polygon') {
      const ring = geoSelection.coordinates[0];
      const area = calculatePolygonAreaKm2(ring);
      customSummary = {
        title: 'Custom Polygon Boundary',
        description: `${ring.length - 1} vertices enclosing target basin`,
        areaText: `Approx. ${area.toLocaleString()} km² surface area`,
        isSupported,
      };
    }
  }

  return (
    <div className="space-y-2.5">
      {/* Label on its own row */}
      <div className="flex items-center gap-1.5">
        <label className="field-label !mb-0">Study Region</label>
        <InfoTooltip
          title="Study Region Selection"
          content="Choose from calibrated NASA demonstration basins or use interactive map tools to select an arbitrary point, rectangle, or custom polygon anywhere on Earth."
        />
      </div>

      {/* Preset vs Custom Mode Toggle on its own row */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f0f5f2] p-1 border border-[#d8e6de] text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            onRegionModeChange('preset');
            onDrawModeChange('none');
            if (presetRegion) {
              onGeoSelectionChange({
                type: 'preset',
                regionId: presetRegion,
                name: REGION_META[presetRegion].name,
              });
            } else {
              onGeoSelectionChange(null);
            }
          }}
          className={`py-1.5 rounded-lg text-center transition-all ${
            !isCustomMode
              ? 'bg-white text-[#16804a] shadow-xs'
              : 'text-[#617b6c] hover:text-[#16362a]'
          }`}
        >
          Preset Regions
        </button>
        <button
          type="button"
          onClick={() => {
            onRegionModeChange('custom');
            if (!drawMode || drawMode === 'none') {
              onDrawModeChange('point');
            }
          }}
          className={`py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 ${
            isCustomMode
              ? 'bg-white text-[#16804a] shadow-xs'
              : 'text-[#617b6c] hover:text-[#16362a]'
          }`}
        >
          <Sparkles size={12} className="text-[#16804a]" />
          <span>Select on Map</span>
        </button>
      </div>

      {/* Preset Region Dropdown Mode */}
      {!isCustomMode && (
        <div>
          <select
            id="region"
            className={fieldClass}
            value={presetRegion}
            onChange={(e) => {
              const rId = e.target.value as RegionId | '';
              onPresetRegionChange(rId);
              if (rId) {
                onGeoSelectionChange({
                  type: 'preset',
                  regionId: rId,
                  name: REGION_META[rId].name,
                });
              } else {
                onGeoSelectionChange(null);
              }
            }}
          >
            <option value="">Choose a study region</option>
            <option value="mekong">Mekong Delta (Vietnam)</option>
            <option value="north">Northern Vietnam</option>
          </select>
        </div>
      )}

      {/* Custom Map Selection Mode */}
      {isCustomMode && (
        <div className="space-y-2.5 rounded-xl border border-[#d6e5dc] bg-[#f9fcfa] p-3">
          {/* Tool Selection Tabs */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#71877b] mb-1.5 flex items-center justify-between">
              <span>Interactive Drawing Tool</span>
              {drawMode !== 'none' && (
                <span className="text-[#16804a] font-semibold animate-pulse flex items-center gap-1">
                  ● Active on Map
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => onDrawModeChange('point')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1.5 rounded-lg border transition-all ${
                  drawMode === 'point'
                    ? 'border-[#16804a] bg-[#e4f6eb] text-[#166534] font-bold shadow-xs'
                    : 'border-[#dce7e0] bg-white text-[#617b6c] hover:border-[#16804a]/40 hover:bg-[#fafcfb]'
                }`}
                title="Click any geographic point on 2D map or 3D globe"
              >
                <MapPin size={15} className={drawMode === 'point' ? 'text-[#16804a]' : ''} />
                <span className="text-[11px]">Select Point</span>
              </button>

              <button
                type="button"
                onClick={() => onDrawModeChange('rectangle')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1.5 rounded-lg border transition-all ${
                  drawMode === 'rectangle'
                    ? 'border-[#16804a] bg-[#e4f6eb] text-[#166534] font-bold shadow-xs'
                    : 'border-[#dce7e0] bg-white text-[#617b6c] hover:border-[#16804a]/40 hover:bg-[#fafcfb]'
                }`}
                title="Drag bounding box on map"
              >
                <Square size={14} className={drawMode === 'rectangle' ? 'text-[#16804a]' : ''} />
                <span className="text-[11px]">Draw Box</span>
              </button>

              <button
                type="button"
                onClick={() => onDrawModeChange('polygon')}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1.5 rounded-lg border transition-all ${
                  drawMode === 'polygon'
                    ? 'border-[#16804a] bg-[#e4f6eb] text-[#166534] font-bold shadow-xs'
                    : 'border-[#dce7e0] bg-white text-[#617b6c] hover:border-[#16804a]/40 hover:bg-[#fafcfb]'
                }`}
                title="Click vertices to draw custom polygon boundary"
              >
                <Shapes size={15} className={drawMode === 'polygon' ? 'text-[#16804a]' : ''} />
                <span className="text-[11px]">Draw Polygon</span>
              </button>
            </div>
          </div>

          {/* Polygon In-Progress Action Toolbar */}
          {drawMode === 'polygon' && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[#edf6f1] p-2 text-xs border border-[#cfe6d8]">
              <div className="text-[11px] text-[#28573d] flex items-center gap-1.5">
                <span className="font-semibold">{polygonVertexCount}</span> vertices placed
                {polygonVertexCount < 3 && <span className="text-[#658774]">(min 3 needed)</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {polygonVertexCount >= 3 && onFinishPolygon && (
                  <button
                    type="button"
                    onClick={onFinishPolygon}
                    className="rounded bg-[#16804a] px-2 py-1 text-[10px] font-bold text-white shadow-xs hover:bg-[#12683c] transition"
                  >
                    Finish Polygon
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDrawModeChange('none')}
                  className="rounded bg-white border border-[#cbe1d3] px-2 py-1 text-[10px] font-medium text-[#4b6d5b] hover:bg-[#f2faf5] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Custom Selection Status Card */}
          {customSummary ? (
            <div className="rounded-xl border border-[#cbe5d5] bg-white p-3 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#16362a]">
                  <CheckCircle2 size={14} className="text-[#16804a]" />
                  <span>{customSummary.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onGeoSelectionChange(null);
                    if (drawMode === 'none') onDrawModeChange('point');
                  }}
                  className="text-[10px] font-medium text-[#849a8d] hover:text-[#dc2626] flex items-center gap-0.5"
                  title="Clear custom geographic selection"
                >
                  <RotateCcw size={10} />
                  <span>Clear</span>
                </button>
              </div>

              <div className="text-[11px] text-[#4b6d5b] font-mono leading-tight">
                {customSummary.description}
              </div>

              {customSummary.areaText && (
                <div className="text-[10px] text-[#71877b] flex items-center gap-1">
                  <span>{customSummary.areaText}</span>
                </div>
              )}

              {/* Coverage Validation Badge */}
              <div className="pt-1">
                {customSummary.isSupported ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#e4f6eb] px-2 py-0.5 text-[10px] font-semibold text-[#166534]">
                    ● Calibrated Satellite Coverage Ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#fff1e5] px-2 py-0.5 text-[10px] font-semibold text-[#b45d24]">
                    <AlertCircle size={10} />
                    Outside Prototype Data Cache
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[#cfe0d6] bg-white/70 p-3 text-center text-xs text-[#71877b]">
              <p className="text-[11px] leading-relaxed">
                {drawMode === 'point' && 'Click anywhere on the map or globe to place an observation pin.'}
                {drawMode === 'rectangle' && 'Click and drag on the map to define a rectangular study boundary.'}
                {drawMode === 'polygon' && 'Click on the map to add boundary vertices. Double-click or click Finish when done.'}
                {drawMode === 'none' && 'Select an interactive tool above to define your region.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
