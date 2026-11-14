// Time-lapse helpers: frame decoding, cell lookup (south-to-north rows), colours and painting. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cache = await mkdtemp(join(resolve(tmpdir()), 'terrascope-tl-'));
const server = await createServer({ cacheDir: cache, server: { middlewareMode: true, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const tl = await server.ssrLoadModule('/src/timelapseData.ts');
  // 2 frames, 2 rows (south, north), 3 columns; one missing cell
  const q = new Int16Array([0, 100, -100, 200, -32768, 300, 10, 20, 30, 40, 50, 60]);
  const resp = { times: ['2001-01', '2001-02'], grid: { west: -180, south: -90, cell_deg: 90, nlon: 3, nlat: 2 }, scale: 0.01, offset: 5, missing: -32768,
    display_range: [-1, 1], data_b64: Buffer.from(q.buffer).toString('base64') };

  test('decodes int16 frames and looks up cells with row 0 in the south', () => {
    const f = tl.decodeFrames(resp);
    assert.equal(f.n, 2);
    assert.equal(tl.valueAt(f, 0, 0, 1), 100 * 0.01 + 5);
    assert.equal(tl.valueAt(f, 0, 1, 1), null, 'missing value');
    assert.equal(tl.valueAt(f, 1, 1, 2), 60 * 0.01 + 5);
    assert.equal(tl.valueAt(f, 2, 0, 0), null, 'out of range frame');
  });

  test('colours follow the app convention and painting puts north on top', () => {
    assert.deepEqual(tl.colourOf(-10, -1, 1, tl.DIVERGING), tl.DIVERGING[0], 'below usual: blue end');
    assert.deepEqual(tl.colourOf(10, -1, 1, tl.DIVERGING), tl.DIVERGING.at(-1), 'above usual: orange end');
    const f = tl.decodeFrames(resp), px = new Uint8ClampedArray(3 * 2 * 4);
    tl.paintFrame(f, 0, 4, 8, tl.SEQUENTIAL, px);
    assert.equal(px[(0 * 3 + 1) * 4 + 3], 0, 'missing north-middle cell is transparent in the top image row');
    assert.equal(px[(1 * 3 + 1) * 4 + 3], 235, 'south-middle cell is drawn in the bottom image row');
    assert.equal(tl.monthLabel('2015-12'), 'Dec 2015');
  });
} finally { await server.close(); }
