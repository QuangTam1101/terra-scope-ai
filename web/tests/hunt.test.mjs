// Contradiction Hunter 3.0: deterministic comparability, categories, evidence status and wording, investigation storage,
// Hunt tour state. Synthetic results only (clearly test fixtures); no network, no Gemini.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-hunt-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, define: { __GIT_REV__: '"test"' } });
try {
  const L = await server.ssrLoadModule('/src/hunt/logic.ts');
  const I = await server.ssrLoadModule('/src/hunt/investigations.ts');
  const O = await server.ssrLoadModule('/src/onboarding.ts');
  const P = await server.ssrLoadModule('/src/hunt/PlaceField.tsx');
  const MP = await server.ssrLoadModule('/src/hunt/MapPick.tsx');
  const M = await server.ssrLoadModule('/src/report/model.ts');
  const { EditionDoc } = await server.ssrLoadModule('/src/report/EditionDoc.tsx');

  const src = (product) => ({ product, version: '1', provider: 'NASA GES DISC', url: 'https://disc.gsfc.nasa.gov/' });
  const T = ({ slope = 0.2, sig = true, ok = true, start = '2001-01', end = '2025-12', bbox = [104.4, 8.5, 106.9, 11.1], units = '°C', cov = 1, product = 'M2IMNXASM', p = sig ? 0.001 : 0.4 } = {}) => ({
    trend_id: `tr_${slope}_${start}`, variable_id: 'x', region: { type: 'bbox', bbox }, start, end, units, slope_per_decade: ok ? slope : null, p_value: ok ? p : null,
    p_value_autocorr_adjusted: 0.1, significant: ok ? sig : null, slope_ci: null, ci_method: 'ols_anomaly', direction: 'increasing', n: 300, trend_line: [],
    quality: { n_months: ok ? 300 : 60, missing_months: 0, coverage_fraction: cov, sufficient: ok }, plain_summary: '', source: src(product), warnings: [] });
  const V = (id, dataset_name, native = 0.5) => ({ id, parameter: 'air_temperature', parameter_name: 'Air temperature', dataset_name, display_units: '°C', native_resolution_deg: native, spatial_resolution_deg: 0.5, source: src('X') });
  const merra = V('merra2_air_temperature_2m', 'MERRA-2', 0.5), gldas = V('gldas_air_temperature', 'GLDAS', 0.25), rain = { ...V('imerg_precip', 'GPM IMERG', 0.1), parameter_name: 'Precipitation', display_units: 'mm/month' };
  const side = (label, variable, trend) => ({ label, variable, trend });
  const cmp = (p, ci, significant) => ({ compare_id: 'cmp_1', verdict: 'opposite_not_significant', a: T(), b: T(), difference: { slope_diff_per_decade: -0.38, p_value: p, ci, significant }, plain_summary: '', warnings: [] });
  const sahel = [-17, 10, 30, 18], wisc = [-92.9, 42.5, -86.8, 47.1];

  test('categories: opposite signs, magnitude ratio, significance labels, insufficient', () => {
    assert.deepEqual(L.categorize('regions', T({ slope: 0.3 }), T({ slope: -0.2 })), ['opposite_direction']);
    assert.deepEqual(L.categorize('regions', T({ slope: 0.1 }), T({ slope: 0.25 })), ['magnitude_difference']);
    assert.deepEqual(L.categorize('regions', T({ slope: 0.2 }), T({ slope: 0.25 })), []);
    assert.deepEqual(L.categorize('regions', T({ slope: 0.2 }), T({ slope: 0.21, sig: false })), ['different_significance_labels']);
    assert.deepEqual(L.categorize('datasets', T({ slope: -0.21 }), T({ slope: 0.8 })), ['opposite_direction', 'dataset_disagreement']);
    assert.deepEqual(L.categorize('periods', T({ slope: 0.1, sig: false }), T({ slope: 0.4 })), ['magnitude_difference', 'different_significance_labels', 'time_window_sensitivity']);
    assert.deepEqual(L.categorize('regions', T({ ok: false }), T()), ['insufficient_evidence']);
  });

  test('significant versus non-significant alone is never a statistically established difference', () => {
    const a = side('A', merra, T({ slope: 0.3, bbox: sahel })), b = side('B', merra, T({ slope: 0.28, sig: false, bbox: wisc }));
    const { validity } = L.checkComparability('regions', a, b);
    assert.equal(validity, 'comparable');
    assert.equal(L.evidenceStatus('regions', validity, null), 'descriptive_difference');
    assert.equal(L.evidenceStatus('regions', validity, cmp(0.3, [-0.5, 0.2], false)), 'no_supported_difference');
    const txt = L.explainComparison('regions', a, b, null, true);
    assert.ok(txt.cannot.some((x) => /not a test of their difference/.test(x)));
    // Datasets and periods can never become "statistically tested", whatever the per-side p-values are.
    assert.equal(L.evidenceStatus('datasets', 'comparable', cmp(0.0001, [0.1, 0.5], true)), 'descriptive_difference');
    assert.equal(L.evidenceStatus('periods', 'comparable', null), 'descriptive_difference');
  });

  test('regional difference test: both conditions required (p < 0.05 and interval excludes zero)', () => {
    assert.equal(L.evidenceStatus('regions', 'comparable', cmp(0.01, [0.1, 0.6], true)), 'statistically_tested_difference');
    assert.equal(L.evidenceStatus('regions', 'comparable', cmp(0.0219, [-0.865, 0.117], false)), 'inconclusive');   // Sahel vs Wisconsin
    assert.equal(L.evidenceStatus('regions', 'comparable', cmp(null, null, false)), 'inconclusive');
    assert.equal(L.evidenceStatus('regions', 'not_comparable', cmp(0.01, [0.1, 0.6], true)), 'not_comparable');
    assert.equal(L.evidenceStatus('regions', 'more_evidence_needed', cmp(0.01, [0.1, 0.6], true)), 'inconclusive');
  });

  test('comparability: incompatible datasets, invalid units, same region, period mismatch, coverage, overlap', () => {
    const r = L.checkComparability('datasets', side('X', merra, T()), side('X', rain, T({ units: 'mm/month', product: 'GPM_3IMERGM' })));
    assert.equal(r.validity, 'not_comparable');
    assert.ok(r.checks.some((c) => c.id === 'quantity' && c.status === 'fail') && r.checks.some((c) => c.id === 'units' && c.status === 'fail'));
    const d = L.checkComparability('datasets', side('Sahel', merra, T({ bbox: sahel })), side('Sahel', gldas, T({ bbox: sahel, cov: 0.6, product: 'GLDAS_NOAH025_M' })));
    assert.equal(d.validity, 'comparable_with_limitations');
    for (const id of ['coverage', 'provenance', 'resolution']) assert.ok(d.checks.some((c) => c.id === id && c.status === 'limit'), id);
    assert.equal(L.checkComparability('regions', side('A', merra, T()), side('B', merra, T())).validity, 'not_comparable');            // same box
    assert.equal(L.checkComparability('regions', side('A', merra, T({ bbox: sahel })), side('B', merra, T({ bbox: wisc, end: '2024-12' }))).validity, 'not_comparable');
    assert.equal(L.checkComparability('regions', side('A', merra, T({ bbox: sahel, ok: false })), side('B', merra, T({ bbox: wisc }))).validity, 'more_evidence_needed');
    const p = L.checkComparability('periods', side('A', merra, T({ start: '2001-01', end: '2015-12' })), side('B', merra, T({ start: '2010-01', end: '2025-12' })));
    assert.equal(p.validity, 'comparable_with_limitations');
    assert.ok(p.checks.some((c) => c.id === 'time' && /overlap by 72 months/.test(c.text)));
    const q = L.checkComparability('periods', side('A', merra, T({ start: '2001-01', end: '2012-12' })), side('B', merra, T({ start: '2013-01', end: '2025-12' })));
    assert.ok(q.checks.some((c) => c.id === 'time' && c.status === 'ok') && q.checks.some((c) => c.id === 'length' && c.status === 'limit'));
    assert.equal(L.checkComparability('periods', side('A', merra, T()), side('B', merra, T())).validity, 'not_comparable');
    assert.equal(L.overlapMonths({ start: '2001-01', end: '2012-12' }, { start: '2013-01', end: '2025-12' }), 0);
  });

  test('wording never overstates the evidence', () => {
    const opp = ['opposite_direction'];
    assert.match(L.conclusion('descriptive_difference', opp, true), /does not prove that the underlying trends are statistically different/);
    assert.match(L.conclusion('no_supported_difference', opp, false), /does not show/);
    for (const s of ['descriptive_difference', 'no_supported_difference', 'inconclusive', 'not_comparable'])
      for (const sci of [true, false]) assert.ok(!/confirm(ed|s) that|statistically significant\./i.test(L.conclusion(s, opp, sci)), `${s} ${sci}`);
    const all = ['regions', 'datasets', 'periods'].flatMap((m) => [true, false].map((sci) => JSON.stringify(L.explainComparison(m, side('A', merra, T({ bbox: sahel })), side('B', merra, T({ bbox: wisc, slope: -0.2 })), null, sci))));
    assert.ok(!/—|confidence of \d|% (sure|certain|likely)|caused by/.test(all.join(' ')));
    const dsx = L.explainComparison('datasets', side('S', merra, T()), side('S', gldas, T({ slope: -0.1 })), null, true);
    assert.ok(dsx.how.some((x) => /No formal test/.test(x)) && dsx.cannot.some((x) => /Neither product is ground truth/.test(x)));
  });

  test('Detective handoff sends identifiers only, never results', () => {
    const r = L.detectiveRequest('regions', side('Sahel', merra, T({ bbox: sahel })), side('Wisconsin', merra, T({ bbox: wisc })), false);
    assert.deepEqual(Object.keys(r.context).sort(), ['end', 'intent', 'region', 'region_b', 'start', 'variable_id']);
    assert.equal(r.context.intent, 'compare');
    const d = L.detectiveRequest('datasets', side('Sahel', merra, T({ bbox: sahel })), side('Sahel', gldas, T({ bbox: sahel })), true);
    assert.equal(d.context.intent, 'trend'); assert.ok(!('trend_id' in d.context));
  });

  test('investigations: validated, sanitised, local-only, storage failures handled', () => {
    const mem = new Map(); const s = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const inv = { schema: I.INVESTIGATION_SCHEMA, id: 'inv-1', title: '<b>Sahel</b> vs Wisconsin', notes: 'hello world', created_at: '2026-11-15T00:00:00Z', backend_version: '0.2.0',
      mode: 'regions', a: { variable_id: 'merra2_air_temperature_2m', region: { type: 'bbox', bbox: sahel }, label: 'Sahel', start: '2001-01', end: '2025-12' },
      b: { variable_id: 'merra2_air_temperature_2m', region: { type: 'bbox', bbox: wisc }, label: 'Wisconsin', start: '2001-01', end: '2025-12' },
      evidence: { a: { trend_id: 't1', slope_per_decade: -0.21 }, b: { trend_id: 't2', slope_per_decade: 0.21 }, compare: { compare_id: 'c', verdict: 'opposite_not_significant', slope_diff_per_decade: -0.38, p_value: 0.0219, ci: [-0.865, 0.117] } },
      categories: ['opposite_direction'], status: 'inconclusive', validity: 'comparable', limitations: ['x'], flagged_reason: null, method: 'm', evil: '<script>' };
    assert.equal(I.saveInvestigation(inv, s), true);
    const back = I.listInvestigations(s)[0];
    assert.equal(back.title, '<b>Sahel</b> vs Wisconsin');   // kept as text; React escapes it when rendered
    assert.ok(!('evil' in back));
    assert.deepEqual(back.evidence.compare.ci, [-0.865, 0.117]);
    assert.equal(I.parseInvestigation({ ...inv, a: { ...inv.a, region: { type: 'bbox', bbox: [10, 0, 5, 1] } } }), null);
    assert.equal(I.parseInvestigation({ ...inv, mode: 'forecast' }), null);
    assert.equal(I.saveInvestigation(inv, null), false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    assert.deepEqual(I.listInvestigations(broken), []); assert.equal(I.saveInvestigation(inv, broken), false);
    I.deleteInvestigation('inv-1', s); assert.equal(I.listInvestigations(s).length, 0);
  });

  test('Hunt tour: versioned per audience, real targets, no auto-start during the main tour or a run', () => {
    assert.equal(O.HUNT_TOUR_KEYS.explorer, 'terra-scope:hunt-tour:explorer:v1');
    assert.equal(O.HUNT_TOUR_KEYS.scientist, 'terra-scope:hunt-tour:scientist:v1');
    const mem = new Map(); const s = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    assert.equal(O.shouldAutoStartHunt(true, false, false, false, s, 'explorer'), true);
    assert.equal(O.shouldAutoStartHunt(true, true, false, false, s, 'explorer'), false);    // main tour open
    assert.equal(O.shouldAutoStartHunt(true, false, true, false, s, 'explorer'), false);    // analysis running
    assert.equal(O.shouldAutoStartHunt(false, false, false, false, s, 'explorer'), false);  // not on Hunt
    assert.equal(O.shouldAutoStartHunt(true, false, false, true, s, 'explorer'), false);    // already shown this session
    O.markHuntTourDone(s, 'explorer');
    assert.equal(O.isHuntTourDone(s, 'explorer'), true); assert.equal(O.isHuntTourDone(s, 'scientist'), false);
    assert.equal(O.isOnboardingDone(s, 'explorer'), false, 'the main tour state is separate');
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    assert.equal(O.isHuntTourDone(broken), false); assert.equal(O.markHuntTourDone(broken), false);
    for (const a of ['explorer', 'scientist']) {
      const st = O.huntSteps(a);
      assert.ok(st.length >= 8 && st.every((x) => x.page === 'hunt'));
      assert.equal(st[0].target, null); assert.equal(st.at(-1).target, null);
      for (const x of st.filter((x) => x.target)) assert.match(x.target, /^\[data-tour="hunt-[a-z]+"\]$/);
      assert.ok(st.filter((x) => ['visual', 'evidence', 'detective', 'save'].includes(x.id)).every((x) => x.fallback), 'result steps explain themselves before a run');
      assert.ok(!JSON.stringify(st).includes('—'));
    }
  });
  test('report: a time-period comparison is printed as descriptive in both editions', () => {
    const ser = { points: Array.from({ length: 24 }, (_, i) => ({ t: `${2001 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, value: 1, anomaly: (i % 5) - 2, valid_fraction: 1 })) };
    const cmpP = { key: 'periods-1', kind: 'periods', title: 'Air temperature: Mekong Delta, 2001 to 2012 vs Mekong Delta, 2013 to 2025',
      a: { label: 'Mekong Delta, 2001 to 2012', dataset: 'MERRA-2', trend: T({ slope: 0.04, sig: false, end: '2012-12' }), series: ser },
      b: { label: 'Mekong Delta, 2013 to 2025', dataset: 'MERRA-2', trend: T({ slope: -0.01, sig: false, start: '2013-01' }), series: ser },
      units: '°C', variableName: 'Air temperature', test: null };
    const m = M.buildReport([], [cmpP], new Date('2026-11-15T00:00:00Z'), '0.2.0');
    assert.match(m.comparisons[0].strength, /no statistical test of a change of trend between two periods/);
    for (const edition of ['simple', 'scientist']) {
      const html = renderToStaticMarkup(createElement(EditionDoc, { m, edition, title: 'Periods', author: '', headlines: {}, notes: {} }));
      assert.ok(/two periods|change of trend between two periods/.test(html), edition);
      assert.ok(!/two NASA products|between two datasets/.test(html), edition);
    }
  });
  test('own coordinates: typed boxes and points follow the app rules', () => {
    assert.deepEqual(P.parseBox('-17, 10, 30, 18'), [-17, 10, 30, 18]);
    assert.equal(P.parseBox('170, -20, -170, -10'), null, 'a box crossing the 180° line is not a valid box');
    assert.equal(P.parseBox('10, 20, 30'), null);
    assert.equal(MP.boxProblem([-17, 10, 30, 18], 0.5), null);
    assert.match(MP.boxProblem([170, -20, -170, -10], 0.5), /cannot cross the 180° line/);
    assert.match(MP.boxProblem([100, 10, 100.2, 11], 0.5), /at least one grid cell \(0.5°\)/);
    assert.match(MP.boxProblem([10, 20, 30, 10], 0.5), /South must be smaller/);
    assert.match(MP.boxProblem([-190, 0, 10, 10], 0.5), /between −180 and 180/);
    assert.equal(MP.describeBox([-17, 10, 30, 18]), '10°N to 18°N, 17°W to 30°E');
    assert.ok(!/\u2014/.test(MP.describeBox([-17, 10, 30, 18]) + P.boxLabel([-17, 10, 30, 18])));
  });
} finally {
  await server.close();
}
