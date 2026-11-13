import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { FeatureCollection, Geometry, Position } from 'geojson';
import { Layers3, RotateCcw, Target, ZoomIn, ZoomOut, MapPin, Square, Shapes, HelpCircle, X } from 'lucide-react';
import { findGridCell, normalizeLongitude, projectGlobe, unprojectGlobe } from '../lib/globeMath.ts';
import { REGION_META, VARIABLE_META, type GeographicSelection, type RegionId } from '../lib/types.ts';
import { generateSmoothedRaster } from '../lib/heatmapRenderer.ts';
import { formatCoordinates, getBoundsCenter, getSelectionBounds } from '../lib/geoUtils.ts';
import type { TerraMapProps } from './TerraMap.tsx';

const TEX_W = 4096;
const TEX_H = 2048;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 24;

type Orientation = { lon: number; lat: number; zoom: number };
type Drag = { startX: number; startY: number; lon: number; lat: number; moved: boolean };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function regionCenter(region: RegionId): [number, number] {
  const [[w, s], [e, n]] = REGION_META[region].bounds;
  return [(w + e) / 2, (s + n) / 2];
}

function getSelectionLabel(sel: GeographicSelection): string {
  if (sel.type === 'preset') return sel.name;
  return sel.label ?? (sel.type === 'point' ? 'Selected Point' : 'Selected Region');
}

function ringsOf(geometry: Geometry): Position[][] {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

/** Generate an equirectangular Earth texture from bundled coastline geometry with photorealistic oceanic depth & land biomes. */
function drawEarthTexture(world: FeatureCollection, props: TerraMapProps): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is unavailable');

  // Multi-stop oceanic gradient (deep polar abyss to tropical azure waters)
  const ocean = ctx.createLinearGradient(0, 0, 0, TEX_H);
  ocean.addColorStop(0, '#061624');    // North polar abyss
  ocean.addColorStop(0.18, '#0b243b'); // Subpolar ocean
  ocean.addColorStop(0.42, '#0f3453'); // Temperate ocean
  ocean.addColorStop(0.50, '#134369'); // Equatorial waters
  ocean.addColorStop(0.58, '#0f3453'); // Temperate ocean
  ocean.addColorStop(0.82, '#0b243b'); // Subpolar ocean
  ocean.addColorStop(1, '#061624');    // South polar abyss
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Elegant, ultra-fine coordinate graticule
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(160, 220, 205, 0.12)';
  for (let lon = -150; lon < 180; lon += 30) {
    const x = ((lon + 180) / 360) * TEX_W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEX_H);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * TEX_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEX_W, y);
    ctx.stroke();
  }

  // Pass 1: Continental shallow water shelves (delicate turquoise halo along coastlines)
  ctx.strokeStyle = '#185075';
  ctx.lineWidth = 8;
  for (const feature of world.features) {
    if (!feature.geometry) continue;
    for (const ring of ringsOf(feature.geometry)) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      let previousLon: number | null = null;
      ring.forEach(([lon, lat], index) => {
        const x = ((lon + 180) / 360) * TEX_W;
        const y = ((90 - lat) / 180) * TEX_H;
        if (index === 0 || (previousLon !== null && Math.abs(lon - previousLon) > 180)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        previousLon = lon;
      });
      ctx.stroke();
    }
  }

  // Pass 2: Natural landmass vegetation tones with refined coastline borders
  ctx.fillStyle = '#265139';   // Deep natural forest/moss green
  ctx.strokeStyle = '#437d5a'; // Crisp coastline stroke
  ctx.lineWidth = 1.3;
  for (const feature of world.features) {
    if (!feature.geometry) continue;
    for (const ring of ringsOf(feature.geometry)) {
      if (ring.length < 3) continue;
      ctx.beginPath();
      let previousLon: number | null = null;
      ring.forEach(([lon, lat], index) => {
        const x = ((lon + 180) / 360) * TEX_W;
        const y = ((90 - lat) / 180) * TEX_H;
        if (index === 0 || (previousLon !== null && Math.abs(lon - previousLon) > 180)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        previousLon = lon;
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Pass 3: Dynamically generated NASA continuous environmental raster overlay
  if (props.grid && props.variable && props.grid.features.length > 0) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const f of props.grid.features) {
      for (const [lon, lat] of f.geometry.coordinates[0]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    const rasterCanvas = generateSmoothedRaster(props.grid, props.variable, props.mode, 384, 384);
    const x = ((minLon + 180) / 360) * TEX_W;
    const y = ((90 - maxLat) / 180) * TEX_H;
    const w = ((maxLon - minLon) / 360) * TEX_W;
    const h = ((maxLat - minLat) / 180) * TEX_H;

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(rasterCanvas, x, y, w, h);
    ctx.restore();
  }

  // Region study boundary indicator prior to analysis (preset mode)
  if (props.draftRegion && !props.grid) {
    const [[west, south], [east, north]] = REGION_META[props.draftRegion].bounds;
    ctx.strokeStyle = '#48df9a';
    ctx.lineWidth = 3.0;
    ctx.strokeRect(
      ((west + 180) / 360) * TEX_W,
      ((90 - north) / 180) * TEX_H,
      ((east - west) / 360) * TEX_W,
      ((north - south) / 180) * TEX_H
    );
  }

  return ctx.getImageData(0, 0, TEX_W, TEX_H);
}

/** Render a real spherical, rotatable orthographic globe with specular lighting, atmospheric halo & Fresnel scattering. */
function paintGlobe(canvas: HTMLCanvasElement, texture: ImageData | null, view: Orientation, props: TerraMapProps) {
  const bounds = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(bounds.width));
  const cssHeight = Math.max(1, Math.round(bounds.height));

  // High-DPI support: render at device pixel ratio (capped at 2 for smooth 60fps)
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep space cosmic vignette
  const cx = width / 2;
  const cy = height / 2;
  const bg = ctx.createRadialGradient(cx, cy, 20 * dpr, cx, cy, Math.max(width, height) * 0.75);
  bg.addColorStop(0, '#07161f');
  bg.addColorStop(0.65, '#040d13');
  bg.addColorStop(1, '#020609');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Micro-stars in deep space
  for (let i = 0; i < 75; i++) {
    const sx = (i * 317.31 + 41) % width;
    const sy = (i * 193.77 + 63) % height;
    const alpha = 0.15 + (i % 5) * 0.14;
    ctx.fillStyle = `rgba(205, 235, 225, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, (i % 9 === 0 ? 1.0 : 0.55) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  const radius = Math.min(width * 0.46, height * 0.43) * view.zoom;

  // Ethereal Outer Atmospheric Corona (multi-layer atmospheric scattering in space)
  if (view.zoom < 3.5) {
    const atmosphere = ctx.createRadialGradient(cx, cy, radius * 0.86, cx, cy, radius * 1.16);
    atmosphere.addColorStop(0, 'rgba(56, 212, 172, 0.04)');
    atmosphere.addColorStop(0.72, 'rgba(56, 212, 172, 0.22)');
    atmosphere.addColorStop(0.86, 'rgba(40, 160, 215, 0.12)');
    atmosphere.addColorStop(1, 'rgba(10, 40, 60, 0)');
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
    ctx.fill();
  }

  const frame = ctx.createImageData(width, height);
  const output = frame.data;
  const source = texture?.data;
  const phi0 = (view.lat * Math.PI) / 180;
  const cosPhi = Math.cos(phi0);
  const sinPhi = Math.sin(phi0);

  // Directional lighting from upper-left in space
  const lx = -0.38, ly = 0.42, lz = 0.82;

  const yMin = Math.max(0, Math.floor(cy - radius));
  const yMax = Math.min(height, Math.ceil(cy + radius));
  const xMin = Math.max(0, Math.floor(cx - radius));
  const xMax = Math.min(width, Math.ceil(cx + radius));

  for (let py = yMin; py < yMax; py++) {
    const y = (cy - py) / radius;
    const y2 = y * y;
    for (let px = xMin; px < xMax; px++) {
      const x = (px - cx) / radius;
      const rr = x * x + y2;
      if (rr > 1) continue;

      const z = Math.sqrt(Math.max(0, 1 - rr));
      const lat = Math.asin(clamp(y * cosPhi + z * sinPhi, -1, 1));
      const lon = normalizeLongitude(view.lon + (Math.atan2(x, z * cosPhi - y * sinPhi) * 180) / Math.PI);
      const u = clamp(((lon + 180) / 360) * TEX_W, 0, TEX_W - 1.001);
      const v = clamp(((Math.PI / 2 - lat) / Math.PI) * TEX_H, 0, TEX_H - 1.001);

      const u0 = Math.floor(u), v0 = Math.floor(v);
      const du = u - u0, dv = v - v0;
      const si = (v0 * TEX_W + u0) * 4;
      const di = (py * width + px) * 4;

      // Photorealistic 3D diffuse + ambient lighting with smooth terminator
      const dotL = Math.max(0, x * lx + y * ly + z * lz);
      const diffuse = 0.58 + 0.46 * dotL;

      // Fresnel atmospheric limb scattering (ethereal luminous cyan-blue haze at the planetary edge)
      const fresnel = Math.pow(1 - z, 3.2);

      if (source) {
        // Bilinear texture filtering for continuous zoom sharpness
        const a = (1 - du) * (1 - dv);
        const b = du * (1 - dv);
        const c = (1 - du) * dv;
        const d = du * dv;
        const right = si + 4;
        const down = si + TEX_W * 4;
        const diag = down + 4;

        const r = source[si] * a + source[right] * b + source[down] * c + source[diag] * d;
        const g = source[si + 1] * a + source[right + 1] * b + source[down + 1] * c + source[diag + 1] * d;
        const bl = source[si + 2] * a + source[right + 2] * b + source[down + 2] * c + source[diag + 2] * d;

        // Apply diffuse lighting + atmospheric limb scattering
        output[di] = clamp(r * diffuse + fresnel * 45, 0, 255);
        output[di + 1] = clamp(g * diffuse + fresnel * 155, 0, 255);
        output[di + 2] = clamp(bl * diffuse + fresnel * 190, 0, 255);
      } else {
        output[di] = clamp(20 * diffuse + fresnel * 40, 0, 255);
        output[di + 1] = clamp(70 * diffuse + fresnel * 140, 0, 255);
        output[di + 2] = clamp(95 * diffuse + fresnel * 180, 0, 255);
      }

      // Smooth antialiased boundary edge
      output[di + 3] = clamp((1 - rr) * radius * 1.5, 0, 1) * 255;
    }
  }

  const buffer = document.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  buffer.getContext('2d')?.putImageData(frame, 0, 0);
  ctx.drawImage(buffer, 0, 0);

  // Render vector grid cells & inspection outlines on 3D globe
  if (props.grid && props.variable) {
    ctx.save();

    for (const feature of props.grid.features) {
      const ring = feature.geometry.coordinates[0];
      let allFront = true;
      const pts: Array<{ x: number; y: number }> = [];

      for (const [lon, lat] of ring) {
        const p = projectGlobe(lon, lat, view.lon, view.lat);
        if (p.z <= 0.005) {
          allFront = false;
          break;
        }
        pts.push({
          x: cx + p.x * radius,
          y: cy - p.y * radius,
        });
      }

      if (!allFront || pts.length < 4) continue;

      const isSelected = feature.properties.id === props.selectedCellId;

      ctx.beginPath();
      pts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();

      // PART A: Continuous Heatmap is already rendered on the Earth surface!
      // Only stroke cell boundaries when "Show Original Data Grid" is active,
      // or if this cell is actively selected for data inspection.
      if (props.showDataGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
        ctx.lineWidth = 0.85 * dpr;
        ctx.stroke();

        // Measurement center dot
        const cp = projectGlobe(feature.properties.centerLon, feature.properties.centerLat, view.lon, view.lat);
        if (cp.z > 0.01) {
          ctx.beginPath();
          ctx.arc(cx + cp.x * radius, cy - cp.y * radius, 1.2 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.fill();
        }
      }

      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.0 * dpr;
        ctx.stroke();

        ctx.strokeStyle = '#2b2540';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  // PART B: Render Custom Selection on the 3D globe surface
  if (props.customSelection) {
    const sel = props.customSelection;
    ctx.save();

    if (sel.type === 'point') {
      const [lon, lat] = sel.coordinates;
      const p = projectGlobe(lon, lat, view.lon, view.lat);
      if (p.z > 0.01) {
        const sx = cx + p.x * radius;
        const sy = cy - p.y * radius;

        // Glowing outer ripple ring
        ctx.beginPath();
        ctx.arc(sx, sy, 9 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(43, 37, 64, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#2b2540';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();

        // Inner solid pinpoint
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = '#e8735a';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      }
    } else if (sel.type === 'bbox' || sel.type === 'polygon') {
      const ring =
        sel.type === 'bbox'
          ? [
              [sel.bounds[0][0], sel.bounds[0][1]],
              [sel.bounds[1][0], sel.bounds[0][1]],
              [sel.bounds[1][0], sel.bounds[1][1]],
              [sel.bounds[0][0], sel.bounds[1][1]],
              [sel.bounds[0][0], sel.bounds[0][1]],
            ]
          : sel.coordinates[0];

      let allFront = true;
      const pts: Array<{ x: number; y: number }> = [];

      for (const [lon, lat] of ring) {
        const p = projectGlobe(lon, lat, view.lon, view.lat);
        if (p.z <= 0.005) {
          allFront = false;
          break;
        }
        pts.push({ x: cx + p.x * radius, y: cy - p.y * radius });
      }

      if (allFront && pts.length >= 3) {
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(43, 37, 64, 0.20)';
        ctx.fill();
        ctx.strokeStyle = '#2b2540';
        ctx.lineWidth = 2.0 * dpr;
        ctx.setLineDash([4 * dpr, 3 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  // Delicate atmospheric rim line
  if (view.zoom < 2.5) {
    ctx.strokeStyle = 'rgba(75, 230, 185, 0.38)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function GlobeMap(props: TerraMapProps) {
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
    analysisBounds,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<ImageData | null>(null);
  const worldRef = useRef<FeatureCollection | null>(null);
  const frameRef = useRef<number | null>(null);
  const viewRef = useRef<Orientation>({ lon: 12, lat: 13, zoom: 1 });
  const dragRef = useRef<Drag | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef<number>(0);
  const pinchStartZoomRef = useRef<number>(1);
  const [view, setView] = useState<Orientation>(viewRef.current);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showInstruction, setShowInstruction] = useState(true);

  const updateView = useCallback((next: Orientation) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const zoom = useCallback(
    (factor: number) => {
      updateView({
        ...viewRef.current,
        zoom: clamp(viewRef.current.zoom * factor, MIN_ZOOM, MAX_ZOOM),
      });
    },
    [updateView]
  );

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Center camera on region, custom bounds, or global view
  useEffect(() => {
    if (analysisBounds) {
      const [lon, lat] = getBoundsCenter(analysisBounds);
      updateView({ lon, lat, zoom: 9 });
    } else if (customSelection) {
      const b = getSelectionBounds(customSelection);
      const [lon, lat] = getBoundsCenter(b);
      updateView({ lon, lat, zoom: 8 });
    } else if (draftRegion) {
      const [lon, lat] = regionCenter(draftRegion);
      updateView({ lon, lat, zoom: 9 });
    } else {
      updateView({ lon: 12, lat: 13, zoom: 1 });
    }
  }, [draftRegion, customSelection, analysisBounds, updateView]);

  // Load world coastline geometry
  useEffect(() => {
    let active = true;
    fetch('/world.geojson')
      .then(r => {
        if (!r.ok) throw new Error('World geometry not found');
        return r.json() as Promise<FeatureCollection>;
      })
      .then(world => {
        if (active) {
          worldRef.current = world;
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setLoadError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Re-generate texture when grid, variable, or mode changes
  useEffect(() => {
    if (!worldRef.current) return;
    textureRef.current = drawEarthTexture(worldRef.current, props);
    setView(v => ({ ...v }));
  }, [loading, variable, mode, grid, selectedCellId, draftRegion, customSelection]);

  // Paint loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      paintGlobe(canvas, textureRef.current, view, props);
      frameRef.current = null;
    });
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [view, loading, showDataGrid, customSelection, props]);

  // Canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setView(v => ({ ...v })));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Native non-passive wheel event listener to guarantee webpage NEVER scrolls during map zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowInstruction(false);

      const delta = e.deltaY;
      const factor =
        e.deltaMode === 1
          ? Math.pow(1.2, -Math.sign(delta))
          : Math.max(0.75, Math.min(1.35, Math.pow(1.0018, -delta)));

      zoomRef.current(factor);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Native non-passive touch listeners on canvas to prevent mobile page pull/scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouch = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouch);
      canvas.removeEventListener('touchmove', handleTouch);
    };
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    setShowInstruction(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        lon: viewRef.current.lon,
        lat: viewRef.current.lat,
        moved: false,
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartZoomRef.current = viewRef.current.zoom;
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchDistRef.current > 0) {
      const pts = Array.from(pointersRef.current.values());
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (newDist > 0) {
        const scale = newDist / pinchDistRef.current;
        const nextZoom = clamp(pinchStartZoomRef.current * scale, MIN_ZOOM, MAX_ZOOM);
        updateView({ ...viewRef.current, zoom: nextZoom });
      }
    } else if (pointersRef.current.size === 1 && dragRef.current) {
      const drag = dragRef.current;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const radius = Math.min(rect.width * 0.46, rect.height * 0.43) * viewRef.current.zoom;
      const degreesPerPixel = 180 / Math.PI / Math.max(40, radius);
      updateView({
        ...viewRef.current,
        lon: normalizeLongitude(drag.lon - dx * degreesPerPixel),
        lat: clamp(drag.lat + dy * degreesPerPixel, -85, 85),
      });
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const hadPinch = pointersRef.current.size >= 2;
    pointersRef.current.delete(e.pointerId);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if pointer capture was already released
    }

    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      pinchDistRef.current = 0;

      // Handle click if no drag occurred
      if (!hadPinch && drag && !drag.moved) {
        const rect = e.currentTarget.getBoundingClientRect();
        const radius = Math.min(rect.width * 0.46, rect.height * 0.43) * viewRef.current.zoom;
        const x = (e.clientX - rect.left - rect.width / 2) / radius;
        const y = (rect.height / 2 - (e.clientY - rect.top)) / radius;
        const position = unprojectGlobe(x, y, viewRef.current.lon, viewRef.current.lat);

        if (position) {
          if (drawMode === 'point') {
            const lon = Number(position.lon.toFixed(4));
            const lat = Number(position.lat.toFixed(4));
            onCustomSelectionChange?.({
              type: 'point',
              coordinates: [lon, lat],
              label: `Point (${formatCoordinates(lat, lon)})`,
            });
          } else if (grid && drawMode === 'none') {
            const cellId = findGridCell(grid, position.lon, position.lat);
            if (cellId) onSelectCell(cellId);
          }
        }
      }
    } else if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      dragRef.current = {
        startX: remaining.x,
        startY: remaining.y,
        lon: viewRef.current.lon,
        lat: viewRef.current.lat,
        moved: false,
      };
      pinchDistRef.current = 0;
    }
  };

  const focus = () => {
    if (customSelection) {
      const b = getSelectionBounds(customSelection);
      const [lon, lat] = getBoundsCenter(b);
      updateView({ lon, lat, zoom: 11 });
    } else if (draftRegion) {
      const [lon, lat] = regionCenter(draftRegion);
      updateView({ lon, lat, zoom: 11 });
    } else {
      updateView({ lon: 12, lat: 13, zoom: 1 });
    }
  };

  const resetToGlobal = () => updateView({ lon: 12, lat: 13, zoom: 1 });
  const meta = variable ? VARIABLE_META[variable] : null;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-[#dce7e1] bg-[#050e14] shadow-inner"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className={`block h-[380px] w-full touch-none sm:h-[460px] xl:h-[500px] ${
          drawMode === 'point' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ touchAction: 'none' }}
        role="application"
        aria-label="Interactive 3D Earth Globe"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          pointersRef.current.clear();
          pinchDistRef.current = 0;
        }}
      />

      {/* Region Status Pill with Frosted Glass Styling */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-full bg-white/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-semibold text-[#2b2540] shadow-sm border border-white/60 flex items-center gap-1.5">
          {customSelection ? (
            <>
              <Target size={12} className="text-[#c4621a]" />
              <span>{getSelectionLabel(customSelection)}</span>
            </>
          ) : draftRegion ? (
            REGION_META[draftRegion].name
          ) : (
            'Global View'
          )}{' '}
          · 3D Globe
        </span>
        <span className="hidden sm:inline-block rounded-full bg-[#2b2540]/80 backdrop-blur-sm text-white border border-white/10 px-2.5 py-1 text-[10px] font-mono shadow-xs">
          {view.lat >= 0 ? `${view.lat.toFixed(1)}°N` : `${Math.abs(view.lat).toFixed(1)}°S`},{' '}
          {view.lon >= 0 ? `${view.lon.toFixed(1)}°E` : `${Math.abs(view.lon).toFixed(1)}°W`}
        </span>
        {drawMode === 'point' && (
          <span className="rounded-full bg-[#2b2540] text-white px-3 py-1 text-[11px] font-medium shadow-sm flex items-center gap-1 animate-pulse">
            <MapPin size={12} />
            <span>Click globe to place point</span>
          </span>
        )}
      </div>

      {/* Notice for 2D shape drawing while in 3D globe */}
      {(drawMode === 'rectangle' || drawMode === 'polygon') && (
        <div className="absolute top-14 left-3 right-3 sm:left-auto sm:right-14 max-w-sm rounded-xl bg-white/95 backdrop-blur-md p-3 text-xs text-[#2b2540] shadow-xl border border-[#ece3d3] flex items-center gap-2.5 z-10">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ede6fb] text-[#2b2540]">
            {drawMode === 'rectangle' ? <Square size={14} /> : <Shapes size={14} />}
          </div>
          <p className="leading-snug text-[11px] font-semibold">
            Drawing shapes is precision-optimized on the 2D map. Switch to <strong>2D Map</strong> to draw, and your shape will render on this 3D globe.
          </p>
        </div>
      )}

      {/* Compact Floating Map Control Group */}
      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-xl bg-white/90 backdrop-blur-md p-1 shadow-md border border-white/70">
        <button className="map-control" aria-label="Zoom in" onClick={() => zoom(1.35)} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button className="map-control" aria-label="Zoom out" onClick={() => zoom(1 / 1.35)} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        {(draftRegion || customSelection) && (
          <button className="map-control" aria-label="Focus region" onClick={focus} title="Focus study region">
            <Target size={14} />
          </button>
        )}
        <button className="map-control" aria-label="Reset to global view" onClick={resetToGlobal} title="Reset to global view">
          <RotateCcw size={13} />
        </button>
        <button
          className={`map-control ${showInstruction ? 'text-[#2b2540] bg-[#ede6fb]' : ''}`}
          aria-label="Toggle interaction instructions"
          onClick={() => setShowInstruction((prev) => !prev)}
          title="Interaction instructions"
        >
          <HelpCircle size={14} />
        </button>
      </div>

      {/* Loading State Overlay */}
      {loading && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 backdrop-blur-md px-4 py-3 text-xs font-semibold text-[#2b2540] shadow-xl flex items-center gap-2.5 border border-[#ece3d3]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2b2540] border-t-transparent" />
          <span>Rendering Earth geography...</span>
        </div>
      )}

      {loadError && (
        <p className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 text-xs text-red-600 shadow-sm border border-red-200">
          World geometry could not load. Please run the Vite dev server.
        </p>
      )}

      {/* High-Contrast Opaque Map Instruction Pill (Part 1) */}
      {showInstruction && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-[#4e4860] bg-[#2b2540] px-3.5 py-1.5 text-xs font-semibold text-white shadow-card animate-in fade-in slide-in-from-bottom-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ede6fb] animate-pulse" />
          <span>Drag to rotate · Scroll to zoom</span>
          <button
            type="button"
            onClick={() => setShowInstruction(false)}
            className="ml-1 rounded-full p-0.5 text-[#ede6fb] hover:bg-[#3c3454] hover:text-white transition cursor-pointer"
            aria-label="Dismiss instructions"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Premium Floating Legend Card */}
      {grid && meta && (
        <div className="pointer-events-none absolute bottom-3 left-3 w-[min(340px,calc(100%-24px))] rounded-2xl border border-white/70 bg-white/92 backdrop-blur-md p-3.5 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-bold text-[#2b2540]">
            <span className="flex items-center gap-1.5">
              <Layers3 size={13} className="text-[#2b2540]" />
              {mode === 'value' ? `Mean ${meta.name}` : `${meta.name} Trend`}
            </span>
            <span className="font-semibold text-[#2b2540] text-[10px] bg-[#ede6fb] px-2 py-0.5 rounded-md border border-[#ece3d3]">
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
