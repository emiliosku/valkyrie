'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCatalog } = require('./catalog');
const { createTileStore, rotatePort } = require('./tiles');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-import-')); const geometryFile = path.join(root, 'tile-ports.json'); const connectionFile = path.join(root, 'tile-connections.json'); const catalog = loadCatalog(); const tile = catalog.tileSides.find((item) => item.id === 'TileSideLobby'); const relative = tile.imageRef.replace(/^"\{import\}\//, '').replace(/"$/, ''); const image = path.join(root, `${relative}.dds`);
  fs.mkdirSync(path.dirname(image), { recursive: true }); fs.writeFileSync(image, 'DDS '); return { root, catalog, tile, image, geometryFile, connectionFile, store: createTileStore({ importRoot: root, geometryFile, connectionFile }) };
}

test('lists only catalog-owned imported tile images', () => {
  const { catalog, tile, image, store } = fixture();
  assert.ok(store.list(catalog, ['MoMBase']).some((item) => item.id === tile.id));
  assert.equal(store.image(catalog, tile.id), image);
  assert.throws(() => store.image(catalog, 'TileSideNope'), /Unknown tile/);
});

test('persists bounded normalized tile ports', () => {
  const { catalog, tile, store } = fixture();
  const saved = store.setPorts(catalog, tile.id, { shape: '1x2', ports: [{ type: 'door', edge: 'north', offset: 0.25 }, { type: 'open', edge: 'east', offset: 0.5 }] });
  assert.deepEqual(saved.ports.map(({ id, ...port }) => port), [{ type: 'door', edge: 'north', offset: 0.25 }, { type: 'open', edge: 'east', offset: 0.5 }]);
  assert.equal(store.load().tiles[tile.id].shape, '1x2');
  assert.throws(() => store.setPorts(catalog, tile.id, { shape: '1x2', ports: Array.from({ length: 7 }, () => ({ type: 'open', edge: 'north', offset: 0.5 })) }), /Invalid tile port annotation/);
});

test('snaps 4x8 ports to one-half subtile centers', () => {
  const { catalog, tile, store } = fixture();
  const saved = store.setPorts(catalog, tile.id, { shape: '4x8', ports: [{ type: 'door', edge: 'north', offset: 0.23 }, { type: 'open', edge: 'west', offset: 0.19 }] });
  assert.deepEqual(saved.ports.map(({ offset }) => offset), [0.1875, 0.125]);
  assert.throws(() => store.setPorts(catalog, tile.id, { shape: '4x8', ports: [{ type: 'door', edge: 'north', offset: 0.1 }, { type: 'open', edge: 'north', offset: 0.12 }] }), /Invalid tile port/);
});

test('supports 2x3 footprints', () => {
  const { catalog, tile, store } = fixture();
  const saved = store.setPorts(catalog, tile.id, { shape: '2x3', ports: [{ type: 'door', edge: 'north', offset: 0.51 }, { type: 'open', edge: 'west', offset: 0.74 }] });
  assert.deepEqual(saved.ports.map(({ offset }) => offset), [0.5, 0.75]);
});

test('migrates version 1 offsets using height-by-width footprints', () => {
  const { catalog, tile, geometryFile, store } = fixture();
  fs.writeFileSync(geometryFile, JSON.stringify({ version: 1, tiles: { [tile.id]: { shape: '1x2', ports: [{ id: 'port-1', type: 'door', edge: 'north', offset: 0.3 }, { id: 'port-2', type: 'open', edge: 'east', offset: 0.7 }] } } }));
  const migrated = store.load();
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.tiles[tile.id].ports.map(({ offset }) => offset), [0.25, 0.5]);
  assert.equal(JSON.parse(fs.readFileSync(geometryFile, 'utf8')).version, 2);
  assert.ok(catalog.tileSides.includes(tile));
});

test('lists compatible connections and persists decisions', () => {
  const { root, store } = fixture();
  const catalog = { tileSides: [
    { id: 'TileA', packIds: ['MoMBase'], imageRef: '"{import}/img/a"', reverseId: 'TileC' },
    { id: 'TileB', packIds: ['MoMBase'], imageRef: '"{import}/img/b"', reverseId: 'TileD' },
    { id: 'TileC', packIds: ['MoMBase'], imageRef: '"{import}/img/c"', reverseId: 'TileA' }
  ] };
  for (const name of ['a', 'b', 'c']) { const image = path.join(root, 'img', `${name}.dds`); fs.mkdirSync(path.dirname(image), { recursive: true }); fs.writeFileSync(image, 'DDS '); }
  store.setPorts(catalog, 'TileA', { shape: '1x2', ports: [{ type: 'door', edge: 'south', offset: 0.25 }] });
  store.setPorts(catalog, 'TileB', { shape: '1x2', ports: [{ type: 'door', edge: 'north', offset: 0.75 }] });
  store.setPorts(catalog, 'TileC', { shape: '1x2', ports: [{ type: 'door', edge: 'north', offset: 0.75 }] });
  const candidates = store.connectionCandidates(catalog, ['MoMBase']);
  const expected = candidates.find((candidate) => candidate.key === 'TileA:0:south-TileB:0:north');
  assert.ok(expected);
  assert.equal(expected.matchingPorts.length, 1);
  assert.ok(!candidates.some((candidate) => candidate.key.includes('TileA') && candidate.key.includes('TileC')));
  assert.equal(store.saveConnection(catalog, expected.key, { status: 'ok' }).status, 'ok');
  assert.equal(store.loadConnections().connections[expected.key].status, 'ok');
  assert.throws(() => store.saveConnection(catalog, 'not-a-candidate', { status: 'ok' }), /Invalid connection decision/);
  assert.throws(() => store.saveConnection(catalog, expected.key, { status: 'maybe' }), /Invalid connection decision/);
});

test('includes candidates that require rotating tile B', () => {
  const { root, store } = fixture();
  const catalog = { tileSides: [{ id: 'TileA', packIds: ['MoMBase'], imageRef: '"{import}/img/a"' }, { id: 'TileB', packIds: ['MoMBase'], imageRef: '"{import}/img/b"' }] };
  for (const name of ['a', 'b']) { const image = path.join(root, 'img', `${name}.dds`); fs.mkdirSync(path.dirname(image), { recursive: true }); fs.writeFileSync(image, 'DDS '); }
  store.setPorts(catalog, 'TileA', { shape: '1x2', ports: [{ type: 'door', edge: 'south', offset: 0.25 }] });
  store.setPorts(catalog, 'TileB', { shape: '1x2', ports: [{ type: 'door', edge: 'south', offset: 0.25 }] });
  const candidates = store.connectionCandidates(catalog, ['MoMBase']);
  assert.ok(candidates.some((candidate) => candidate.key === 'TileA:0:south-TileB:180:north'));
});

test('includes a tile connecting to another copy of itself after rotation', () => {
  const { root, store } = fixture();
  const catalog = { tileSides: [{ id: 'TileA', packIds: ['MoMBase'], imageRef: '"{import}/img/a"' }] };
  const image = path.join(root, 'img', 'a.dds'); fs.mkdirSync(path.dirname(image), { recursive: true }); fs.writeFileSync(image, 'DDS ');
  store.setPorts(catalog, 'TileA', { shape: '1x2', ports: [{ type: 'door', edge: 'south', offset: 0.25 }, { type: 'door', edge: 'west', offset: 0.5 }] });
  const candidates = store.connectionCandidates(catalog, ['MoMBase']);
  assert.ok(candidates.some((candidate) => candidate.key === 'TileA:0:south-TileA:90:north'));
});

test('rotates port edges and offsets clockwise', () => {
  assert.deepEqual(rotatePort({ edge: 'north', offset: 0.25 }, 90), { edge: 'east', offset: 0.25 });
  assert.deepEqual(rotatePort({ edge: 'east', offset: 0.25 }, 90), { edge: 'south', offset: 0.75 });
  assert.deepEqual(rotatePort({ edge: 'north', offset: 0.25 }, 180), { edge: 'south', offset: 0.75 });
  assert.deepEqual(rotatePort({ edge: 'north', offset: 0.25 }, 270), { edge: 'west', offset: 0.75 });
  assert.deepEqual(rotatePort({ edge: 'east', offset: 0.25 }, 270), { edge: 'north', offset: 0.25 });
});
