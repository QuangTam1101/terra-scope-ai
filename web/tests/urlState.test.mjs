// Shareable Explore links (F4): parse, build, round trip. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = await mkdtemp(join(tmpdir(), 'terrascope-url-'));
execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
  '--ignoreConfig', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck', '--noCheck',
  '--outDir', out, fileURLToPath(new URL('../src/urlState.ts', import.meta.url))]);
const { parseExplore, exploreHash, shareUrl, linkPlace } = await import(pathToFileURL(join(out, 'urlState.js')).href);
await rm(out, { recursive: true, force: true });

const SPEC = '#explore?v=imerg_precip&place=region:mekong_delta&from=2001-01&to=2025-12&view=trend';

test('the documented link parses and round-trips unchanged', () => {
  const s = parseExplore(SPEC);
  assert.deepEqual(s, { variableId: 'imerg_precip', place: { kind: 'region', id: 'mekong_delta' }, start: '2001-01', end: '2025-12', view: 'trend' });
  assert.equal(exploreHash(s), SPEC);
  for (const st of [{}, { place: { kind: 'cell', lat: 10.25, lon: 105.75 } }, { place: { kind: 'box', bbox: [100, 8, 110.5, 22] }, view: 'trend' }])
    assert.deepEqual(parseExplore(exploreHash(st)), st);
  assert.deepEqual(parseExplore('#explore?place=region%3Amekong_delta'), { place: { kind: 'region', id: 'mekong_delta' } });   // encoded ":" too
});

test('other pages are untouched and a bare #explore is empty', () => {
  for (const h of ['#report?case=abc', '#hunt', '#guide', '#explorer', '', '#', '#home?v=imerg_precip']) assert.equal(parseExplore(h), null, h);
  assert.deepEqual(parseExplore('#explore'), {});
  assert.deepEqual(parseExplore('#explore?'), {});
  assert.deepEqual(parseExplore('#/explore?v=x1'), { variableId: 'x1' });
  assert.equal(exploreHash({}), '#explore');
  assert.ok(exploreHash({ variableId: 'imerg_precip' }).startsWith('#explore'));
});

test('unknown or invalid values are dropped, never thrown', () => {
  const bad = ['v=Bad%20Id', 'v=<script>', 'place=region:', 'place=region:a b', 'place=planet:mars', 'place=cell:95,0', 'place=cell:1',
    'place=cell:abc,2', 'place=cell:1e2,3', 'place=box:10,5,5,10', 'place=box:-200,0,10,10', 'place=box:1,2,3', 'from=2001-13',
    'from=2000-12', 'to=2027-01', 'to=2025-1', 'view=map', 'compare=yes', 'zzz=1', '%E0%A4%A'];
  for (const q of bad) assert.deepEqual(parseExplore(`#explore?${q}`), {}, q);
  assert.deepEqual(parseExplore('#explore?v=imerg_precip&view=nope&from=2030-01'), { variableId: 'imerg_precip' });
  assert.deepEqual(parseExplore('#explore?from=2020-01&to=2010-12'), {}, 'reversed period drops both');
  assert.equal(exploreHash({ variableId: 'NOT OK', view: 'map', start: '1999-01' }), '#explore');
});

test('squares drawn on the sea-ice polar maps round-trip as exact pixels; anything off the grid is dropped', () => {
  const st = { variableId: 'nsidc_sea_ice', place: { kind: 'polar', hemi: 'N', rows: [200, 240], cols: [140, 170] } };
  assert.equal(exploreHash(st), '#explore?v=nsidc_sea_ice&place=polar:N,200,240,140,170');
  assert.deepEqual(parseExplore(exploreHash(st)), st);
  assert.deepEqual(parseExplore('#explore?place=polar:S,0,331,0,315').place, { kind: 'polar', hemi: 'S', rows: [0, 331], cols: [0, 315] });
  for (const q of ['polar:N,0,448,0,10', 'polar:S,0,10,0,316', 'polar:N,10,5,0,1', 'polar:X,0,1,0,1', 'polar:N,0,1,0', 'polar:N,0.5,1,0,1', 'polar:N,-1,1,0,1'])
    assert.equal(parseExplore(`#explore?place=${q}`).place, undefined, q);
  assert.deepEqual(linkPlace({ type: 'polar', hemi: 'S', rows: [3, 4], cols: [5, 6] }), { kind: 'polar', hemi: 'S', rows: [3, 4], cols: [5, 6] });
});

test('cells snap to the centre of their 0.5° grid cell, boxes to 0.5° grid lines', () => {
  assert.deepEqual(parseExplore('#explore?place=cell:10.1,105.9').place, { kind: 'cell', lat: 10.25, lon: 105.75 });
  assert.deepEqual(parseExplore('#explore?place=cell:-0.1,-179.99').place, { kind: 'cell', lat: -0.25, lon: -179.75 });
  assert.deepEqual(parseExplore('#explore?place=cell:90,180').place, { kind: 'cell', lat: 89.75, lon: 179.75 });
  assert.deepEqual(parseExplore('#explore?place=box:100.2,8.3,110.7,21.9').place, { kind: 'box', bbox: [100, 8.5, 110.5, 22] });
  assert.deepEqual(parseExplore('#explore?place=box:1.1,2,1.2,3').place, undefined, 'collapses to zero width');
  assert.equal(exploreHash({ place: { kind: 'cell', lat: 10.1, lon: 105.9 } }), '#explore?place=cell:10.25,105.75');
});

test('months stay within 2001-01 to 2026-12', () => {
  assert.deepEqual(parseExplore('#explore?from=2001-01&to=2026-07'), { start: '2001-01', end: '2026-07' });
  assert.deepEqual(parseExplore('#explore?from=2000-12&to=2027-01'), {});
  assert.deepEqual(parseExplore('#explore?from=2010-06'), { start: '2010-06' });
});

test('app places map to link places and back', () => {
  assert.deepEqual(linkPlace({ type: 'preset', id: 'global' }), { kind: 'region', id: 'global' });
  assert.deepEqual(linkPlace({ type: 'bbox', bbox: [105.5, 10, 106, 10.5] }), { kind: 'cell', lat: 10.25, lon: 105.75 });
  assert.deepEqual(linkPlace({ type: 'bbox', bbox: [100, 8, 110, 22] }), { kind: 'box', bbox: [100, 8, 110, 22] });
});

test('countries link by their Natural Earth name and round-trip, odd names included', () => {
  assert.deepEqual(linkPlace({ type: 'country', id: 'Vietnam' }), { kind: 'country', name: 'Vietnam' });
  assert.equal(exploreHash({ place: { kind: 'country', name: 'Vietnam' } }), '#explore?place=country:Vietnam');
  for (const name of ["Côte d'Ivoire", 'Dem. Rep. Congo', 'Bosnia and Herz.', 'Timor-Leste'])
    assert.deepEqual(parseExplore(exploreHash({ place: { kind: 'country', name } })), { place: { kind: 'country', name } });
  for (const bad of ['country:', 'country:<script>', `country:${'a'.repeat(81)}`])
    assert.deepEqual(parseExplore(`#explore?place=${bad}`), {});
});

test('share link keeps the site address and replaces only the hash', () => {
  globalThis.location = new URL('https://example.org/app/?x=1#report?case=abc');
  assert.equal(shareUrl({ variableId: 'imerg_precip' }), 'https://example.org/app/?x=1#explore?v=imerg_precip');
  delete globalThis.location;
});
