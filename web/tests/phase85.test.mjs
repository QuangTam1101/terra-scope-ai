// Phase 8.5: loading messages (8.5A), report building (8.5B), hunt candidates (8.5C), exploration helpers and
// saved cases (8.5D). Offline: no browser, network or Gemini.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const qaCache = await mkdtemp(join(resolve(tmpdir()), 'terrascope-phase85-'));
const server = await createServer({ cacheDir: qaCache, server: { middlewareMode: true, watch: null }, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] } });

try {
  const pr = await server.ssrLoadModule('/src/progress.ts');

  test('8.5A grid messages describe the real operation and never invent progress', () => {
    const ctx = { dataset: 'Air temperature, MERRA-2', start: '2001', end: '2024', cells: pr.globalCells(0.5) };
    const compute = pr.gridMessage('grid-compute', ctx);
    assert.match(compute.title, /Computing trend statistics across the global grid/);
    assert.match(compute.detail, /2001 to 2024/);
    assert.match(compute.detail, /259,200 grid cells/);
    const cache = pr.gridMessage('grid-cache', ctx);
    assert.match(cache.title, /Loading previously computed analysis/);
    const values = pr.gridMessage('values-load', { ...ctx, month: 'July' });
    assert.match(values.detail, /July only/);
    for (const m of [compute, cache, values, pr.gridMessage('grid-network', ctx)]) {
      const text = m.title + m.detail;
      assert.ok(!/%/.test(text), 'no percentages');
      assert.ok(!/every place on Earth/.test(text));
      assert.ok(!/2025/.test(text), 'period comes from the selection, not a hard-coded year');
      assert.ok(!text.includes('—'));
    }
  });

  test('8.5A regional steps name the place, dataset and both real requests', () => {
    const p = pr.regionalSteps({ place: 'Mekong Delta, Vietnam', parameter: 'Precipitation', dataset: 'GPM IMERG',
      start: '2001-01', end: '2024-12', series: 'done', trend: 'pending' });
    assert.equal(p.title, 'Analyzing precipitation in Mekong Delta, Vietnam…');
    assert.deepEqual(p.steps.map((s) => s.state), ['done', 'pending']);
    assert.match(p.steps[0].label, /monthly time series \(GPM IMERG, 2001-01 to 2024-12\)/);
    assert.match(p.steps[1].label, /statistical significance/);
    assert.equal(pr.globalCells(1), 64800);
    assert.equal(pr.globalCells(null), null);
  });

  const rm = await server.ssrLoadModule('/src/report/model.ts');
  const src = { product: 'GPM_3IMERGM', version: '07', provider: 'NASA GES DISC', url: 'https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary' };
  const variable = { id: 'imerg_precip', parameter: 'precipitation', parameter_name: 'Precipitation', dataset_name: 'GPM IMERG', name: 'Precipitation',
    category: 'water', description_simple: '', description_technical: '', units: 'mm/month', display_units: 'mm/month', spatial_resolution_deg: 0.5,
    native_resolution_deg: 0.1, coverage: { start: '2001-01', end: '2025-12' }, extent: null, available: true, source: src };
  const pts = Array.from({ length: 24 }, (_, i) => ({ t: `${2001 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, value: 100 + i, anomaly: i - 12, valid_fraction: 1 }));
  const series = { variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta', name: 'Mekong Delta', bbox: [104.4, 8.5, 106.9, 11.1] }, units: 'mm/month', points: pts, climatology: [], quality: { n_months: 24, missing_months: 0, coverage_fraction: 1, sufficient: true }, source: src, warnings: [] };
  const trend = (o = {}) => ({ trend_id: 'tr_ref', variable_id: 'imerg_precip', region: series.region, start: '2001-01', end: '2024-12', units: 'mm/month',
    slope_per_decade: 3.163604736328125, slope_ci: [-1.09, 18.33], ci_method: 'ols_anomaly', p_value: 0.11031644898805326, p_value_autocorr_adjusted: 0.29,
    significant: false, direction: 'no_trend', n: 288, trend_line: [], quality: { n_months: 288, missing_months: 0, coverage_fraction: 1, sufficient: true },
    plain_summary: '', source: src, warnings: [], method: 'seasonal_mk', slope_method: 'sen_seasonal', alpha: 0.05, ...o });
  const run = (o) => ({ key: 'k1', trend: trend(o), series, variable, place: { label: 'Mekong Delta, Vietnam', bbox: [104.4, 8.5, 106.9, 11.1], ref: { type: 'preset', id: 'mekong_delta' } } });

  test('8.5B report keeps backend numbers exactly and never calls a positive slope significant by itself', () => {
    const m = rm.buildReport([run()], [], new Date('2026-11-14T00:00:00Z'), '0.2.0');
    const a = m.analyses[0];
    assert.equal(a.slope, 3.163604736328125);
    assert.equal(a.pRaw, 0.11031644898805326);
    assert.equal(a.verdict, 'Not proven yet');
    assert.match(a.finding, /not statistically significant/);
    assert.ok(!/is statistically significant/.test(a.finding));
    assert.equal(m.id, rm.buildReport([run()], [], new Date(), '0.2.0').id, 'report id depends only on the evidence');
    const sig = rm.buildReport([run({ significant: true, p_value: 0.01 })], [], new Date(), '0.2.0').analyses[0];
    assert.match(sig.finding, /is statistically significant under this test/);
  });

  test('8.5B markdown and JSON exports carry context, method and no secrets or long dashes', () => {
    const m = rm.buildReport([run()], [], new Date('2026-11-14T00:00:00Z'), '0.2.0');
    const md = rm.toMarkdown(m);
    for (const s of ['Report ID', 'preset "mekong_delta"', 'W 104.4, S 8.5, E 106.9, N 11.1', '2001-01 to 2024-12', 'GPM_3IMERGM v07', '0.5° processed grid (native 0.1°)',
      'Raw Seasonal MK p (decision basis)', 'not a Sen interval', 'seasonal_mk + sen_seasonal', 'backend 0.2.0']) assert.ok(md.includes(s), s);
    assert.ok(!md.includes('—'));
    const js = rm.toReproJson(m);
    assert.equal(js.schema, 'terra-scope-report/1');
    assert.deepEqual(js.analyses[0].request, { endpoint: 'POST /api/v1/trends', variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta' }, start: '2001-01', end: '2024-12', method: 'seasonal_mk', alpha: 0.05 });
    assert.equal(js.analyses[0].result.slope_per_decade, 3.163604736328125);
    assert.ok(!/key|token|password|secret/i.test(JSON.stringify(js)));
  });

  test('8.5B comparison wording follows the backend rule (p < alpha AND interval excludes zero)', () => {
    const t = (o) => trend(o);
    const cmp = (diff) => ({ key: 'c1', kind: 'regions', title: 'A vs B', units: '°C', variableName: 'Air temperature',
      a: { label: 'Sahel', dataset: 'MERRA-2', trend: t({ slope_per_decade: -0.21, significant: true, p_value: 0.0001 }), series },
      b: { label: 'Wisconsin', dataset: 'MERRA-2', trend: t({ slope_per_decade: 0.21, significant: false, p_value: 0.155 }), series },
      test: { compare_id: 'cp1', a: null, b: null, verdict: 'opposite_not_significant', is_contradiction: false, plain_summary: '', warnings: [],
        difference: { slope_diff_per_decade: -0.42, test: 'mk_sen_on_anomaly_difference_block_bootstrap_ci', stable_halves: false, ...diff } } });
    const inconclusive = rm.buildReport([], [cmp({ p_value: 0.022, ci: [-0.87, 0.12], significant: false })], new Date(), '0.2.0').comparisons[0];
    assert.match(inconclusive.strength, /includes zero/);
    assert.ok(!/is not statistically significant \(p = 0.022\)/.test(inconclusive.strength));
    assert.ok(inconclusive.disagrees.some((x) => /opposite directions/.test(x)));
    assert.ok(inconclusive.cannotConclude.some((x) => /does not by itself show/.test(x)));
    const proven = rm.buildReport([], [cmp({ p_value: 0.004, ci: [-0.9, -0.1], significant: true })], new Date(), '0.2.0').comparisons[0];
    assert.match(proven.strength, /is statistically significant: p = 0.004/);
    const ds = rm.buildReport([], [{ ...cmp({ p_value: null, ci: null, significant: false }), kind: 'datasets', test: null }], new Date(), '0.2.0').comparisons[0];
    assert.match(ds.strength, /Descriptive comparison only/);
  });

  const ex = await server.ssrLoadModule('/src/explore.ts');
  test('8.5C/D compatible pairs, descriptive helpers and window cap', () => {
    const vs = [{ id: 'gldas_air_temperature', available: true }, { id: 'merra2_air_temperature_2m', available: true }, { id: 'imerg_precip', available: true }];
    assert.equal(ex.compatiblePartner('gldas_air_temperature', vs).id, 'merra2_air_temperature_2m');
    assert.equal(ex.compatiblePartner('imerg_precip', vs), null, 'precipitation has no compatible second product here');
    assert.equal(ex.compatiblePartner('gldas_evapotranspiration', vs), null, 'MODIS ET counts only when available');
    assert.equal(ex.correlation([1, 2, 3, null], [2, 4, 6, 8]).r.toFixed(6), '1.000000');
    assert.equal(ex.correlation([1, null], [1, 2]), null);
    assert.equal(ex.senPerDecade([2001, 2002, 2003, 2004], [1, 2, 3, 4]), 10);
    const pts = [];
    for (let y = 2001; y <= 2003; y++) for (let m = 1; m <= 12; m++) pts.push({ t: `${y}-${String(m).padStart(2, '0')}`, value: y * 100 + m, anomaly: 0, valid_fraction: 1 });
    const djf = ex.seasonalYears(pts, [12, 1, 2]);
    assert.deepEqual(djf.map((r) => r.year), [2002, 2003], 'Dec counts toward the next year; incomplete winters are dropped');
    assert.equal(djf[0].value, (200112 + 200201 + 200202) / 3);
    assert.ok(ex.MAX_WINDOWS <= 10);
    for (const e of ex.EXTENTS) assert.ok(e.bbox[0] < e.bbox[2] && e.bbox[1] < e.bbox[3], e.id);
  });

  const cs = await server.ssrLoadModule('/src/cases.ts');
  const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  const sample = { schema: 'terra-scope-case/1', id: 'case-1', title: 'Mekong', created_at: '2026-11-14T00:00:00Z', backend_version: '0.2.0', items: [
    { kind: 'trend', variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta' }, place_label: 'Mekong Delta', bbox: [104.4, 8.5, 106.9, 11.1], start: '2001-01', end: '2024-12', method: 'seasonal_mk', alpha: 0.05,
      saved_result: { trend_id: 'tr_x', slope_per_decade: 3.1636, p_value: 0.11, significant: false, units: 'mm/month', product: 'GPM_3IMERGM', version: '07' } },
    { kind: 'compare', variable_id: 'merra2_air_temperature_2m', region_a: { type: 'bbox', bbox: [-17, 10, 30, 18] }, region_b: { type: 'bbox', bbox: [-92.9, 42.5, -86.8, 47.1] }, label_a: 'Sahel', label_b: 'Wisconsin', start: '2001-01', end: '2025-12', method: 'seasonal_mk', alpha: 0.05 },
  ] };
  test('8.5D4 cases: validate, round-trip through links and local storage, reject bad input', () => {
    assert.equal(cs.parseCase(sample).items.length, 2);
    const link = cs.encodeCaseParam(sample);
    assert.match(link, /^[A-Za-z0-9_-]+$/);
    const back = cs.caseFromHash(`#report?case=${link}`);
    assert.deepEqual(back.items[0].region, { type: 'preset', id: 'mekong_delta' });
    assert.equal(back.items[0].saved_result, undefined, 'links carry parameters only');
    for (const bad of [null, {}, { ...sample, schema: 'x' }, { ...sample, items: [{ ...sample.items[0], start: '2024-12', end: '2001-01' }] },
      { ...sample, items: [{ ...sample.items[0], region: { type: 'bbox', bbox: [10, 0, 5, 1] } }] },
      { ...sample, items: [{ ...sample.items[0], variable_id: '../etc' }] }]) assert.equal(cs.parseCase(bad), null);
    assert.equal(cs.decodeCaseParam('not*base64'), null);
    const st = memStore();
    assert.equal(cs.saveCase(sample, st), true);
    assert.equal(cs.listCases(st)[0].title, 'Mekong');
    cs.deleteCase('case-1', st);
    assert.deepEqual(cs.listCases(st), []);
    assert.ok(!/key|token|password|secret/i.test(JSON.stringify(cs.parseCase(sample))));
  });
} finally {
  await server.close();
}
