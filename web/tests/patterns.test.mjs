// "See the pattern" helpers (Patterns.tsx): calendar-year means, ranks and their wording, diverging colours, pitch.
// Offline, fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-pat-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { yearMeans, rankOf, rankPhrase, ordinal, divergingColor, pitchOf, UP, DOWN, NEUTRAL } = await server.ssrLoadModule('/src/explore.ts');
  const pts = (rows) => rows.map(([t, value, anomaly]) => ({ t, value, anomaly, valid_fraction: value === null ? 0 : 1 }));

  // Trimmed from real POST /series responses (localhost:8000/api/v1, 2026-11-15) as [t, value, anomaly].
  // IMERG, bbox [-75,-15,-50,5], 2001-01 to 2025-12 (Final V07 ends 2025-09, so the last 3 months are null); 2022-2025 kept.
  const imerg = pts([["2022-01", 214.608702, -30.340677], ["2022-02", 243.739709, -1.566305], ["2022-03", 285.129227, 16.755281], ["2022-04", 228.835897, -15.908217], ["2022-05", 203.946291, -10.891651], ["2022-06", 162.660896, 10.221743], ["2022-07", 137.128168, 13.142542], ["2022-08", 105.624508, 5.628113], ["2022-09", 95.283064, -13.365428], ["2022-10", 152.165993, 0.352735], ["2022-11", 167.023614, -11.954975], ["2022-12", 206.036055, -22.553808],
    ["2023-01", 234.968637, -9.980742], ["2023-02", 212.371419, -32.934595], ["2023-03", 227.482894, -40.891052], ["2023-04", 207.676569, -37.067545], ["2023-05", 197.979678, -16.858264], ["2023-06", 134.879093, -17.560059], ["2023-07", 109.732676, -14.25295], ["2023-08", 78.295804, -21.700591], ["2023-09", 94.132246, -14.516246], ["2023-10", 103.295681, -48.517578], ["2023-11", 131.933859, -47.04473], ["2023-12", 182.900665, -45.689198],
    ["2024-01", 193.523529, -51.42585], ["2024-02", 188.456946, -56.849068], ["2024-03", 199.232043, -69.141903], ["2024-04", 208.062444, -36.68167], ["2024-05", 213.467494, -1.370448], ["2024-06", 132.589302, -19.84985], ["2024-07", 100.430702, -23.554924], ["2024-08", 80.948361, -19.048034], ["2024-09", 80.823372, -27.825121], ["2024-10", 123.34558, -28.467678], ["2024-11", 177.823196, -1.155393], ["2024-12", 205.79093, -22.798933],
    ["2025-01", 217.967275, -26.982104], ["2025-02", 240.955757, -4.350258], ["2025-03", 244.074303, -24.299643], ["2025-04", 231.606621, -13.137493], ["2025-05", 211.205127, -3.632814], ["2025-06", 155.001743, 2.562591], ["2025-07", 116.499481, -7.486145], ["2025-08", 109.286576, 9.290181], ["2025-09", 116.316722, 7.66823], ["2025-10", null, null], ["2025-11", null, null], ["2025-12", null, null]]);
  // SeaWiFS chlorophyll, same bbox, 2001-01 to 2010-12: 2008 has gaps, 2010 is complete.
  const seawifs = pts([["2008-01", null, null], ["2008-02", null, null], ["2008-03", null, null], ["2008-04", null, null], ["2008-05", 5.770083, -0.874688], ["2008-06", 6.388344, -1.04101], ["2008-07", null, null], ["2008-08", 3.187638, -3.810118], ["2008-09", 5.982366, -0.316299], ["2008-10", 6.935257, 0.601892], ["2008-11", 10.192446, 3.882943], ["2008-12", 7.520731, 2.445605],
    ["2010-01", 3.209532, -0.279679], ["2010-02", 10.399301, 5.530223], ["2010-03", 3.616077, -1.034345], ["2010-04", 7.824669, 0.944558], ["2010-05", 6.422464, -0.222307], ["2010-06", 8.840834, 1.41148], ["2010-07", 8.044842, 1.033678], ["2010-08", 8.140939, 1.143183], ["2010-09", 5.632685, -0.66598], ["2010-10", 6.773965, 0.440601], ["2010-11", 5.548789, -0.760714], ["2010-12", 6.440117, 1.364991]]);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

  test('yearMeans: calendar years with all 12 months only; December stays in its own year', () => {
    const a = yearMeans(imerg, 'anomaly'), v = yearMeans(imerg, 'value');
    assert.deepEqual(a.map((r) => r.year), [2022, 2023, 2024], '2025 is missing Oct to Dec');
    // Expected means computed separately in Python from the same response.
    near(a[0].value, -5.0400539166666665); near(a[1].value, -28.917795833333333); near(a[2].value, -29.847406000000003);
    near(v[0].value, 183.515177); near(v[1].value, 159.63743508333334); near(v[2].value, 158.70782491666668);
    assert.deepEqual(yearMeans(seawifs, 'value').map((r) => r.year), [2010], 'a year with any null month is left out');
    assert.deepEqual(yearMeans([], 'value'), []);
  });

  test('rankOf counts from the nearer end; ties share the better rank; incomplete year has no rank', () => {
    const v = yearMeans(imerg, 'value');
    assert.deepEqual(rankOf(v, 2022), { n: 1, of: 3, side: 'highest' });
    assert.deepEqual(rankOf(v, 2023), { n: 2, of: 3, side: 'highest' }, 'middle of an odd count reads as highest');
    assert.deepEqual(rankOf(v, 2024), { n: 1, of: 3, side: 'lowest' });
    assert.equal(rankOf(v, 2025), null);
    const rows = [5, 9, 9, 1, 3, 7].map((value, i) => ({ year: 2001 + i, value }));
    assert.deepEqual(rankOf(rows, 2002), { n: 1, of: 6, side: 'highest' });
    assert.deepEqual(rankOf(rows, 2003), { n: 1, of: 6, side: 'highest' }, 'tie');
    assert.deepEqual(rankOf(rows, 2001), { n: 3, of: 6, side: 'lowest' });
  });

  test('rank wording is generic', () => {
    assert.equal(rankPhrase({ n: 1, side: 'highest' }), 'highest');
    assert.equal(rankPhrase({ n: 3, side: 'highest' }), '3rd highest');
    assert.equal(rankPhrase({ n: 2, side: 'lowest' }), '2nd lowest');
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 101, 111].map(ordinal),
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '101st', '111th']);
  });

  test('divergingColor: symmetric ramp shared with the trend map, neutral at zero', () => {
    assert.equal(divergingColor(0, 10), NEUTRAL);
    assert.equal(divergingColor(10, 10), UP[2]);
    assert.equal(divergingColor(-10, 10), DOWN[2]);
    assert.equal(divergingColor(25, 10), UP[2], 'clamped beyond max');
    assert.equal(divergingColor(10 / 3, 10), UP[0]);
    assert.equal(divergingColor(-20 / 3, 10), DOWN[1]);
    assert.equal(divergingColor(5, 0), NEUTRAL, 'flat series');
    assert.deepEqual(UP, ['#fbe0c4', '#f2a65a', '#c4621a']);
    assert.deepEqual(DOWN, ['#cfe1f4', '#7fb2e5', '#2f6fb3']);
  });

  test('pitchOf maps -max..+max onto 220..880 Hz', () => {
    near(pitchOf(-4, 4), 220); near(pitchOf(0, 4), 440); near(pitchOf(4, 4), 880);
    near(pitchOf(9, 4), 880); near(pitchOf(3, 0), 440);
    assert.ok(pitchOf(1, 4) > pitchOf(-1, 4));
  });
} finally {
  await server.close();
}
