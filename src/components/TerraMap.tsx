import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import { Layers3, RotateCcw, Target, ZoomIn, ZoomOut, Square, Shapes, MapPin, HelpCircle, X } from 'lucide-react';
import {
  REGION_META,
  VARIABLE_META,
  type DrawMode,
  type GeographicSelection,
  type Grid,
  type MapMode,
  type RegionId,
  type Variable,
} from '../lib/types.ts';
import { generateSmoothedRaster } from '../lib/heatmapRenderer.ts';
import { formatCoordinates, getSelectionBounds, WORLD_BOUNDS, clampLonLat } from '../lib/geoUtils.ts';

export { WORLD_BOUNDS, clampLonLat };

const EMPTY: Grid = { type: 'FeatureCollection', features: [] };
const SOURCE = 'analysis-cells';
const HIT = 'analysis-click-targets';
const SELECTED = 'analysis-selected-cell';
const CELL_BORDERS = 'analysis-cell-borders';
const RASTER = 'analysis-raster';
const RASTER_LAYER = 'analysis-raster-layer';
const DRAWING_SOURCE = 'custom-drawing-source';
const DRAWING_FILL = 'custom-drawing-fill';
const DRAWING_LINE = 'custom-drawing-line';
const DRAWING_POINT = 'custom-drawing-point';

function getSelectionLabel(sel: GeographicSelection): string {
  if (sel.type === 'preset') return sel.name;
  return sel.label ?? (sel.type === 'point' ? 'Selected Point' : 'Selected Region');
}

export type TerraMapProps = {
  draftRegion: RegionId | '';
  analyzedRegion: RegionId | null;
  variable: Variable | null;
  mode: MapMode;
  grid: Grid | null;
  selectedCellId: string | null;
  onSelectCell: (id: string) => void;
  showDataGrid?: boolean;
  drawMode?: DrawMode;
  customSelection?: GeographicSelection | null;
  onCustomSelectionChange?: (sel: GeographicSelection | null) => void;
  onPolygonVertexChange?: (count: number) => void;
  analysisBounds?: [[number, number], [number, number]] | null;
};

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// Compute geographic outer bounding box of a grid
function computeGridBounds(grid: Grid): [[number, number], [number, number]] | null {
  if (!grid.features || grid.features.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const f of grid.features) {
    for (const [lon, lat] of f.geometry.coordinates[0]) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

// SVG fallback projection for environments without WebGL
function point([lon, lat]: Position) {
  return [((lon + 180) / 360) * 1000, ((90 - lat) / 180) * 500] as const;
}

function polygonPath(rings: Position[][]) {
  return rings
    .map(
      ring =>
        ring
          .map((p, i) => {
            const [x, y] = point(p);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(' ') + ' Z'
    )
    .join(' ');
}

function geometryPath(g: Geometry) {
  if (g.type === 'Polygon') return polygonPath(g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.map(polygonPath).join(' ');
  return '';
}

function toSvgBox(
  region: RegionId | '',
  customSelection?: GeographicSelection | null,
  bounds?: [[number, number], [number, number]] | null
) {
  let targetBounds: [[number, number], [number, number]] | null = bounds ?? null;
  if (!targetBounds) {
    if (customSelection) {
      targetBounds = getSelectionBounds(customSelection);
    } else if (region) {
      targetBounds = REGION_META[region].bounds;
    }
  }

  if (!targetBounds) return { x: 0, y: 0, w: 1000, h: 500 };
  const [[west, south], [east, north]] = targetBounds;
  const [x1, y1] = point([west - 1.2, north + 1]);
  const [x2, y2] = point([east + 1.2, south - 1]);
  return { x: x1, y: y1, w: Math.max(10, x2 - x1), h: Math.max(10, y2 - y1) };
}

function OfflineMap({
  draftRegion,
  variable,
  mode,
  grid,
  selectedCellId,
  onSelectCell,
  showDataGrid,
  customSelection,
  analysisBounds,
}: TerraMapProps) {
  const offlineContainerRef = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState<FeatureCollection | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showInstruction, setShowInstruction] = useState(true);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/world.geojson')
      .then(r => r.json())
      .then((json: FeatureCollection) => {
        if (active) setWorld(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [draftRegion, customSelection]);

  // Non-passive native wheel listener to completely stop document scroll
  useEffect(() => {
    const el = offlineContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowInstruction(false);
      const factor = e.deltaY < 0 ? 1.2 : 0.83;
      setZoom(z => Math.max(1, Math.min(8, z * factor)));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const base = toSvgBox(draftRegion, customSelection, analysisBounds);
  const box = {
    x: base.x + (base.w * (1 - 1 / zoom)) / 2 + pan.x,
    y: base.y + (base.h * (1 - 1 / zoom)) / 2 + pan.y,
    w: base.w / zoom,
    h: base.h / zoom,
  };
  const viewBox = `${box.x} ${box.y} ${box.w} ${box.h}`;
  const polygons = useMemo(
    () =>
      world?.features
        .map((feature, i) => ({ id: i, path: feature.geometry ? geometryPath(feature.geometry) : '' }))
        .filter(p => p.path) ?? [],
    [world]
  );

  // Compute smooth raster for offline SVG map
  const rasterDataUrl = useMemo(() => {
    if (!grid || !variable) return null;
    const canvas = generateSmoothedRaster(grid, variable, mode, 256, 256);
    return canvas.toDataURL();
  }, [grid, variable, mode]);

  const gridBounds = useMemo(() => (grid ? computeGridBounds(grid) : null), [grid]);
  const rasterBox = useMemo(() => {
    if (!gridBounds) return null;
    const [[west, south], [east, north]] = gridBounds;
    const [rx, ry] = point([west, north]);
    const [re, rb] = point([east, south]);
    return { x: rx, y: ry, w: re - rx, h: rb - ry };
  }, [gridBounds]);

  const selected = grid?.features.find(f => f.properties.id === selectedCellId);

  return (
    <div
      ref={offlineContainerRef}
      className="relative h-[380px] overflow-hidden rounded-2xl bg-[#e6f0ef] sm:h-[460px] xl:h-[500px]"
      style={{ touchAction: 'none' }}
      role="application"
      aria-label="Geographic world map fallback"
    >
      <svg
        className="h-full w-full touch-none"
        style={{ touchAction: 'none' }}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={e => {
          setShowInstruction(false);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (!drag.current) return;
          const svg = e.currentTarget.getBoundingClientRect();
          const targetPanX = drag.current.px - ((e.clientX - drag.current.x) * box.w) / svg.width;
          const targetPanY = drag.current.py - ((e.clientY - drag.current.y) * box.h) / svg.height;

          // Clamp so viewBox strictly stops at world boundaries
          const minPanX = -(base.x + (base.w * (1 - 1 / zoom)) / 2);
          const maxPanX = Math.max(minPanX, 1000 - box.w - (base.x + (base.w * (1 - 1 / zoom)) / 2));
          const minPanY = -(base.y + (base.h * (1 - 1 / zoom)) / 2);
          const maxPanY = Math.max(minPanY, 500 - box.h - (base.y + (base.h * (1 - 1 / zoom)) / 2));

          setPan({
            x: Math.max(minPanX, Math.min(maxPanX, targetPanX)),
            y: Math.max(minPanY, Math.min(maxPanY, targetPanY)),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <rect x="0" y="0" width="1000" height="500" fill="#d8eaf0" />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`lon${i}`} x1={i * 100} y1="0" x2={i * 100} y2="500" stroke="#b7d3d6" strokeWidth=".45" />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`lat${i}`} x1="0" y1={(i * 500) / 6} x2="1000" y2={(i * 500) / 6} stroke="#b7d3d6" strokeWidth=".45" />
        ))}
        {polygons.map(p => (
          <path key={p.id} d={p.path} fill="#c9dfcc" stroke="#95b59f" strokeWidth=".32" fillRule="evenodd" />
        ))}

        {/* Continuous NASA-grade environmental raster overlay */}
        {rasterDataUrl && rasterBox && (
          <image
            href={rasterDataUrl}
            x={rasterBox.x}
            y={rasterBox.y}
            width={rasterBox.w}
            height={rasterBox.h}
            preserveAspectRatio="none"
            opacity={0.92}
          />
        )}

        {/* Custom Selection Geometry */}
        {customSelection && customSelection.type === 'point' && (() => {
          const [cx, cy] = point(customSelection.coordinates);
          return (
            <g pointerEvents="none">
              <circle cx={cx} cy={cy} r={box.w / 60} fill="#16804a" fillOpacity={0.3} />
              <circle cx={cx} cy={cy} r={box.w / 120} fill="#16804a" stroke="#ffffff" strokeWidth={box.w / 400} />
            </g>
          );
        })()}

        {customSelection && (customSelection.type === 'bbox' || customSelection.type === 'polygon') && (() => {
          const b = getSelectionBounds(customSelection);
          const [bx1, by1] = point([b[0][0], b[1][1]]);
          const [bx2, by2] = point([b[1][0], b[0][1]]);
          return (
            <rect
              x={bx1}
              y={by1}
              width={bx2 - bx1}
              height={by2 - by1}
              fill="rgba(22, 128, 74, 0.15)"
              stroke="#16804a"
              strokeWidth={Math.max(0.12, box.w / 350)}
              strokeDasharray="2 1"
              pointerEvents="none"
            />
          );
        })()}

        {/* Measurement Grid cells & clickable hit targets */}
        {grid?.features.map(f => {
          const [[west, south], [east, north]] = [f.geometry.coordinates[0][0], f.geometry.coordinates[0][2]];
          const [x, y] = point([west, north]);
          const [x2, y2] = point([east, south]);
          return (
            <rect
              key={f.properties.id}
              x={x}
              y={y}
              width={x2 - x}
              height={y2 - y}
              fill="transparent"
              stroke={showDataGrid ? 'rgba(255, 255, 255, 0.45)' : 'transparent'}
              strokeWidth={Math.max(0.04, box.w / 1200)}
              onClick={() => onSelectCell(f.properties.id)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}

        {/* Selected cell outline */}
        {selected &&
          (() => {
            const [[west, south], [east, north]] = [selected.geometry.coordinates[0][0], selected.geometry.coordinates[0][2]];
            const [x, y] = point([west, north]);
            const [x2, y2] = point([east, south]);
            return (
              <rect
                x={x}
                y={y}
                width={x2 - x}
                height={y2 - y}
                fill="none"
                stroke="#123f30"
                strokeWidth={Math.max(0.12, box.w / 300)}
                pointerEvents="none"
              />
            );
          })()}
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-xl bg-white/90 backdrop-blur-md p-1 shadow-md border border-white/70">
        <button className="map-control" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(8, z * 1.4))}>
          <ZoomIn size={14} />
        </button>
        <button className="map-control" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z / 1.4))}>
          <ZoomOut size={14} />
        </button>
        <button
          className="map-control"
          aria-label="Reset zoom"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={13} />
        </button>
        <button
          className={`map-control ${showInstruction ? 'text-[#16804a] bg-[#e8f5ed]' : ''}`}
          aria-label="Toggle interaction instructions"
          onClick={() => setShowInstruction(prev => !prev)}
          title="Interaction instructions"
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* High-Contrast Opaque Map Instruction Pill */}
      {showInstruction && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-[#2b5944] bg-[#16362a] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34d399] animate-pulse" />
          <span>Drag to explore · Scroll to zoom</span>
          <button
            type="button"
            onClick={() => setShowInstruction(false)}
            className="ml-1 rounded-full p-0.5 text-[#86e2b6] hover:bg-[#204e38] hover:text-white transition cursor-pointer"
            aria-label="Dismiss instructions"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <span className="absolute left-3 top-3 rounded-full bg-white/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-semibold text-[#16362a] shadow-sm border border-white/60">
        {draftRegion ? REGION_META[draftRegion].name : customSelection ? 'Custom Selection' : 'Global View'} · Offline SVG Map
      </span>
    </div>
  );
}

export function TerraMap(props: TerraMapProps) {
  const {
    draftRegion,
    variable,
    mode,
    grid,
    selectedCellId,
    onSelectCell,
    showDataGrid = false,
    drawMode = 'none',
    customSelection,
    onCustomSelectionChange,
    onPolygonVertexChange,
    analysisBounds,
  } = props;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const clickRef = useRef(onSelectCell);
  clickRef.current = onSelectCell;

  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [coords, setCoords] = useState<{ lon: number; lat: number } | null>(null);
  const [showInstruction, setShowInstruction] = useState(true);

  // Drawing state
  const isDrawingRect = useRef(false);
  const rectStartLngLat = useRef<[number, number] | null>(null);
  const polygonPoints = useRef<[number, number][]>([]);

  // Intercept wheel events inside the map wrapper to completely prevent webpage scrolling
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setShowInstruction(false);
      const map = mapRef.current;
      if (map && e.target !== map.getCanvas()) {
        const delta = e.deltaY;
        if (delta < 0) {
          map.zoomIn();
        } else if (delta > 0) {
          map.zoomOut();
        }
      }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Initialize MapLibre GL Map
  useEffect(() => {
    if (!container.current) return;
    if (!hasWebGL()) {
      setFallback(true);
      return;
    }

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [0, 15],
        zoom: 1.2,
        minZoom: 1.0,
        maxZoom: 18,
        renderWorldCopies: false,
        maxBounds: WORLD_BOUNDS,
        attributionControl: false,
        scrollZoom: true,
        dragPan: true,
        dragRotate: false,
        touchZoomRotate: true,
        touchPitch: false,
      });
    } catch {
      setFallback(true);
      return;
    }

    mapRef.current = map;
    let didLoad = false;
    const timeout = window.setTimeout(() => {
      if (!didLoad) setFallback(true);
    }, 8500);

    map.on('load', () => {
      didLoad = true;
      window.clearTimeout(timeout);
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      // 1. Grid Cells & Hit Targets
      map.addSource(SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: HIT,
        type: 'fill',
        source: SOURCE,
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.01 },
      });
      map.addLayer({
        id: CELL_BORDERS,
        type: 'line',
        source: SOURCE,
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.0,
          'line-opacity': showDataGrid ? 0.45 : 0.0,
        },
      });
      map.addLayer({
        id: SELECTED,
        type: 'line',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#164e3a', 'line-width': 2.8 },
      });

      // 2. Custom Drawing / Selection GeoJSON Source
      map.addSource(DRAWING_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: DRAWING_FILL,
        type: 'fill',
        source: DRAWING_SOURCE,
        paint: { 'fill-color': '#16804a', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: DRAWING_LINE,
        type: 'line',
        source: DRAWING_SOURCE,
        paint: {
          'line-color': '#16804a',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
        },
      });
      map.addLayer({
        id: DRAWING_POINT,
        type: 'circle',
        source: DRAWING_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#16804a',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Cell click selection
      map.on('click', HIT, e => {
        if (drawMode !== 'none') return;
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') clickRef.current(id);
      });

      map.on('mousemove', e => {
        const [lon, lat] = clampLonLat(e.lngLat.lng, e.lngLat.lat);
        setCoords({
          lon: Number(lon.toFixed(2)),
          lat: Number(lat.toFixed(2)),
        });
      });

      map.on('mouseleave', () => {
        setCoords(null);
      });

      map.on('dragstart', () => {
        setShowInstruction(false);
      });

      map.on('zoomstart', () => {
        setShowInstruction(false);
      });

      map.on('mouseenter', HIT, () => {
        if (drawMode === 'none') {
          map.getCanvas().style.cursor = 'pointer';
        }
      });
      map.on('mouseleave', HIT, () => {
        if (drawMode === 'none') {
          map.getCanvas().style.cursor = '';
        }
      });

      setReady(true);
    });

    return () => {
      window.clearTimeout(timeout);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep MapLibre viewport responsive on container resize
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Update cursor based on drawMode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const canvas = map.getCanvas();
    if (drawMode !== 'none') {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [drawMode, ready]);

  // Handle custom drawing interactions (Point, Rectangle, Polygon)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Reset polygon points when switching away from polygon
    if (drawMode !== 'polygon') {
      polygonPoints.current = [];
      onPolygonVertexChange?.(0);
    }

    // 1. POINT MODE
    const handlePointClick = (e: MapMouseEvent) => {
      if (drawMode !== 'point') return;
      const [cLon, cLat] = clampLonLat(e.lngLat.lng, e.lngLat.lat);
      const lon = Number(cLon.toFixed(4));
      const lat = Number(cLat.toFixed(4));
      onCustomSelectionChange?.({
        type: 'point',
        coordinates: [lon, lat],
        label: `Point (${formatCoordinates(lat, lon)})`,
      });
    };

    // 2. RECTANGLE MODE
    const handleMouseDown = (e: MapMouseEvent) => {
      if (drawMode !== 'rectangle') return;
      isDrawingRect.current = true;
      const [w0, s0] = clampLonLat(e.lngLat.lng, e.lngLat.lat);
      rectStartLngLat.current = [w0, s0];
      map.dragPan.disable();
    };

    const handleMouseMove = (e: MapMouseEvent) => {
      if (drawMode === 'rectangle' && isDrawingRect.current && rectStartLngLat.current) {
        const [w0, s0] = rectStartLngLat.current;
        const [w1, s1] = clampLonLat(e.lngLat.lng, e.lngLat.lat);
        const minLon = Math.min(w0, w1);
        const maxLon = Math.max(w0, w1);
        const minLat = Math.min(s0, s1);
        const maxLat = Math.max(s0, s1);

        const drawingSource = map.getSource(DRAWING_SOURCE) as GeoJSONSource;
        drawingSource?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [minLon, minLat],
                    [maxLon, minLat],
                    [maxLon, maxLat],
                    [minLon, maxLat],
                    [minLon, minLat],
                  ],
                ],
              },
            },
          ],
        });
      }
    };

    const handleMouseUp = (e: MapMouseEvent) => {
      if (drawMode === 'rectangle' && isDrawingRect.current && rectStartLngLat.current) {
        isDrawingRect.current = false;
        map.dragPan.enable();

        const [w0, s0] = rectStartLngLat.current;
        const [w1, s1] = clampLonLat(e.lngLat.lng, e.lngLat.lat);
        const minLon = Number(Math.min(w0, w1).toFixed(4));
        const maxLon = Number(Math.max(w0, w1).toFixed(4));
        const minLat = Number(Math.min(s0, s1).toFixed(4));
        const maxLat = Number(Math.max(s0, s1).toFixed(4));

        rectStartLngLat.current = null;

        // Ensure user actually dragged a region, not a micro-click
        if (Math.abs(maxLon - minLon) > 0.05 && Math.abs(maxLat - minLat) > 0.05) {
          onCustomSelectionChange?.({
            type: 'bbox',
            bounds: [[minLon, minLat], [maxLon, maxLat]],
            label: `BBox (${formatCoordinates((minLat + maxLat) / 2, (minLon + maxLon) / 2)})`,
          });
        }
      }
    };

    // 3. POLYGON MODE
    const handlePolygonClick = (e: MapMouseEvent) => {
      if (drawMode !== 'polygon') return;
      const [cLon, cLat] = clampLonLat(e.lngLat.lng, e.lngLat.lat);
      const lon = Number(cLon.toFixed(4));
      const lat = Number(cLat.toFixed(4));
      const pts = polygonPoints.current;

      // If user clicked near the origin vertex (distance < 0.1 deg) and we already have at least 3 vertices: close polygon
      if (pts.length >= 3) {
        const [firstLon, firstLat] = pts[0];
        const dist = Math.hypot(lon - firstLon, lat - firstLat);
        if (dist < 0.15) {
          // Close polygon
          const closed = [...pts, pts[0]];
          polygonPoints.current = [];
          onPolygonVertexChange?.(0);
          onCustomSelectionChange?.({
            type: 'polygon',
            coordinates: [closed],
            label: `Polygon (${pts.length} vertices)`,
          });
          return;
        }
      }

      const next: [number, number][] = [...pts, [lon, lat]];
      polygonPoints.current = next;
      onPolygonVertexChange?.(next.length);

      // Render live polygon preview
      const drawingSource = map.getSource(DRAWING_SOURCE) as GeoJSONSource;
      if (next.length === 1) {
        drawingSource?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: next[0] },
            },
          ],
        });
      } else if (next.length === 2) {
        drawingSource?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: next },
            },
            ...next.map(p => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: p },
            })),
          ],
        });
      } else {
        drawingSource?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [[...next, next[0]]] },
            },
            ...next.map(p => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: p },
            })),
          ],
        });
      }
    };

    const handleDblClick = (e: MapMouseEvent) => {
      if (drawMode === 'polygon' && polygonPoints.current.length >= 3) {
        e.preventDefault();
        const pts = polygonPoints.current;
        const closed = [...pts, pts[0]];
        polygonPoints.current = [];
        onPolygonVertexChange?.(0);
        onCustomSelectionChange?.({
          type: 'polygon',
          coordinates: [closed],
          label: `Polygon (${pts.length} vertices)`,
        });
      }
    };

    map.on('click', handlePointClick);
    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);
    map.on('click', handlePolygonClick);
    map.on('dblclick', handleDblClick);

    return () => {
      map.off('click', handlePointClick);
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      map.off('click', handlePolygonClick);
      map.off('dblclick', handleDblClick);
    };
  }, [drawMode, onCustomSelectionChange, onPolygonVertexChange, ready]);

  // Synchronize customSelection geometry into the drawing source layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const drawingSource = map.getSource(DRAWING_SOURCE) as GeoJSONSource;
    if (!drawingSource) return;

    if (!customSelection) {
      if (drawMode === 'none') {
        drawingSource.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    if (customSelection.type === 'point') {
      drawingSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: customSelection.coordinates },
          },
        ],
      });
    } else if (customSelection.type === 'bbox') {
      const [[w, s], [e, n]] = customSelection.bounds;
      drawingSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [w, s],
                  [e, s],
                  [e, n],
                  [w, n],
                  [w, s],
                ],
              ],
            },
          },
        ],
      });
    } else if (customSelection.type === 'polygon') {
      drawingSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: customSelection.coordinates,
            },
          },
        ],
      });
    }
  }, [customSelection, drawMode, ready]);

  // Adjust camera to region or custom bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (analysisBounds) {
      map.fitBounds(analysisBounds, { padding: 45, maxZoom: 8.5, duration: 650 });
    } else if (customSelection) {
      const b = getSelectionBounds(customSelection);
      map.fitBounds(b, { padding: 50, maxZoom: 8.5, duration: 650 });
    } else if (draftRegion) {
      map.fitBounds(REGION_META[draftRegion].bounds, { padding: 45, maxZoom: 8.5, duration: 650 });
    } else {
      map.flyTo({ center: [0, 15], zoom: 1.2, duration: 650 });
    }
  }, [draftRegion, customSelection, analysisBounds, ready]);

  // Synchronize measurement grid features
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(SOURCE) as GeoJSONSource)?.setData(grid ?? EMPTY);
  }, [grid, ready]);

  // Toggle visible cell border styling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer(CELL_BORDERS)) {
      map.setPaintProperty(CELL_BORDERS, 'line-opacity', showDataGrid ? 0.45 : 0.0);
      map.setPaintProperty(CELL_BORDERS, 'line-width', showDataGrid ? 1.0 : 0.0);
    }
  }, [showDataGrid, ready]);

  // Generate continuous bilinearly smoothed NASA environmental raster layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (map.getLayer(RASTER_LAYER)) map.removeLayer(RASTER_LAYER);
    if (map.getSource(RASTER)) map.removeSource(RASTER);

    if (grid && variable && grid.features.length > 0) {
      const gBounds = computeGridBounds(grid);
      if (!gBounds) return;
      const [[w, s], [e, n]] = gBounds;

      // Dynamically generate smooth continuous raster
      const rasterCanvas = generateSmoothedRaster(grid, variable, mode, 384, 384);
      const dataUrl = rasterCanvas.toDataURL();

      map.addSource(RASTER, {
        type: 'image',
        url: dataUrl,
        coordinates: [
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ],
      });

      map.addLayer(
        {
          id: RASTER_LAYER,
          type: 'raster',
          source: RASTER,
          paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 180 },
        },
        HIT
      );
    }
  }, [grid, variable, mode, ready]);

  // Highlight selected grid cell
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) {
      map.setFilter(SELECTED, ['==', ['get', 'id'], selectedCellId ?? '']);
    }
  }, [selectedCellId, ready]);

  const zoomIn = () => mapRef.current?.zoomIn();
  const zoomOut = () => mapRef.current?.zoomOut();
  const resetToGlobal = () => mapRef.current?.flyTo({ center: [0, 15], zoom: 1.2, duration: 650 });
  const focusRegion = () => {
    if (mapRef.current) {
      if (customSelection) {
        mapRef.current.fitBounds(getSelectionBounds(customSelection), { padding: 45, maxZoom: 8.5, duration: 650 });
      } else if (draftRegion) {
        mapRef.current.fitBounds(REGION_META[draftRegion].bounds, { padding: 45, maxZoom: 8.5, duration: 650 });
      }
    }
  };

  const meta = variable ? VARIABLE_META[variable] : null;

  return (
    <div
      ref={wrapperRef}
      className="relative overflow-hidden rounded-2xl border border-[#dce7e1] bg-[#e6f0ef] shadow-inner"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={container}
        className={fallback ? 'hidden' : 'h-[380px] w-full sm:h-[460px] xl:h-[500px]'}
        role="application"
        aria-label="Interactive global geographic 2D map"
        style={{ touchAction: 'none' }}
      />
      {fallback && <OfflineMap {...props} />}

      {/* Region Status Pill & Mode Badge */}
      {!fallback && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full bg-white/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-semibold text-[#16362a] shadow-sm border border-white/60 flex items-center gap-1.5">
            {customSelection ? (
              <>
                <Target size={12} className="text-[#16804a]" />
                <span>{getSelectionLabel(customSelection)}</span>
              </>
            ) : draftRegion ? (
              REGION_META[draftRegion].name
            ) : (
              'Global View'
            )}{' '}
            · 2D Map
          </span>

          {coords && (
            <span className="hidden sm:inline-block rounded-full bg-[#16362a]/85 backdrop-blur-sm text-white px-2.5 py-1 text-[10px] font-mono shadow-xs">
              {coords.lat >= 0 ? `${coords.lat}°N` : `${Math.abs(coords.lat)}°S`},{' '}
              {coords.lon >= 0 ? `${coords.lon}°E` : `${Math.abs(coords.lon)}°W`}
            </span>
          )}

          {drawMode !== 'none' && (
            <span className="rounded-full bg-[#16804a] text-white px-3 py-1 text-[11px] font-medium shadow-sm flex items-center gap-1 animate-pulse">
              {drawMode === 'point' && <MapPin size={12} />}
              {drawMode === 'rectangle' && <Square size={12} />}
              {drawMode === 'polygon' && <Shapes size={12} />}
              <span>Drawing Active: Click on map to place</span>
            </span>
          )}
        </div>
      )}

      {/* Floating Map Controls Group */}
      {!fallback && (
        <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-xl bg-white/90 backdrop-blur-md p-1 shadow-md border border-white/70">
          <button className="map-control" aria-label="Zoom in" onClick={zoomIn} title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button className="map-control" aria-label="Zoom out" onClick={zoomOut} title="Zoom out">
            <ZoomOut size={14} />
          </button>
          {(draftRegion || customSelection) && (
            <button className="map-control" aria-label="Focus study region" onClick={focusRegion} title="Focus study region">
              <Target size={14} />
            </button>
          )}
          <button className="map-control" aria-label="Reset to global view" onClick={resetToGlobal} title="Reset to global view">
            <RotateCcw size={13} />
          </button>
          <button
            className={`map-control ${showInstruction ? 'text-[#16804a] bg-[#e8f5ed]' : ''}`}
            aria-label="Toggle interaction instructions"
            onClick={() => setShowInstruction((prev) => !prev)}
            title="Interaction instructions"
          >
            <HelpCircle size={14} />
          </button>
        </div>
      )}

      {/* High-Contrast Opaque Map Instruction Pill (Part 1) */}
      {showInstruction && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-[#2b5944] bg-[#16362a] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xl animate-in fade-in slide-in-from-bottom-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34d399] animate-pulse" />
          <span>Drag to explore · Scroll to zoom</span>
          <button
            type="button"
            onClick={() => setShowInstruction(false)}
            className="ml-1 rounded-full p-0.5 text-[#86e2b6] hover:bg-[#204e38] hover:text-white transition cursor-pointer"
            aria-label="Dismiss instructions"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Scientifically Calibrated Legend */}
      {grid && meta && (
        <div className="pointer-events-none absolute bottom-3 left-3 w-[min(340px,calc(100%-24px))] rounded-2xl border border-white/70 bg-white/92 backdrop-blur-md p-3.5 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold text-[#16362a]">
            <span className="flex items-center gap-1.5">
              <Layers3 size={13} className="text-[#16804a]" />
              {mode === 'value' ? `Mean ${meta.name}` : `${meta.name} Trend`}
            </span>
            <span className="font-semibold text-[#16804a] text-[10px] bg-[#edf6f0] px-2 py-0.5 rounded-md border border-[#cce4d4]">
              {mode === 'value' ? meta.unit : meta.slopeUnit}
            </span>
          </div>

          <div className={`h-2.5 rounded-full shadow-inner ${mode === 'trend' ? 'legend-trend' : 'legend-value'}`} />

          {/* Numerical Legend Scale */}
          <div className="mt-1.5 flex justify-between text-[10px] font-medium text-[#4e4860]">
            {mode === 'trend' ? (
              <>
                <span className="text-[#2f6fb3] font-bold">↓ decreasing (-{meta.range})</span>
                <span className="text-[#5e5872]">0.0 (Neutral)</span>
                <span className="text-[#c4621a] font-bold">increasing ↑ (+{meta.range})</span>
              </>
            ) : (
              <>
                <span>{meta.valueMin} {meta.unit}</span>
                <span>{meta.valueMid}</span>
                <span>{meta.valueMax} {meta.unit}</span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[9px] text-[#4e4860] border-t border-[#ece3d3] pt-1.5">
            <span className="flex items-center gap-1 font-semibold">
              <span className="w-2.5 h-2.5 rounded-xs border border-[#4e4860] dot-hatch inline-block" />
              <span>Hatch = not significant (FDR)</span>
            </span>
            <span className="font-bold text-[#2b2540]">1° global data · click to inspect</span>
          </div>
        </div>
      )}
    </div>
  );
}
