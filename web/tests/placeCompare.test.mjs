// "What's changing here?" (F2): per-variable period clamping, verdict chip mapping, no-data detection. Offline, fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// InfoButton is another agent's file and not under test here: stub it so this test never depends on it.
const stub = { name: 'stub-info', enforce: 'pre', resolveId: (id) => (id === './InfoButton' ? '\0info' : null), load: (id) => (id === '\0info' ? 'export const InfoButton = () => null;' : null) };
const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-pc-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, plugins: [stub] });
try {
  const { clampPeriod, rowVerdict, isNoData } = await server.ssrLoadModule('/src/PlaceCompare.tsx');
  const { ApiError } = await server.ssrLoadModule('/src/api.ts');

  // Trimmed from real POST /trends responses (localhost:8000, 2026-11-15).
  const sigUp = { slope_per_decade: 4.229, significant: true, p_value: 0.041, quality: { n_months: 297, missing_months: 3, coverage_fraction: 0.99, sufficient: true } };
  const shortRun = { slope_per_decade: 27.24, significant: null, p_value: null, quality: { n_months: 96, missing_months: 0, coverage_fraction: 1, sufficient: false } };

  test('period is clamped to each variable\'s coverage; under 10 calendar years is too short to test', () => {
    const full = { start: '2001-01', end: '2025-12' };
    assert.deepEqual(clampPeriod('2001-01', '2025-12', full), { start: '2001-01', end: '2025-12', clamped: false, short: false });
    assert.deepEqual(clampPeriod('2001-01', '2025-12', { start: '2001-01', end: '2020-12' }), { start: '2001-01', end: '2020-12', clamped: true, short: false });   // GPCC
    assert.deepEqual(clampPeriod('2001-01', '2025-12', { start: '2015-04', end: '2025-12' }), { start: '2015-04', end: '2025-12', clamped: true, short: false });   // SMAP: 11 years
    assert.equal(clampPeriod('2001-01', '2025-12', { start: '2001-01', end: '2010-12' }).short, false);   // a record of exactly 10 years
    assert.equal(clampPeriod('2005-01', '2025-12', { start: '2001-01', end: '2010-12' }).short, true);    // 2005–2010 only
    assert.equal(clampPeriod('2001-01', '2008-12', full).short, true);
    assert.equal(clampPeriod('2001-01', '2014-12', { start: '2015-04', end: '2025-12' }), null, 'no overlap');
    assert.equal(clampPeriod('2001-01', '2025-12', null), null, 'unavailable variable has no coverage');
  });

  test('verdict chip comes from the backend flags, never recomputed', () => {
    assert.deepEqual(rowVerdict(sigUp), { label: 'Rising', chance: false, tone: 'up' });
    assert.deepEqual(rowVerdict({ ...sigUp, slope_per_decade: -0.3 }), { label: 'Falling', chance: false, tone: 'down' });
    assert.deepEqual(rowVerdict({ ...sigUp, significant: false, slope_per_decade: -0.3 }), { label: 'Falling', chance: true, tone: 'down' });
    assert.deepEqual(rowVerdict({ ...sigUp, significant: false, slope_per_decade: 0.2 }), { label: 'Rising', chance: true, tone: 'up' });
    assert.deepEqual(rowVerdict({ ...sigUp, significant: false, slope_per_decade: 0 }), { label: 'No clear change', chance: true, tone: 'flat' });
    assert.deepEqual(rowVerdict(shortRun), { label: 'Not enough data', chance: false, tone: 'none' }, 'insufficient data: no direction claimed');
    assert.deepEqual(rowVerdict({ ...sigUp, significant: null }), { label: 'Not enough data', chance: false, tone: 'none' });
  });

  test('404 NO_DATA is "no data for this place", other errors are not', () => {
    assert.equal(isNoData(new ApiError('NO_DATA', 'No air temperature over land data in this region', 404)), true);
    assert.equal(isNoData(new ApiError('INTERNAL_ERROR', 'HTTP 404', 404)), true);
    assert.equal(isNoData(new ApiError('NETWORK_ERROR', 'Cannot reach the server', undefined, true)), false);
    assert.equal(isNoData(new ApiError('INVALID_TIME_RANGE', 'outside coverage', 400)), false);
    assert.equal(isNoData(new Error('x')), false);
  });
} finally {
  await server.close();
}
