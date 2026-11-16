// "Same cause, opposite trends": hand-off link, default period, pair choice, mechanism rows, examples and copy rules,
// plus a server-side render of the views (no window during render). Offline: fixtures only, no backend.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const vars = [
  { id: 'imerg_precip', parameter: 'precipitation', parameter_name: 'Precipitation', dataset_name: 'GPM IMERG (satellite)', display_units: 'mm/month', available: true, coverage: { start: '2001-01', end: '2024-12' } },
  { id: 'merra2_air_temperature_2m', parameter: 'air_temperature', parameter_name: 'Air temperature', dataset_name: 'MERRA-2', display_units: '°C', available: true, coverage: { start: '2001-01', end: '2024-12' } },
];
const noop = () => {};
globalThis.oppStore = { audience: 'explorer', variables: vars, variable: vars[0], tempUnit: 'C', showError: noop };

const cache = await mkdtemp(join(tmpdir(), 'terrascope-opp-'));
const server = await createServer({ cacheDir: cache, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{
  name: 'opp-offline', enforce: 'pre',
  resolveId(s) { if (/(?:^|\/)store(?:\.tsx)?$/.test(s)) return '\0opp-store'; if (/(?:^|\/)InfoButton(?:\.tsx)?$/.test(s)) return '\0opp-info'; },
  load(id) {
    if (id === '\0opp-store') return 'export const useStore = () => globalThis.oppStore;';
    if (id === '\0opp-info') return 'export const InfoButton = () => null;';
  },
}] });
after(async () => { await server.close(); await rm(cache, { recursive: true, force: true }); });

const O = await server.ssrLoadModule('/src/opposite.ts');
const V = await server.ssrLoadModule('/src/OppositeTrends.tsx');
const { pageFromHash } = await server.ssrLoadModule('/src/pageRouting.ts');

test('the hand-off link carries variable and period, opens Hunt, and rejects bad values', () => {
  const r = { variableId: 'imerg_precip', start: '2001-01', end: '2024-12' };
  const h = O.oppositeHash(r);
  assert.equal(h, '#hunt?opposite=imerg_precip&from=2001-01&to=2024-12');
  assert.deepEqual(O.parseOpposite(h), r);
  assert.equal(pageFromHash(h), 'hunt');
  assert.equal(O.parseOpposite(O.oppositeHash(null)), 'open');
  assert.equal(pageFromHash(O.oppositeHash(null)), 'hunt');
  for (const bad of ['#hunt?opposite=imerg_precip&from=2024-12&to=2001-01', '#hunt?opposite=x&from=2001-13&to=2024-12',
    '#hunt?opposite=%3Cscript%3E&from=2001-01&to=2024-12', '#hunt?opposite=imerg_precip']) assert.equal(O.parseOpposite(bad), 'open', bad);
  for (const other of ['#hunt', '#explore?v=imerg_precip', '#hunt?case=1', '']) assert.equal(O.parseOpposite(other), null, other);
});

test('default period: whole calendar years, the rule the server uses for its precomputed maps', () => {
  assert.deepEqual(O.wholeYears({ start: '2001-01', end: '2026-07' }), { start: '2001-01', end: '2025-12' });   // GLDAS to July 2026
  assert.deepEqual(O.wholeYears({ start: '2015-04', end: '2025-12' }), { start: '2016-01', end: '2025-12' });   // SMAP
  assert.deepEqual(O.wholeYears({ start: '2001-01', end: '2010-12' }), { start: '2001-01', end: '2010-12' });   // a record of exactly 10 years
  assert.equal(O.wholeYears(null), null);
  assert.equal(O.wholeYears({ start: '2020-03', end: '2020-11' }), null);
});

test('the pair shown first passed the difference test when any did; otherwise the best tested one; else the top pattern', () => {
  const c = (rank, verdict) => ({ rank, test: verdict ? { verdict } : null });
  assert.equal(O.bestPair([c(1, 'opposite_not_significant'), c(2, 'opposite_significant'), c(3, 'opposite_significant')]).rank, 2);
  assert.equal(O.bestPair([c(1, null), c(2, 'same_direction')]).rank, 2);
  assert.equal(O.bestPair([c(1, null), c(2, null)]).rank, 1);
  assert.equal(O.bestPair([]), null);
  assert.equal(O.pairStatus(null).label, 'Map pattern only: not tested as two places');
  assert.equal(O.pairStatus('opposite_not_significant').cls, 'np');
  assert.equal(O.pairStatus('opposite_significant').cls, 'sig');
});

test('mechanism rows: one per variable family, checked sources, examples covered, scan within the tile limit', () => {
  assert.equal(O.mechanismFor('imerg_precip').id, 'rain');
  assert.equal(O.mechanismFor('gldas_root_zone_moisture').id, 'soil');
  assert.equal(O.mechanismFor('modisa_chlorophyll').id, 'algae');
  assert.equal(O.mechanismFor('merra2_air_temperature_2m'), null, 'no checked explanation for temperature');
  const ids = O.MECHANISMS.flatMap((m) => m.variables);
  assert.equal(new Set(ids).size, ids.length, 'a variable belongs to one row');
  for (const m of O.MECHANISMS) for (const s of [m.source, m.caveatSource].filter(Boolean)) assert.match(s.url, /^https:\/\/doi\.org\/10\.\d{4,}\/\S+$/, m.id);
  assert.ok(O.OPPOSITE_EXAMPLES.length >= 2 && O.OPPOSITE_EXAMPLES.length <= 3);
  for (const e of O.OPPOSITE_EXAMPLES) {
    assert.ok(O.mechanismFor(e.variable_id), `${e.id} matches a mechanism row`);
    assert.match(e.start, /^\d{4}-(0[1-9]|1[0-2])$/); assert.match(e.end, /^\d{4}-(0[1-9]|1[0-2])$/);
    assert.ok(Number(e.end.slice(0, 4)) - Number(e.start.slice(0, 4)) + 1 >= 10, `${e.id}: at least 10 years`);
    for (const [w, s, ea, n] of [e.up.bbox, e.down.bbox]) assert.ok(-180 <= w && w < ea && ea <= 180 && -90 <= s && s < n && n <= 90, e.id);
  }
  const [w, s, e, n] = O.SCAN.extent;
  assert.ok(Math.ceil((e - w) / O.SCAN.tile_deg) * Math.ceil((n - s) / O.SCAN.tile_deg) <= 600, 'backend MAX_TILES');
});

test('copy: plain sentences of at most 25 words, no long dash, no acronyms except NASA and AI', () => {
  const texts = [...O.MECHANISMS.flatMap((m) => [m.text, m.caveat].filter(Boolean)), ...O.OPPOSITE_EXAMPLES.flatMap((e) => [e.question, e.up.name, e.down.name]),
    ...Object.values(O.PAIR_STATUS).map((x) => x.label)];
  for (const t of texts) {
    assert.ok(!t.includes('—') && !t.includes('–'), t);
    for (const s of t.split(/(?<=[.?!])\s+/)) assert.ok(s.split(/\s+/).length <= 25, `${s.split(/\s+/).length} words: ${s}`);
    assert.deepEqual((t.match(/\b[A-Z]{2,}\b/g) ?? []).filter((x) => x !== 'NASA' && x !== 'AI'), [], t);
  }
});

test('views render on the server without touching window: finder, example pair, mechanism card', () => {
  const finder = renderToStaticMarkup(createElement(V.OppositeFinder, { request: null }));
  assert.match(finder, /Same cause, opposite trends/);
  assert.match(finder, /Period: 2001 to 2024, whole years of the record/);
  for (const e of O.OPPOSITE_EXAMPLES) assert.ok(finder.includes(e.question.replace(/'/g, '&#x27;')), e.id);
  const fromExplore = renderToStaticMarkup(createElement(V.OppositeFinder, { request: { variableId: 'imerg_precip', start: '2003-01', end: '2020-12' } }));
  assert.match(fromExplore, /Period: 2003 to 2020, from Explore/);
  const pair = renderToStaticMarkup(createElement(V.ExamplePair, { example: O.OPPOSITE_EXAMPLES.find((e) => e.variable_id === 'imerg_precip') }));
  assert.match(pair, /Testing both places/);
  assert.match(pair, /One known explanation:/);
  assert.match(pair, /Held and Soden, 2006/);
  assert.match(pair, /This tool does not test the cause/);
  assert.match(pair, /lead, not a finding/);
  const none = renderToStaticMarkup(createElement(V.MechanismCard, { variableId: 'merra2_air_temperature_2m', name: 'Air temperature' }));
  assert.match(none, /no checked explanation for air temperature yet/);
});
