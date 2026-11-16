import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = (f) => fileURLToPath(new URL(`../src/${f}`, import.meta.url));
const out = await mkdtemp(join(tmpdir(), 'terrascope-cases-'));
execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
  '--ignoreConfig', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck', '--noCheck',
  '--outDir', out, src('starterCases.ts')]);
const { STARTER_CASES, PLACE_TYPES, CURIOSITIES, matchCases } = await import(pathToFileURL(join(out, 'starterCases.js')).href);
await rm(out, { recursive: true, force: true });

// Months that hold values (GET /variables plus Agent F's table). IMERG Final V07 stops at 2025-09.
const COVERAGE = {
  imerg_precip: ['2001-01', '2025-09'], gldas_soil_moisture_0_10cm: ['2001-01', '2025-12'],
  gldas_air_temperature: ['2001-01', '2025-12'], gldas_evapotranspiration: ['2001-01', '2025-12'],
  merra2_air_temperature_2m: ['2001-01', '2025-12'],
  gpcc_precip: ['2001-01', '2020-12'], smap_soil_moisture_surface: ['2015-04', '2025-12'],
  gldas_root_zone_moisture: ['2001-01', '2025-12'], modisa_chlorophyll: ['2002-07', '2025-12'], cru_precip: ['2001-01', '2025-12'],
  gldas_soil_moisture_10_40cm: ['2001-01', '2025-12'], gldas_soil_moisture_40_100cm: ['2001-01', '2025-12'],
  gldas_soil_moisture_100_200cm: ['2001-01', '2025-12'],
};
const PRESETS = new Set(['global', 'mekong_region', 'mekong_delta', 'central_highlands', 'hanoi', 'northern_vietnam',
  'central_chile', 'southern_amazon', 'europe', 'mediterranean']);
const CHALLENGE_PLACES = ['desert', 'rain forest', 'river delta', 'big city', 'farmland', 'mountains or snow', 'coast'];
const words = (s) => s.trim().split(/\s+/).length;

test('6 to 8 cases with unique ids and known categories', () => {
  assert.ok(STARTER_CASES.length >= 6 && STARTER_CASES.length <= 8);
  assert.equal(new Set(STARTER_CASES.map((c) => c.id)).size, STARTER_CASES.length);
  for (const c of STARTER_CASES) {
    assert.ok(PLACE_TYPES.includes(c.placeType), c.id);
    assert.ok(CURIOSITIES.includes(c.curiosity), c.id);
  }
});

test('every place type the challenge names has a case', () => {
  assert.deepEqual([...PLACE_TYPES], CHALLENGE_PLACES);
  for (const p of CHALLENGE_PLACES) assert.ok(STARTER_CASES.some((c) => c.placeType === p), p);
});

test('variable is available or an F11 id, and the period sits inside its coverage in whole years', () => {
  for (const c of STARTER_CASES) {
    const cov = COVERAGE[c.variable_id];
    assert.ok(cov, `${c.id}: unknown variable ${c.variable_id}`);
    assert.match(c.start, /^\d{4}-01$/, c.id);
    assert.match(c.end, /^\d{4}-12$/, c.id);
    assert.ok(c.start >= cov[0] && c.end <= cov[1] && c.start < c.end, `${c.id}: ${c.start}..${c.end} outside ${cov}`);
    assert.ok(Number(c.end.slice(0, 4)) - Number(c.start.slice(0, 4)) + 1 >= 10, `${c.id}: needs >= 10 years`);
  }
});

test('place is a catalog preset or a 0.5° box at least 1° wide', () => {
  for (const c of STARTER_CASES) {
    if (c.place.type === 'preset') { assert.ok(PRESETS.has(c.place.id), `${c.id}: ${c.place.id}`); continue; }
    assert.equal(c.place.type, 'bbox', c.id);
    const [w, s, e, n] = c.place.bbox;
    for (const x of c.place.bbox) assert.ok(Number.isInteger(x * 2), `${c.id}: ${x} not on the 0.5° grid`);
    assert.ok(w >= -180 && e <= 180 && s >= -90 && n <= 90, c.id);
    assert.ok(e - w >= 1 && n - s >= 1, `${c.id}: box too small`);
  }
});

test('word budgets, https sources and no long dash', async () => {
  for (const c of STARTER_CASES) {
    assert.ok(words(c.question) <= 10, `${c.id}: question has ${words(c.question)} words`);
    assert.ok(words(c.hypothesis) <= 25, `${c.id}: hypothesis has ${words(c.hypothesis)} words`);
    assert.match(c.source.url, /^https:\/\//, c.id);
    assert.ok(c.source.title && c.source.publisher && c.source.year >= 1990 && c.source.year <= 2026, c.id);
  }
  for (const f of ['starterCases.ts', 'CaseStarter.tsx']) assert.ok(!(await readFile(src(f), 'utf8')).includes('—'), f);
});

test('chip filters', () => {
  assert.deepEqual(matchCases('coast', null).map((c) => c.placeType), ['coast']);
  assert.ok(matchCases(null, 'heat').every((c) => c.curiosity === 'heat'));
  assert.equal(matchCases(null, null).length, STARTER_CASES.length);
  assert.equal(matchCases('desert', 'ocean life').length, 0);
});
