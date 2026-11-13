import test from 'node:test';
import assert from 'node:assert/strict';
import { projectGlobe, unprojectGlobe, findGridCell, normalizeLongitude } from '../src/lib/globeMath.ts';

const approx = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

test('global view projects the chosen center to the middle of the globe', () => {
  const p = projectGlobe(12, 13, 12, 13);
  approx(p.x, 0); approx(p.y, 0); approx(p.z, 1);
});

test('project/unproject round-trip for a visible regional point', () => {
  const p = projectGlobe(105.6, 10.2, 105.5, 10.1);
  assert.ok(p.z > 0);
  const back = unprojectGlobe(p.x, p.y, 105.5, 10.1);
  assert.ok(back);
  approx(back.lon, 105.6); approx(back.lat, 10.2);
});

test('the far side of the sphere is not selectable', () => {
  assert.equal(unprojectGlobe(1.01, 0, 0, 0), null);
});

test('longitude wraps correctly around the international date line', () => {
  approx(normalizeLongitude(181), -179);
  approx(normalizeLongitude(-181), 179);
});

test('clicking inside a geographic cell returns its existing selection id', () => {
  const grid = { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { id: 'cell-1-2' },
    geometry: { type: 'Polygon', coordinates: [[[104, 9], [106, 9], [106, 11], [104, 11], [104, 9]]] },
  }] };
  assert.equal(findGridCell(grid, 105, 10), 'cell-1-2');
  assert.equal(findGridCell(grid, 130, 10), null);
  assert.equal(findGridCell(null, 105, 10), null);
});
