'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCatalog, selectedCatalog } = require('./catalog');
const { validateQuest } = require('./quest');

test('loads shipped MoM packs and resolves pack clones', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.packs.length, 18);
  assert.ok(catalog.tileSides.some((item) => item.id === 'TileSideLobby'));
  assert.ok(catalog.monsters.some((item) => item.id === 'MonsterCultist'));
  assert.equal(catalog.packs.find((pack) => pack.id === 'PotS').displayName, 'Path of the Serpent');
  const selected = selectedCatalog(catalog, ['RN']);
  assert.deepEqual(selected.selectedPackIds, ['MoMBase', 'RN']);
  assert.ok(selected.effectivePackIds.includes('MoM1CK'));
  const compact = require('./catalog').promptCatalog(selected);
  assert.ok(Buffer.byteLength(JSON.stringify(compact), 'utf8') < 25000);
});

test('rejects a generated reference outside selected packs', () => {
  const catalog = selectedCatalog(loadCatalog(), []);
  const result = validateQuest({
    'quest.ini': '[Quest]\nformat=21\ntype=MoM\npacks=MoMBase\n\n[QuestData]\ntiles.ini\nevents.ini\n',
    'tiles.ini': '[TileEntry]\nside=TileSideLobby\nxposition=0\nyposition=0\n',
    'events.ini': '[EventStart]\nbuttons=1\nevent1=EventMissing\nbutton1=Continue\n',
    'Localization.English.txt': '.,English\n',
  }, catalog);
  assert.ok(result.errors.some((error) => error.includes('undefined event')));
});
