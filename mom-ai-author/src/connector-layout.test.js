'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { placements } = require('../public/connector-layout');

test('offsets a north tile to align mirrored south and north ports', () => {
  const candidate = { tileA: { shape: '1x2' }, edgeA: 'south', tileB: { shape: '1x2' }, edgeB: 'north', matchingPorts: [{ portA: { offset: 0.25 }, portB: { offset: 0.75 } }] };
  const layout = placements(candidate);
  assert.deepEqual(layout, { originA: { x: 0, y: 0 }, originB: { x: -1, y: 1 } });
  assert.equal(layout.originA.x + 2 * 0.25, layout.originB.x + 2 * 0.75);
});

test('offsets a west tile to align mirrored east and west ports', () => {
  const candidate = { tileA: { shape: '2x2' }, edgeA: 'east', tileB: { shape: '2x2' }, edgeB: 'west', matchingPorts: [{ portA: { offset: 0.25 }, portB: { offset: 0.75 } }] };
  const layout = placements(candidate);
  assert.deepEqual(layout, { originA: { x: 0, y: 0 }, originB: { x: 2, y: -1 } });
  assert.equal(layout.originA.y + 2 * 0.25, layout.originB.y + 2 * 0.75);
});
