// Time-lapse helpers (pure, tested): decode the int16 frames sent by /values/frames and map values to colours.
// Display only: no statistics are computed here.
import type { FramesResponse } from "./api";

export interface Frames { data: Int16Array; n: number; nlat: number; nlon: number; scale: number; offset: number; missing: number }

export function decodeFrames(r: FramesResponse): Frames {
  const bin = atob(r.data_b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const data = new Int16Array(buf);   // little-endian, like every browser platform
  return { data, n: r.times.length, nlat: r.grid.nlat, nlon: r.grid.nlon, scale: r.scale, offset: r.offset, missing: r.missing };
}

/** Value of one cell in one frame (row 0 is the southern edge), or null when there is no data. */
export function valueAt(f: Frames, t: number, row: number, col: number): number | null {
  if (t < 0 || t >= f.n || row < 0 || row >= f.nlat || col < 0 || col >= f.nlon) return null;
  const q = f.data[(t * f.nlat + row) * f.nlon + col];
  return q === f.missing ? null : q * f.scale + f.offset;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Anomaly: below normal blue, near normal pale, above normal orange (the app's decrease / increase colours).
export const DIVERGING = ["#2f6fb3", "#7fb2e5", "#cfe1f4", "#f6f1e8", "#fbe0c4", "#f2a65a", "#c4621a"].map(hex);
export const SEQUENTIAL = ["#fff4c2", "#c8ecc0", "#7fd1c2", "#4aa6c4", "#5a6fb8", "#4b3a8c"].map(hex);

/** Colour for a value inside [lo, hi], linear between palette stops, clamped at the ends. */
export function colourOf(v: number, lo: number, hi: number, palette: RGB[]): RGB {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))) * (palette.length - 1);
  const i = Math.min(palette.length - 2, Math.floor(t)), f = t - i, a = palette[i], b = palette[i + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

/** Paints one frame into RGBA pixels, one pixel per cell, north at the top. Missing cells stay transparent. */
export function paintFrame(f: Frames, t: number, lo: number, hi: number, palette: RGB[], out: Uint8ClampedArray, convert = (v: number) => v) {
  for (let row = 0; row < f.nlat; row++) {
    const y = f.nlat - 1 - row;
    for (let col = 0; col < f.nlon; col++) {
      const v = valueAt(f, t, row, col), p = (y * f.nlon + col) * 4;
      if (v === null) { out[p + 3] = 0; continue; }
      const c = colourOf(convert(v), lo, hi, palette);
      out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 235;
    }
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
