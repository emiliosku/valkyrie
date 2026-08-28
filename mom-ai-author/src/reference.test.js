'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const test = require('node:test');
const assert = require('node:assert/strict');
const { packageQuest, readZipTextEntries } = require('./quest');
const { analyzeArchive } = require('./reference');

function deflatedZip(name, text) {
  const filename = Buffer.from(name); const data = Buffer.from(text); const compressed = zlib.deflateRawSync(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + filename.length, 12); end.writeUInt32LE(30 + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

test('reads deflated text entries from a reference archive', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mom-reference-')), 'reference.valkyrie');
  fs.writeFileSync(file, deflatedZip('quest.ini', '[Quest]\nformat=21\n'));
  assert.deepEqual(readZipTextEntries(file), { 'quest.ini': '[Quest]\nformat=21\n' });
});

test('reports Base, PotS, and SoA layout evidence from a reference archive', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-reference-'));
  const file = packageQuest('reference', {
    'quest.ini': '[Quest]\nformat=21\ntype=MoM\ndefaultlanguage=English\npacks=MoMBase PotS SoA\nlengthmin=90\nlengthmax=120\n',
    'tiles.ini': '[TileBase]\nside=TileSideLobby\nxposition=0\nyposition=0\n\n[TilePotS]\nside=TileSideOvergrownPath\nxposition=3.5\nyposition=0\nrotation=90\n\n[TileSoA]\nside=TileSideChapelMAD25\nxposition=7\nyposition=0\n',
    'tokens.ini': '[TokenClue]\ntype=TokenClue\nxposition=1\nyposition=1\n\n[TokenTempleDoor]\ntype=TokenTempleDoor\nxposition=4.5\nyposition=0\nrotation=90\n',
    'spawns.ini': '[SpawnCultist]\nmonster=MonsterCultist\nxposition=2\nyposition=1\n',
    'events.ini': '[EventStart]\ntrigger=EventStart\n\n[EventClue]\ndisplay=true\n',
    'Localization.English.txt': '.,English\nqst:EventClue.text,Find the missing clue.\n',
  }, directory);
  const report = analyzeArchive(file);
  assert.deepEqual(report.tileCoverage, { MoMBase: 1, PotS: 1, SoA: 1 });
  assert.equal(report.tokens, 2);
  assert.equal(report.spawns, 1);
  assert.equal(report.events, 2);
  assert.equal(report.localization.words, 4);
  assert.deepEqual(report.barriers[0].nearbyTiles[0], { name: 'TilePotS', side: 'TileSideOvergrownPath', distance: 1, local: { x: 0, y: -1 } });
});
