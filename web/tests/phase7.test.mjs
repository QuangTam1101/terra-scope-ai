// Phase 7: landing page, demo video configuration, guided tour and routing. Offline: no browser, network or Gemini.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const qaCache = await mkdtemp(join(resolve(tmpdir()), 'terrascope-phase7-'));
const server = await createServer({ cacheDir: qaCache, server: { middlewareMode: true, watch: null }, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] } });

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

try {
  const demo = await server.ssrLoadModule('/src/config/demo.ts');
  test('demo video: placeholder by default, only well-formed sources are playable', () => {
    assert.equal(demo.DEMO_VIDEO.kind, 'none');
    assert.equal(demo.hasPlayableVideo(demo.DEMO_VIDEO), false);
    assert.equal(demo.hasPlayableVideo({ kind: 'youtube', title: 't', id: 'dQw4w9WgXcQ' }), true);
    assert.equal(demo.youtubeEmbedUrl('not a valid id'), null);
    assert.equal(demo.hasPlayableVideo({ kind: 'youtube', title: 't', id: 'javascript:alert(1)' }), false);
    assert.equal(demo.hasPlayableVideo({ kind: 'file', title: 't', src: '/demo/terra.mp4' }), true);
    assert.equal(demo.hasPlayableVideo({ kind: 'file', title: 't', src: 'http://example.com/x.mp4' }), false);
  });

  const ob = await server.ssrLoadModule('/src/onboarding.ts');
  test('tutorial: first visit auto-starts once, completion is remembered', () => {
    const s = fakeStorage();
    assert.equal(ob.ONBOARDING_KEY, 'terra-scope:onboarding:v1');
    assert.equal(ob.isOnboardingDone(s), false);
    assert.equal(ob.shouldAutoStart(true, false, s), true);       // first entry from the landing page
    assert.equal(ob.shouldAutoStart(true, true, s), false);       // not twice in one session
    assert.equal(ob.shouldAutoStart(false, false, s), false);     // a refresh / deep link does not start it
    assert.equal(ob.markOnboardingDone(s), true);
    assert.equal(ob.isOnboardingDone(s), true);
    assert.equal(ob.shouldAutoStart(true, false, s), false);      // returning user
    assert.deepEqual([...s.m.keys()], ['terra-scope:onboarding:v1']);   // nothing else is stored
  });
  test('tutorial: blocked or missing storage never throws', () => {
    assert.equal(ob.isOnboardingDone(brokenStorage), false);
    assert.equal(ob.markOnboardingDone(brokenStorage), false);
    assert.equal(ob.isOnboardingDone(null), false);
    assert.equal(ob.markOnboardingDone(null), false);
  });
  test('tutorial: steps are well formed and clamp at both ends', () => {
    const ids = ob.TOUR_STEPS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids[0], 'welcome'); assert.equal(ids.at(-1), 'finish');
    assert.equal(ob.TOUR_STEPS.length, 12);
    for (const s of ob.TOUR_STEPS) {
      assert.ok(['explore', 'hunt', 'detective', 'report'].includes(s.page), s.id);
      if (s.target) assert.match(s.target, /^\[data-tour="[\w-]+"\]$/, s.id);
      assert.ok(s.title && s.body.length > 20, s.id);
    }
    assert.equal(ob.clampStep(-3), 0); assert.equal(ob.clampStep(99), 11);
  });
  test('tutorial: every highlighted target exists on its page (no pointing at nothing)', async () => {
    const file = { explore: 'Explore', hunt: 'Hunt', detective: 'Detective', report: 'Report' };
    for (const s of ob.TOUR_STEPS.filter((x) => x.target)) {
      const id = s.target.match(/data-tour="([\w-]+)"/)[1];
      const src = await readFile(new URL(`../src/pages/${file[s.page]}.tsx`, import.meta.url), 'utf8');
      assert.ok(src.includes(`data-tour="${id}"`), `${s.id}: data-tour="${id}" missing in ${file[s.page]}.tsx`);
    }
  });
  test('tutorial: no step text promises forecasts or fabricated results', () => {
    const text = ob.TOUR_STEPS.map((s) => s.body).join(' ').toLowerCase();
    assert.ok(!/will (rise|fall|increase|decrease) by|forecast shows|predicts/.test(text));
    assert.ok(!text.includes('—'), 'no long dash in tutorial text');
  });

  const routes = await server.ssrLoadModule('/src/pageRouting.ts');
  test('routing: landing is the entry, deep links and unknown hashes are stable', () => {
    for (const h of ['', '#', '#/', '#landing']) assert.equal(routes.pageFromHash(h), 'landing');
    for (const p of ['home', 'explore', 'hunt', 'detective', 'report']) {
      assert.equal(routes.pageFromHash('#' + p), p); assert.equal(routes.pageFromHash('#/' + p), p);
    }
    assert.equal(routes.pageFromHash('#nope'), 'home');
  });

  const { Landing } = await server.ssrLoadModule('/src/pages/Landing.tsx');
  test('landing page renders hero, features, NASA sources, demo placeholder and attribution', () => {
    const html = renderToStaticMarkup(createElement(Landing, { onStart: () => {} }));
    for (const s of ["Discover Earth", "Get Started", "Watch Demo", "Product Demo: Coming Soon", "GPM IMERG", "GLDAS Noah", "MERRA-2",
      "Compare Regions", "Ask the AI Detective", "not an official NASA product", "Not affiliated with or endorsed by NASA",
      "does not forecast", "Illustration, not data"]) assert.ok(html.includes(s), s);
    assert.ok(!html.includes('<video'), 'no fake video player without a configured video');
    assert.ok(!html.includes('<iframe'), 'no embed without a configured video');
    assert.ok(!html.includes('—'), 'no long dash on the landing page');
    assert.ok((html.match(/<h1/g) || []).length === 1, 'exactly one h1');
  });

  const { Tour } = await server.ssrLoadModule('/src/Tour.tsx');
  test('tour renders nothing while closed (never blocks the app by default)', () => {
    const html = renderToStaticMarkup(createElement(Tour, { open: false, page: 'explore', go: () => {}, onClose: () => {}, onReplay: () => {} }));
    assert.equal(html, '');
  });
} finally {
  await server.close();
}
