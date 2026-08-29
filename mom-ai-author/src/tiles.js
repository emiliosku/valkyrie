'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');

const TARGET_PACKS = ['MoMBase', 'PotS', 'SoA'];
const PORT_TYPES = new Set(['open', 'door', 'secret']);
const EDGES = new Set(['north', 'east', 'south', 'west']);
const ROTATIONS = [0, 90, 180, 270];
// Footprints are named height x width to match the imported tile artwork.
const SHAPES = { '1x2': { width: 2, height: 1 }, '2x2': { width: 2, height: 2 }, '2x3': { width: 3, height: 2 }, '4x8': { width: 8, height: 4 } };

function defaultImportRoot() { return path.join(os.homedir(), '.config', 'Valkyrie', 'MoM', 'import'); }
function rotatePort(port, rotation) {
  if (rotation === 0) return { ...port };
  if (rotation === 90) return { ...port, edge: { north: 'east', east: 'south', south: 'west', west: 'north' }[port.edge], offset: ['east', 'west'].includes(port.edge) ? 1 - port.offset : port.offset };
  if (rotation === 180) return { ...port, edge: { north: 'south', east: 'west', south: 'north', west: 'east' }[port.edge], offset: 1 - port.offset };
  return { ...port, edge: { north: 'west', east: 'north', south: 'east', west: 'south' }[port.edge], offset: ['east', 'west'].includes(port.edge) ? port.offset : 1 - port.offset };
}
function createTileStore({ importRoot = process.env.MOM_AI_IMPORT_ROOT || defaultImportRoot(), geometryFile = process.env.MOM_AI_GEOMETRY_FILE || path.join(store.dataDir, 'tile-ports.json'), connectionFile = process.env.MOM_AI_CONNECTION_FILE || path.join(store.dataDir, 'tile-connections.json') } = {}) {
  const root = path.resolve(importRoot); const geometry = path.resolve(geometryFile); const connections = path.resolve(connectionFile);
  function imagePath(tile) {
    const reference = String(tile.imageRef || '').replace(/^"|"$/g, '');
    if (!reference.startsWith('{import}/')) return null;
    const stem = path.resolve(root, reference.slice('{import}/'.length));
    if (!stem.startsWith(`${root}${path.sep}`)) return null;
    for (const candidate of [stem, ...['.dds', '.pvr', '.png', '.jpg', '.jpeg'].map((extension) => `${stem}${extension}`)]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    return null;
  }
  function tile(catalog, id) { const item = catalog.tileSides.find((candidate) => candidate.id === id); if (!item) { const error = new Error('Unknown tile'); error.status = 404; throw error; } return item; }
  function list(catalog, packs = TARGET_PACKS) {
    const selected = new Set((packs || TARGET_PACKS).filter((pack) => TARGET_PACKS.includes(pack)));
    return catalog.tileSides.filter((item) => item.packIds.some((pack) => selected.has(pack))).map((item) => ({ id: item.id, nameKey: item.nameKey, traits: item.traits, reverseId: item.reverseId, packIds: item.packIds.filter((pack) => selected.has(pack)), imageAvailable: !!imagePath(item) })).filter((item) => item.imageAvailable);
  }
  function image(catalog, id) { const file = imagePath(tile(catalog, id)); if (!file) { const error = new Error('Imported tile image is unavailable'); error.status = 404; throw error; } return file; }
  function save(value) { fs.mkdirSync(path.dirname(geometry), { recursive: true }); const temporary = `${geometry}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temporary, geometry); return value; }
  function slot(shape, edge, offset) { const dimensions = SHAPES[shape]; const length = edge === 'north' || edge === 'south' ? dimensions.width : dimensions.height; return Math.max(0, Math.min(length - 1, Math.round(offset * length - 0.5))); }
  function snap(shape, edge, offset) { const dimensions = SHAPES[shape]; const length = edge === 'north' || edge === 'south' ? dimensions.width : dimensions.height; return Math.round(((slot(shape, edge, offset) + 0.5) / length) * 10000) / 10000; }
  function load() {
    try {
      const value = JSON.parse(fs.readFileSync(geometry, 'utf8'));
      if (!value || !value.tiles || typeof value.tiles !== 'object') return { version: 2, tiles: {} };
      if (value.version === 1) {
        for (const annotation of Object.values(value.tiles)) if (SHAPES[annotation.shape] && Array.isArray(annotation.ports)) annotation.ports = annotation.ports.map((port) => ({ ...port, offset: snap(annotation.shape, port.edge, Number(port.offset)) }));
        value.version = 2; save(value);
      }
      return value.version === 2 ? value : { version: 2, tiles: {} };
    } catch (error) { if (error.code === 'ENOENT') return { version: 2, tiles: {} }; throw error; }
  }
  function setPorts(catalog, id, input) {
    tile(catalog, id); const shape = input && input.shape; const ports = input && input.ports; const dimensions = SHAPES[shape];
    if (!dimensions || !Array.isArray(ports) || ports.length > 2 * (dimensions.width + dimensions.height)) { const error = new Error('Invalid tile port annotation'); error.status = 400; throw error; }
    const slots = new Set();
    const normalized = ports.map((port, index) => {
      const offset = Number(port.offset); const portSlot = slot(shape, port.edge, offset); const key = `${port.edge}:${portSlot}`;
      if (!PORT_TYPES.has(port.type) || !EDGES.has(port.edge) || !Number.isFinite(offset) || offset < 0 || offset > 1 || slots.has(key)) { const error = new Error('Invalid tile port'); error.status = 400; throw error; }
      slots.add(key); return { id: `port-${index + 1}`, type: port.type, edge: port.edge, offset: snap(shape, port.edge, offset) };
    });
    const value = load(); value.tiles[id] = { shape, ports: normalized, updatedAt: new Date().toISOString() }; save(value); return value.tiles[id];
  }
  function connectionCandidates(catalog, packs = TARGET_PACKS) {
    const selected = new Set((packs || TARGET_PACKS).filter((pack) => TARGET_PACKS.includes(pack)));
    const annotations = load().tiles;
    const candidates = catalog.tileSides.filter((item) => item.packIds.some((pack) => selected.has(pack)) && annotations[item.id] && imagePath(item)).sort((first, second) => first.id.localeCompare(second.id));
    const oppositeEdges = [['north', 'south'], ['south', 'north'], ['east', 'west'], ['west', 'east']]; const results = [];
    for (let index = 0; index < candidates.length; index++) for (let otherIndex = index + 1; otherIndex < candidates.length; otherIndex++) {
      const tileA = candidates[index]; const tileB = candidates[otherIndex]; if (tileA.reverseId === tileB.id || tileB.reverseId === tileA.id) continue;
      for (const rotationB of ROTATIONS) for (const [edgeA, edgeB] of oppositeEdges) {
        const portsA = annotations[tileA.id].ports.filter((port) => port.edge === edgeA && (port.type === 'door' || port.type === 'open'));
        const portsB = annotations[tileB.id].ports.map((port) => rotatePort(port, rotationB)).filter((port) => port.edge === edgeB && (port.type === 'door' || port.type === 'open'));
        const matchingPorts = portsA.flatMap((portA) => portsB.filter((portB) => portA.type === portB.type).map((portB) => ({ portA, portB })));
        if (matchingPorts.length) results.push({ key: `${tileA.id}:0:${edgeA}-${tileB.id}:${rotationB}:${edgeB}`, tileA: { id: tileA.id, packIds: tileA.packIds, shape: annotations[tileA.id].shape, rotation: 0 }, edgeA, tileB: { id: tileB.id, packIds: tileB.packIds, shape: annotations[tileB.id].shape, rotation: rotationB }, edgeB, matchingPorts });
      }
    }
    return results.sort((first, second) => first.key.localeCompare(second.key));
  }
  function loadConnections() { try { const value = JSON.parse(fs.readFileSync(connections, 'utf8')); return value && value.version === 1 && value.connections && typeof value.connections === 'object' ? value : { version: 1, connections: {} }; } catch (error) { if (error.code === 'ENOENT') return { version: 1, connections: {} }; throw error; } }
  function saveConnection(catalog, key, input) {
    const status = input && input.status;
    if (!['ok', 'rejected'].includes(status) || !connectionCandidates(catalog).some((candidate) => candidate.key === key)) { const error = new Error('Invalid connection decision'); error.status = 400; throw error; }
    const value = loadConnections(); value.connections[key] = { status, updatedAt: new Date().toISOString() }; saveTo(connections, value); return value.connections[key];
  }
  function saveTo(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temporary, file); return value; }
  return { geometryFile: geometry, connectionFile: connections, list, image, load, setPorts, connectionCandidates, loadConnections, saveConnection };
}

module.exports = { TARGET_PACKS, PORT_TYPES, ROTATIONS, SHAPES, rotatePort, createTileStore };
