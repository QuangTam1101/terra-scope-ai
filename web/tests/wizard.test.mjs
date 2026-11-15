// "Start investigating" wizard (wizard.ts): deterministic ranking table, missing variables dropped, periods clamped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// wizard.ts imports period.ts and starterCases.ts without extensions, so load it through Vite (as placeCompare.test does).
const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-wiz-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const W = await server.ssrLoadModule('/src/wizard.ts');
const { DEFINITIONS } = await server.ssrLoadModule('/src/definitions.ts');
await server.close();

// GET /api/v1/variables on localhost:8000, 2026-11-16 (ids, availability and coverage only).
const COV = {
  imerg_precip: ['2001-01', '2024-12'], gldas_soil_moisture_0_10cm: ['2001-01', '2026-07'], gldas_air_temperature: ['2001-01', '2026-07'],
  gldas_evapotranspiration: ['2001-01', '2026-07'], merra2_air_temperature_2m: ['2001-01', '2024-12'], modis_ndvi: ['2001-01', '2025-12'],
  modis_lst_day: ['2001-01', '2025-12'], modis_lst_night: ['2001-01', '2025-12'], gldas_potential_evapotranspiration: ['2001-01', '2025-12'],
  gpcc_precip: ['2001-01', '2020-12'], smap_soil_moisture_surface: ['2015-04', '2025-12'], gldas_root_zone_moisture: ['2001-01', '2025-12'],
  seawifs_chlorophyll: ['2001-01', '2010-12'], cru_precip: ['2001-01', '2025-12'], gldas_soil_moisture_10_40cm: ['2001-01', '2025-12'],
  gldas_soil_moisture_40_100cm: ['2001-01', '2025-12'], gldas_soil_moisture_100_200cm: ['2001-01', '2025-12'],
};
const vars = (cov = COV) => [...Object.entries(cov).map(([id, [start, end]]) => ({ id, available: true, coverage: { start, end } })),
  { id: 'modis_et', available: false, coverage: null }];
const LONGEST = { kind: 'longest' };
const ids = (list) => list.map((s) => s.variable.id);

test('every table id is a catalog variable with an "i" definition', () => {
  for (const id of W.tableIds()) {
    assert.ok(COV[id], `${id} is not in /variables`);
    assert.ok(DEFINITIONS[id], `${id} has no definition`);
  }
});

test('ranking is the table order, at most 3, deterministic', () => {
  assert.deepEqual(ids(W.rankVariables('heat', 'city', vars(), LONGEST)), ['modis_lst_night', 'modis_lst_day', 'merra2_air_temperature_2m']);
  assert.deepEqual(ids(W.rankVariables('water', 'desert', vars(), LONGEST)), ['imerg_precip', 'gpcc_precip', 'gldas_potential_evapotranspiration']);
  assert.deepEqual(ids(W.rankVariables('plants', 'ocean', vars(), LONGEST)), ['seawifs_chlorophyll']);
  assert.deepEqual(W.rankVariables('heat', 'city', vars(), LONGEST), W.rankVariables('heat', 'city', vars(), LONGEST));
  for (const t of W.TOPICS) for (const p of W.PLACES) {
    const r = W.rankVariables(t.id, p.id, vars(), LONGEST);
    assert.ok(r.length <= 3, `${t.id}/${p.id}`);
    for (const s of r) assert.ok(s.reason.length > 10 && !s.reason.includes('—'), `${t.id}/${p.id}: reason`);
    if (!(t.id === 'soil' && p.id === 'ocean')) assert.ok(r.length >= 1, `${t.id}/${p.id} suggests nothing`);
  }
  assert.deepEqual(W.rankVariables('soil', 'ocean', vars(), LONGEST), [], 'no soil at sea');
});

test('missing or unavailable variables are skipped (the preview may have fewer cubes)', () => {
  const { modis_lst_night, ...rest } = COV;
  assert.deepEqual(ids(W.rankVariables('heat', 'city', vars(rest), LONGEST)), ['modis_lst_day', 'merra2_air_temperature_2m']);
  const off = vars().map((v) => (v.id === 'modis_lst_day' ? { ...v, available: false } : v));
  assert.deepEqual(ids(W.rankVariables('heat', 'city', off, LONGEST)), ['modis_lst_night', 'merra2_air_temperature_2m']);
  assert.deepEqual(W.rankVariables('heat', 'city', [], LONGEST), []);
});

test('period: longest is the whole record; recent is the last 10 calendar years; custom is clamped', () => {
  const imerg = { start: '2001-01', end: '2024-12' }, smap = { start: '2015-04', end: '2025-12' }, seawifs = { start: '2001-01', end: '2010-12' };
  assert.deepEqual(W.periodFor(smap, LONGEST), { start: '2015-04', end: '2025-12', clamped: false, short: false });
  assert.deepEqual(W.periodFor(imerg, { kind: 'recent' }), { start: '2015-01', end: '2024-12', clamped: false, short: false });
  assert.deepEqual(W.periodFor(smap, { kind: 'recent' }), { start: '2016-01', end: '2025-12', clamped: false, short: false });
  assert.deepEqual(W.periodFor(smap, { kind: 'custom', from: 2001, to: 2026 }), { start: '2015-04', end: '2025-12', clamped: true, short: false });
  assert.equal(W.periodFor(seawifs, { kind: 'custom', from: 2005, to: 2020 }).short, true, '2005 to 2010 is under 10 years');
  assert.equal(W.periodFor(seawifs, { kind: 'custom', from: 2015, to: 2025 }), null, 'no overlap');
  assert.equal(W.periodFor(imerg, { kind: 'custom', from: 2020, to: 2010 }), null, 'reversed years');
  assert.equal(W.periodFor(null, LONGEST), null);
});

test('variables with no months in the chosen years drop out; the rest are clamped to their own record', () => {
  const r = W.rankVariables('ocean', 'ocean', vars(), { kind: 'custom', from: 2015, to: 2026 });
  assert.deepEqual(ids(r), ['merra2_air_temperature_2m', 'imerg_precip'], 'SeaWiFS stops in 2010');
  assert.deepEqual(r.map((s) => [s.start, s.end, s.clamped]), [['2015-01', '2024-12', true], ['2015-01', '2024-12', true]]);
});

test('regions: example per place, ocean override, none for the map; clues match curated cases', () => {
  assert.deepEqual(W.regionFor('heat', 'rainforest').ref, { type: 'preset', id: 'southern_amazon' });
  assert.equal(W.regionFor('ocean', 'farmland').name, 'Gulf of Mexico by the Mississippi Delta');
  assert.equal(W.regionFor('water', 'map'), null);
  for (const t of W.TOPICS) for (const p of W.PLACES) {
    const r = W.regionFor(t.id, p.id);
    if (r?.ref.type === 'bbox') for (const x of r.ref.bbox) assert.ok(Number.isInteger(x * 2), `${t.id}/${p.id}: ${x} off the 0.5° grid`);
  }
  assert.deepEqual(W.cluesFor('heat', 'city').map((c) => c.id), ['hanoi-heat']);
  assert.deepEqual(W.cluesFor('ocean', 'farmland').map((c) => c.id), ['mississippi-algae']);
  assert.equal(W.cluesFor('soil', 'ocean').length, 0);
});
