'use strict';

const fs = require('fs');
const path = require('path');
const { parseIni } = require('./quest');

const MOM_ROOT = process.env.MOM_CONTENT_ROOT || path.resolve(__dirname, '..', '..', 'unity', 'Assets', 'StreamingAssets', 'content', 'MoM');
const TYPES = { TileSide: 'tileSides', Monster: 'monsters', Hero: 'heroes', Item: 'items', Token: 'tokens', Image: 'images', Audio: 'audio' };
const PACK_NAMES = {
  MoMBase: 'Mansions of Madness: Second Edition', BtT: 'Beyond the Threshold', HJ: 'Horrific Journeys', PotS: 'Path of the Serpent', RN: 'Recurring Nightmares', SM: 'Suppressed Memories', SoA: 'Streets of Arkham', SoT: 'Sanctum of Twilight',
  MoM1EI: 'First Edition Investigators', MoM1EM: 'First Edition Monsters', MoM1ET: 'First Edition Tiles', MoM1CK: 'First Edition Tokens and Cards',
  FAI: 'Forbidden Alchemy Investigators', FAM: 'Forbidden Alchemy Monsters', FAT: 'Forbidden Alchemy Tiles', CotWI: 'Call of the Wild Investigators', CotWM: 'Call of the Wild Monsters', CotWT: 'Call of the Wild Tiles',
};
let cached;

function filesNamed(root, name) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesNamed(file, name));
    else if (entry.name === name) result.push(file);
  }
  return result;
}
function sectionType(id) { return Object.keys(TYPES).find((prefix) => id.startsWith(prefix)); }
function loadCatalog(root = MOM_ROOT) {
  if (root === MOM_ROOT && cached) return cached;
  const packs = new Map();
  for (const manifest of filesNamed(root, 'content_pack.ini')) {
    const ini = parseIni(fs.readFileSync(manifest, 'utf8'));
    const data = ini.ContentPack && ini.ContentPack.keys;
    if (!data || !data.id) continue;
    packs.set(data.id, { id: data.id, type: data.type || 'other', nameKey: data.name || data.id, displayName: PACK_NAMES[data.id] || data.id, clonePackIds: String(data.clone || '').split(/\s+/).filter(Boolean), files: (ini.ContentPackData || { bare: [] }).bare, directory: path.dirname(manifest) });
  }
  const entries = Object.fromEntries(Object.values(TYPES).map((type) => [type, new Map()]));
  for (const pack of packs.values()) for (const relative of pack.files) {
    const file = path.join(pack.directory, relative);
    if (!fs.existsSync(file)) continue;
    for (const [id, section] of Object.entries(parseIni(fs.readFileSync(file, 'utf8')))) {
      const prefix = sectionType(id); if (!prefix) continue;
      const type = TYPES[prefix]; const existing = entries[type].get(id);
      const item = existing || { id, packIds: [], nameKey: section.keys.name || id, traits: [], reverseId: '', imageRef: '', priority: 0 };
      if (!item.packIds.includes(pack.id)) item.packIds.push(pack.id);
      item.traits = String(section.keys.traits || item.traits.join(' ')).split(/\s+/).filter(Boolean);
      item.nameKey = section.keys.name || item.nameKey; item.reverseId = section.keys.reverse || item.reverseId; item.imageRef = section.keys.image || item.imageRef; item.priority = Number(section.keys.priority || item.priority || 0);
      entries[type].set(id, item);
    }
  }
  const catalog = { schemaVersion: 1, game: 'MoM', packs: [...packs.values()].map(({ directory, files, ...pack }) => pack).sort((a, b) => a.id.localeCompare(b.id)), ...Object.fromEntries(Object.entries(entries).map(([type, map]) => [type, [...map.values()].sort((a, b) => a.id.localeCompare(b.id))])) };
  if (root === MOM_ROOT) cached = catalog;
  return catalog;
}
function selectedCatalog(catalog, requested) {
  const packMap = new Map(catalog.packs.map((pack) => [pack.id, pack]));
  const selectedPackIds = [...new Set(['MoMBase', ...(requested || [])])];
  for (const id of selectedPackIds) if (!packMap.has(id)) throw new Error(`Unknown MoM pack: ${id}`);
  const effective = new Set(selectedPackIds); const visit = (id) => { const pack = packMap.get(id); for (const clone of pack.clonePackIds) if (!effective.has(clone)) { effective.add(clone); visit(clone); } };
  selectedPackIds.forEach(visit);
  const filter = (items) => items.filter((item) => item.packIds.some((id) => effective.has(id)));
  return { schemaVersion: catalog.schemaVersion, game: catalog.game, selectedPackIds, effectivePackIds: [...effective], packs: catalog.packs.filter((pack) => selectedPackIds.includes(pack.id)).map((pack) => ({ ...pack, contentCount: Object.values(TYPES).reduce((count, type) => count + filter(catalog[type]).filter((item) => item.packIds.includes(pack.id)).length, 0) })), ...Object.fromEntries(Object.values(TYPES).map((type) => [type, filter(catalog[type])])) };
}
function promptCatalog(catalog, maxPerType = 40) {
  const sample = (items) => {
    const chosen = []; const seen = new Set();
    for (const pack of catalog.selectedPackIds) for (const item of items) {
      if (chosen.length >= maxPerType) break;
      if (item.packIds.includes(pack) && !seen.has(item.id)) { chosen.push(item); seen.add(item.id); }
    }
    for (const item of items) if (chosen.length < maxPerType && !seen.has(item.id)) { chosen.push(item); seen.add(item.id); }
    return chosen.map((item) => ({ id: item.id, traits: item.traits, reverseId: item.reverseId }));
  };
  return { selectedPackIds: catalog.selectedPackIds, ...Object.fromEntries(Object.values(TYPES).map((type) => [type, sample(catalog[type])])) };
}
function contains(catalog, type, id) { return (catalog[type] || []).some((item) => item.id === id); }

module.exports = { loadCatalog, selectedCatalog, promptCatalog, contains, MOM_ROOT };
