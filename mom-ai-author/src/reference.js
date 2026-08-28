'use strict';

const fs = require('fs');
const path = require('path');
const { parseIni, readZipTextEntries } = require('./quest');
const { loadCatalog } = require('./catalog');

const GEOMETRY_PACKS = new Set(['MoMBase', 'PotS', 'SoA']);

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function positionedSections(text, source) {
  return Object.entries(parseIni(text || '')).flatMap(([name, section]) => {
    const x = number(section.keys.xposition); const y = number(section.keys.yposition);
    return x === null || y === null ? [] : [{ name, source, x, y, rotation: number(section.keys.rotation) || 0, type: section.keys.side || section.keys.type || section.keys.monster || 'other' }];
  });
}
function rotated(x, y, degrees) { const radians = degrees * Math.PI / 180; return { x: Math.round((x * Math.cos(radians) - y * Math.sin(radians)) * 10000) / 10000, y: Math.round((x * Math.sin(radians) + y * Math.cos(radians)) * 10000) / 10000 }; }
function barrierKind(component) { const value = `${component.name} ${component.type}`.toLowerCase(); return value.includes('door') || value.includes('trapdoor') ? 'door' : value.includes('wall') ? 'wall' : 'barricade'; }
function portEvidence(files, tiles) {
  return Object.entries(files).flatMap(([source, text]) => positionedSections(text, source)).filter((component) => component.source !== 'tiles.ini' && /(door|wall|barricade|trapdoor)/i.test(`${component.name} ${component.type}`)).map((component) => ({
    ...component, kind: barrierKind(component),
    nearbyTiles: tiles.map((tile) => {
      const offset = rotated(component.x - tile.x, component.y - tile.y, -tile.rotation);
      return { name: tile.name, side: tile.type, distance: Math.round(Math.hypot(component.x - tile.x, component.y - tile.y) * 10000) / 10000, local: offset };
    }).sort((a, b) => a.distance - b.distance).slice(0, 4),
  }));
}
function localizationStats(text) {
  const entries = String(text || '').split(/\r?\n/).filter((line) => line.includes(',') && !line.startsWith('.,'));
  const words = entries.reduce((count, line) => count + (line.slice(line.indexOf(',') + 1).match(/[\p{L}\p{N}]+/gu) || []).length, 0);
  return { entries: entries.length, words };
}
function analyzeArchive(file, catalog = loadCatalog()) {
  const files = readZipTextEntries(file); const quest = (parseIni(files['quest.ini'] || '').Quest || { keys: {}, bare: [] }).keys;
  if (!files['quest.ini']) throw new Error('Reference archive is missing quest.ini');
  const tilePacks = new Map(catalog.tileSides.map((tile) => [tile.id, tile.packIds.filter((id) => GEOMETRY_PACKS.has(id))]));
  const tiles = positionedSections(files['tiles.ini'], 'tiles.ini').map((tile) => ({ ...tile, packs: tilePacks.get(tile.type) || [] }));
  const sections = Object.values(files).map(parseIni).flatMap((ini) => Object.keys(ini));
  const localization = files[`Localization.${quest.defaultlanguage}.txt`] || Object.entries(files).find(([name]) => /^Localization\.[^.]+\.txt$/.test(name))?.[1] || '';
  const coverage = Object.fromEntries([...GEOMETRY_PACKS].map((pack) => [pack, tiles.filter((tile) => tile.packs.includes(pack)).length]));
  return {
    file: path.basename(file), format: number(quest.format), declaredPacks: String(quest.packs || 'MoMBase').split(/\s+/).filter(Boolean), estimatedMinutes: { min: number(quest.lengthmin), max: number(quest.lengthmax) },
    tiles, tileCoverage: coverage, tokens: positionedSections(files['tokens.ini'], 'tokens.ini').length, spawns: positionedSections(files['spawns.ini'], 'spawns.ini').length, barriers: portEvidence(files, tiles),
    events: sections.filter((name) => name.startsWith('Event')).length, localization: localizationStats(localization), files: Object.keys(files).sort(),
  };
}
function analyzeDirectory(directory, catalog = loadCatalog()) {
  return fs.readdirSync(directory).filter((name) => name.endsWith('.valkyrie')).sort().map((name) => {
    const file = path.join(directory, name);
    try { return analyzeArchive(file, catalog); } catch (error) { return { file: name, error: error.message }; }
  });
}
if (require.main === module) {
  const directory = process.argv[2] || process.env.MOM_AI_REFERENCE_DIR || path.join(process.env.HOME || '', '.config', 'Valkyrie', 'Download');
  console.log(JSON.stringify(analyzeDirectory(directory), null, 2));
}

module.exports = { analyzeArchive, analyzeDirectory, GEOMETRY_PACKS };
