'use strict';

const fs = require('fs');
const path = require('path');

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
  const errors = []; const warnings = []; const sections = {};
  for (const [file, text] of Object.entries(files)) for (const [name, section] of Object.entries(parseIni(text))) {
    if (sections[name]) errors.push(`Duplicate section [${name}]`); else sections[name] = { ...section, file };
  }
  const quest = sections.Quest;
  if (!quest) return { errors: ['Missing [Quest] section'], warnings };
  if (Number(quest.keys.format) < 4 || Number(quest.keys.format) > 21 || !Number.isInteger(Number(quest.keys.format))) errors.push('Quest format must be an integer from 4 through 21');
  if (quest.keys.type !== 'MoM') errors.push('Quest type must be MoM');
  if (!files['Localization.English.txt']) errors.push('Missing Localization.English.txt');
  if (!sections.EventStart) errors.push('Missing [EventStart] section');
  for (const listed of (sections.QuestData || { bare: [] }).bare) if (!files[listed]) errors.push(`[QuestData] references missing ${listed}`);
  for (const [name, section] of Object.entries(sections)) {
    if (['Quest', 'QuestData', 'QuestText'].includes(name)) continue;
    const count = Number(section.keys.buttons || 0);
    if (!Number.isInteger(count) || count < 0) errors.push(`[${name}] has invalid buttons value`);
    for (let i = 1; i <= count; i++) if (!section.keys[`event${i}`]) errors.push(`[${name}] is missing event${i}`);
    for (const key of Object.keys(section.keys)) if (/^event\d+$/.test(key)) {
      const target = section.keys[key].split(',')[0].trim();
      if (target && !sections[target]) errors.push(`[${name}] references undefined event ${target}`);
    }
  }
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
function packageQuest(name, files, directory) { fs.mkdirSync(directory, { recursive: true }); const safeName = String(name || 'scenario').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'scenario'; const output = path.join(directory, `${safeName}-${Date.now()}-${Math.random().toString(16).slice(2)}.valkyrie`); fs.writeFileSync(output, zip(files)); return output; }

module.exports = { safeFiles, parseIni, validateQuest, packageQuest };
