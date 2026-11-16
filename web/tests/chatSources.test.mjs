import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = await mkdtemp(join(tmpdir(), 'terrascope-sources-'));
execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
  '--ignoreConfig', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--skipLibCheck', '--noCheck',
  '--outDir', out, fileURLToPath(new URL('../src/chat/sources.ts', import.meta.url))]);
const { READING, readingFor } = await import(pathToFileURL(join(out, 'sources.js')).href);
await rm(out, { recursive: true, force: true });

const preset = (variable_id, bbox) => ({ variable_id, region: { bbox } });
const HANOI = [105.3, 20.5, 106.1, 21.4], CHILE = [-73, -38, -70, -30], WORLD = [-180, -90, 180, 90];

test('matches on variable and place', () => {
  assert.deepEqual(readingFor([preset('gldas_air_temperature', HANOI)]).map((r) => r.year), [2022]);
  assert.match(readingFor([preset('gldas_root_zone_moisture', CHILE)])[0].title, /central Chile/);
  assert.match(readingFor([preset('imerg_precip', [-65, -15, -45, -5])])[0].title, /Drying Out/);
});

test('no match: wrong variable, other place, or an area far bigger than the study', () => {
  assert.deepEqual(readingFor([preset('modisa_chlorophyll', HANOI)]), []);
  assert.deepEqual(readingFor([preset('gldas_air_temperature', [104.4, 8.5, 106.9, 11.1])]), []); // Mekong Delta
  assert.deepEqual(readingFor([preset('gldas_air_temperature', WORLD)]), []);
  assert.deepEqual(readingFor([preset('gldas_air_temperature', [104.5, 20.1, 107.25, 22.25])]), []); // Northern Vietnam ⊃ Hanoi
});

test('never more than 3 links and no repeats', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, publisher: 'p', year: 2020, url: `https://x/${i}`, why: 'w',
    variables: ['v'], bbox: [0, 0, 10, 10] }));
  assert.equal(readingFor([preset('v', [1, 1, 2, 2]), preset('v', [3, 3, 4, 4])], many).length, 3);
  assert.equal(readingFor([preset('gldas_air_temperature', HANOI), preset('merra2_air_temperature_2m', HANOI)]).length, 1);
});

test('every curated source is complete and https', () => {
  for (const r of READING) {
    assert.ok(r.url.startsWith('https://') && r.title && r.publisher && r.why && r.variables.length, r.url);
    assert.ok(r.bbox[0] < r.bbox[2] && r.bbox[1] < r.bbox[3], r.url);
    assert.doesNotMatch(r.why, /\b(caused|proves?|because of)\b/i, r.url);
  }
});
