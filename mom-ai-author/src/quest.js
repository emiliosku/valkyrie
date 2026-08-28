'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ALLOWED_FILES = new Set(['quest.ini', 'tiles.ini', 'events.ini', 'tokens.ini', 'spawns.ini', 'items.ini', 'ui.ini', 'monsters.ini', 'puzzles.ini', 'activations.ini', 'other.ini', 'Localization.English.txt']);
function safeFiles(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('files must be an object');
  const result = {};
  for (const [name, content] of Object.entries(files)) {
    if (!ALLOWED_FILES.has(name) || name.includes('/') || name.includes('\\')) throw new Error(`Unsupported quest file: ${name}`);
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 256 * 1024) throw new Error(`Invalid content for ${name}`);
    result[name] = content;
  }
  return result;
}
function parseIni(text) {
  const sections = {};
  let current;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#' || line[0] === ';') continue;
    if (/^\[[^\]]+\]$/.test(line)) { current = line.slice(1, -1); sections[current] = sections[current] || { keys: {}, bare: [] }; continue; }
    if (!current) continue;
    const index = line.indexOf('=');
    if (index === -1) sections[current].bare.push(line);
    else sections[current].keys[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return sections;
}
function validateQuest(input, catalog) {
  const files = safeFiles(input);
  const errors = []; const warnings = []; const sections = {}; const byFile = {};
  for (const [file, text] of Object.entries(files)) {
    byFile[file] = parseIni(text);
    for (const [name, section] of Object.entries(byFile[file])) {
    if (sections[name]) errors.push(`Duplicate section [${name}]`); else sections[name] = { ...section, file };
    }
  }
  const quest = sections.Quest;
  if (!quest) return { errors: ['Missing [Quest] section'], warnings };
  if (Number(quest.keys.format) < 4 || Number(quest.keys.format) > 21 || !Number.isInteger(Number(quest.keys.format))) errors.push('Quest format must be an integer from 4 through 21');
  if (quest.keys.type !== 'MoM') errors.push('Quest type must be MoM');
  if (quest.keys.defaultlanguage !== 'English') errors.push('Quest defaultlanguage must be English');
  if (!quest.keys['name.English']) errors.push('Quest must define name.English');
  if (!quest.keys.difficulty || !Number.isFinite(Number(quest.keys.difficulty))) errors.push('Quest must define numeric difficulty (e.g. 1.5)');
  if (!quest.keys.lengthmin || !Number.isFinite(Number(quest.keys.lengthmin))) errors.push('Quest must define numeric lengthmin (estimated minutes)');
  if (!quest.keys.lengthmax || !Number.isFinite(Number(quest.keys.lengthmax))) errors.push('Quest must define numeric lengthmax (estimated minutes)');
  if (!files['Localization.English.txt']) errors.push('Missing Localization.English.txt');
  const localization = files['Localization.English.txt'] || '';
  if (!/^quest\.name,/m.test(localization)) errors.push('Localization must define quest.name (display title)');
  if (!/^quest\.synopsys,/m.test(localization)) errors.push('Localization must define quest.synopsys (shown in quest card, max ~100 chars)');
  if (!/^quest\.description,/m.test(localization)) warnings.push('Localization should define quest.description (shown in quest details)');
  if (!/^quest\.authors,/m.test(localization)) warnings.push('Localization should define quest.authors');
  if (!/^quest\.authors_short,/m.test(localization)) warnings.push('Localization should define quest.authors_short');
  if (!sections.QuestText || !sections.QuestText.bare.includes('Localization.English.txt')) errors.push('[QuestText] must list Localization.English.txt');
  if (!sections.QuestData) errors.push('Missing [QuestData] section');
  const declaredFiles = new Set((sections.QuestData || { bare: [] }).bare);
  for (const required of ['tiles.ini', 'events.ini', 'tokens.ini']) if (!declaredFiles.has(required)) errors.push(`[QuestData] must list ${required}`);
  for (const listed of declaredFiles) if (!files[listed]) errors.push(`[QuestData] references missing ${listed}`);
  if (!sections.EventStart) errors.push('Missing [EventStart] section');
  for (const [name, section] of Object.entries(sections)) {
    if (['Quest', 'QuestData', 'QuestText'].includes(name)) continue;
    const count = Number(section.keys.buttons || 0);
    if (!Number.isInteger(count) || count < 0) errors.push(`[${name}] has invalid buttons value`);
    for (let i = 1; i <= count; i++) if (!Object.prototype.hasOwnProperty.call(section.keys, `event${i}`)) errors.push(`[${name}] is missing event${i}`);
    for (const key of Object.keys(section.keys)) if (/^event\d+$/.test(key)) {
      const target = section.keys[key].split(',')[0].trim();
      if (target && !sections[target]) errors.push(`[${name}] references undefined event ${target}`);
    }
  }
  const added = new Set(Object.values(sections).flatMap((section) => String(section.keys.add || '').split(/\s+/).filter(Boolean)));
  const tiles = byFile['tiles.ini'] || {};
  if (!Object.keys(tiles).length) errors.push('tiles.ini must define at least one [Tile...] section');
  for (const [name, section] of Object.entries(tiles)) {
    if (!name.startsWith('Tile')) errors.push(`tiles.ini section [${name}] must start with Tile`);
    if (!section.keys.side) errors.push(`[${name}] must define lowercase side=TileSide...`);
    if (!Number.isFinite(Number(section.keys.xposition)) || !Number.isFinite(Number(section.keys.yposition))) errors.push(`[${name}] must define numeric xposition and yposition`);
    if (!added.has(name)) errors.push(`[${name}] is never added by an event`);
  }
  const tokens = byFile['tokens.ini'] || {};
  for (const [name, section] of Object.entries(tokens)) {
    if (!name.startsWith('Token')) errors.push(`tokens.ini section [${name}] must start with Token`);
    if (!section.keys.type) errors.push(`[${name}] must define lowercase type=Token...`);
    if (!Number.isFinite(Number(section.keys.xposition)) || !Number.isFinite(Number(section.keys.yposition))) errors.push(`[${name}] must define numeric xposition and yposition`);
    if (!added.has(name)) errors.push(`[${name}] is never added by an event`);
  }
  const spawns = byFile['spawns.ini'] || {};
  for (const [name, section] of Object.entries(spawns)) {
    if (!name.startsWith('Spawn')) errors.push(`spawns.ini section [${name}] must start with Spawn`);
    if (!section.keys.monster) errors.push(`[${name}] must define lowercase monster=Monster...`);
    if (!Number.isFinite(Number(section.keys.xposition)) || !Number.isFinite(Number(section.keys.yposition))) errors.push(`[${name}] must define numeric xposition and yposition`);
    if (!added.has(name)) errors.push(`[${name}] is never added by an event`);
  }
  const events = byFile['events.ini'] || {};
  if (!Object.keys(events).length) errors.push('events.ini must define [EventStart] and scenario events');
  for (const [name, section] of Object.entries(events)) {
    if (!name.startsWith('Event')) errors.push(`events.ini section [${name}] must start with Event`);
    if (!Object.prototype.hasOwnProperty.call(section.keys, 'display')) errors.push(`[${name}] must define lowercase display=true or display=false`);
    const buttons = Number(section.keys.buttons || 0);
    if (section.keys.display === 'true' && buttons > 0 && !new RegExp(`^qst:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.text,`, 'm').test(localization)) warnings.push(`[${name}] is missing qst:${name}.text localization`);
  }
  if (!String((sections.EventStart || { keys: {} }).keys.trigger || '').includes('EventStart')) errors.push('[EventStart] must define trigger=EventStart');
  if (!Object.values(events).some((section) => String(section.keys.operations || '').includes('$end,=,1'))) errors.push('Scenario must contain a terminal event with operations=$end,=,1');
  if (catalog) {
    const declaredPacks = new Set(String(quest.keys.packs || '').split(/\s+/).filter(Boolean));
    const selectedPacks = new Set(catalog.selectedPackIds);
    for (const pack of declaredPacks) if (!selectedPacks.has(pack)) errors.push(`[Quest] declares unselected pack ${pack}`);
    for (const pack of selectedPacks) if (!declaredPacks.has(pack)) errors.push(`[Quest] is missing selected pack ${pack}`);
    const requireId = (type, id, sectionName, key) => { if (id && !containsCatalog(catalog, type, id)) errors.push(`[${sectionName}] ${key} references unavailable ${type} id ${id}`); };
    for (const [name, section] of Object.entries(sections)) {
      if (section.keys.side) requireId('tileSides', section.keys.side, name, 'side');
      if (section.keys.monster) requireId('monsters', section.keys.monster, name, 'monster');
      if (section.keys.itemname) requireId('items', section.keys.itemname, name, 'itemname');
      if (section.keys.type && /^Token/.test(section.keys.type)) requireId('tokens', section.keys.type, name, 'type');
      if (section.keys.image && /^Image/.test(section.keys.image)) requireId('images', section.keys.image, name, 'image');
      if (section.keys.audio && /^Audio/.test(section.keys.audio)) requireId('audio', section.keys.audio, name, 'audio');
    }
  }
  return { errors, warnings, files };
}
function containsCatalog(catalog, type, id) { return (catalog[type] || []).some((item) => item.id === id); }
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const local = []; const central = []; let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name); const data = Buffer.from(value); const crc = crc32(data); const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26); local.push(header, filename, data);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42); central.push(entry, filename); offset += header.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central); const body = Buffer.concat(local); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(body.length, 16); return Buffer.concat([body, directory, end]);
}
function packageQuest(name, files, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const safeName = String(name || 'scenario').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'scenario';
  const output = path.join(directory, `${safeName}-${Date.now()}-${Math.random().toString(16).slice(2)}.valkyrie`);
  // Ensure all values are Buffers for the zip function (cover.jpg arrives as Buffer, text files as strings).
  const normalised = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(String(v))]));
  fs.writeFileSync(output, zip(normalised));
  return output;
}

function readZipTextEntries(file, include = (name) => name.endsWith('.ini') || /^Localization\.[^.]+\.txt$/.test(name)) {
  const archive = fs.readFileSync(file);
  const endSignature = 0x06054b50; let end = -1;
  for (let index = archive.length - 22; index >= Math.max(0, archive.length - 65557); index--) if (archive.readUInt32LE(index) === endSignature) { end = index; break; }
  if (end < 0) throw new Error('Archive does not contain a ZIP end record');
  const entries = archive.readUInt16LE(end + 10); const directoryOffset = archive.readUInt32LE(end + 16); let cursor = directoryOffset; let total = 0; const result = {};
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Archive contains an invalid ZIP directory entry');
    const flags = archive.readUInt16LE(cursor + 8); const method = archive.readUInt16LE(cursor + 10); const compressedSize = archive.readUInt32LE(cursor + 20); const size = archive.readUInt32LE(cursor + 24); const nameLength = archive.readUInt16LE(cursor + 28); const extraLength = archive.readUInt16LE(cursor + 30); const commentLength = archive.readUInt16LE(cursor + 32); const localOffset = archive.readUInt32LE(cursor + 42); const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!include(name) || name.endsWith('/')) continue;
    if ((flags & 1) !== 0 || ![0, 8].includes(method)) throw new Error(`Archive entry ${name} uses unsupported ZIP compression`);
    if (size > 2 * 1024 * 1024 || total + size > 8 * 1024 * 1024) throw new Error('Archive text entries exceed the analysis limit');
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Archive entry ${name} has an invalid ZIP local header`);
    const localNameLength = archive.readUInt16LE(localOffset + 26); const localExtraLength = archive.readUInt16LE(localOffset + 28); const dataOffset = localOffset + 30 + localNameLength + localExtraLength; const compressed = archive.subarray(dataOffset, dataOffset + compressedSize); const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    if (data.length !== size) throw new Error(`Archive entry ${name} has an invalid uncompressed size`);
    result[name] = data.toString('utf8'); total += size;
  }
  return result;
}

module.exports = { safeFiles, parseIni, validateQuest, packageQuest, readZipTextEntries };
