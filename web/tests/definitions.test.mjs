// Definitions behind the "i" buttons: coverage of variables, datasets and terms, word budgets, plain Explorer text,
// https links, and the matching glossary entries for Term. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-def-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { DEFINITIONS, definition } = await server.ssrLoadModule('/src/definitions.ts');
  const { GLOSSARY } = await server.ssrLoadModule('/src/glossary.ts');
  const words = (s) => s.trim().split(/\s+/).length;

  const F11 = ['gpcc_precip', 'smap_soil_moisture_surface', 'gldas_root_zone_moisture', 'seawifs_chlorophyll', 'cru_precip',
    'gldas_soil_moisture_10_40cm', 'gldas_soil_moisture_40_100cm', 'gldas_soil_moisture_100_200cm'];
  const DATASETS = ['imerg', 'gldas', 'merra2', 'modis', 'gpcc', 'cru', 'smap', 'seawifs'].map((d) => `dataset:${d}`);
  const TERMS = ['root-zone', 'chlorophyll', 'rain-gauge', 'model-vs-satellite', 'trend', 'rate-per-decade', 'sens-slope', 'mann-kendall',
    'p-value', 'significant', 'not-significant', 'seasonal-cycle', 'anomaly', 'confidence-interval', 'fdr', 'autocorrelation', 'time-series',
    'grid-cell', 'forecast-vs-trend'];

  test('every catalog variable with data, every dataset and every term has an entry', async () => {
    // modis_et is listed in the catalog but has no cube (available: false), so it needs no "i".
    const catalog = await readFile(new URL('../../backend/app/catalog.py', import.meta.url), 'utf8');
    const ids = [...catalog.matchAll(/Variable\("(\w+)"/g)].map((m) => m[1]).filter((id) => id !== 'modis_et');
    assert.ok(ids.includes('imerg_precip') && ids.length >= 5, 'catalog parsed');
    for (const id of [...new Set([...ids, ...F11]), ...DATASETS, ...TERMS]) assert.ok(definition(id), id);
  });

  test('unknown or inherited ids give undefined, never throw', () => {
    for (const id of ['nope', '', 'constructor', '__proto__', 'toString']) assert.equal(definition(id), undefined, id);
  });

  test('word budgets: simple <= 25, science <= 40, why <= 20', () => {
    for (const [id, d] of Object.entries(DEFINITIONS)) {
      assert.ok(d.title && d.simple && d.science && d.why, id);
      assert.ok(words(d.simple) <= 25, `${id} simple ${words(d.simple)}`);
      assert.ok(words(d.science) <= 40, `${id} science ${words(d.science)}`);
      assert.ok(words(d.why) <= 20, `${id} why ${words(d.why)}`);
    }
  });

  test('Explorer text (simple and why) has no statistics jargon and no acronyms except NASA and AI', () => {
    for (const [id, d] of Object.entries(DEFINITIONS)) {
      const ex = `${d.simple} ${d.why}`;
      for (const bad of ['p <', 'MK', 'Sen', 'FDR', 'OLS', 'ENS']) assert.ok(!ex.includes(bad), `${id}: ${bad}`);
      const caps = (ex.match(/\b[A-Z]{2,}\b/g) ?? []).filter((w) => w !== 'NASA' && w !== 'AI');
      assert.deepEqual(caps, [], id);
    }
  });

  test('links are https; no long dash; non-NASA rain data says so', () => {
    for (const [id, d] of Object.entries(DEFINITIONS)) {
      for (const u of [d.source?.url, d.more].filter(Boolean)) assert.match(u, /^https:\/\/[^\s]+$/, id);
      assert.ok(!JSON.stringify(d).includes('—'), id);
    }
    for (const id of ['gpcc_precip', 'cru_precip', 'dataset:gpcc', 'dataset:cru']) {
      const d = definition(id);
      assert.ok(d.simple.startsWith('Not NASA data') && d.science.startsWith('Not NASA data') && d.source.license, id);
    }
    assert.match(definition('dataset:gpcc').source.provider, /Deutscher Wetterdienst/);
    assert.match(definition('dataset:cru').source.provider, /University of East Anglia/);
  });

  test('Term links cover the same terms (glossary ids are snake_case)', () => {
    const alias = { 'sens-slope': 'sen_slope', 'mann-kendall': 'seasonal_mk', significant: 'significance' };
    for (const id of TERMS) {
      const g = GLOSSARY[alias[id] ?? id.replaceAll('-', '_')];
      assert.ok(g && g.plain && g.technical && g.example, id);
      assert.ok(!(g.plain + g.technical + g.example).includes('—'), id);
    }
  });
} finally {
  await server.close();
}
