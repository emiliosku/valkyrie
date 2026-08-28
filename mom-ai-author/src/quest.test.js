'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MOM_AI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-ai-author-test-'));
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateQuest } = require('./quest');
const { createInterview, answer, review, generate } = require('./interview');
const { loadCatalog, selectedCatalog } = require('./catalog');
const store = require('./store');

test('rejects unsafe package filenames', () => assert.throws(() => validateQuest({ '../evil.ini': '' }), /Unsupported/));
test('requires a supported format and EventStart', () => {
  const result = validateQuest({
    'quest.ini': '[Quest]\nformat=22\ntype=MoM\n\n[QuestData]\nevents.ini\n',
    'events.ini': '[EventElsewhere]\nbuttons=0\n',
    'Localization.English.txt': '.,English\n',
  });
  assert.ok(result.errors.some((error) => error.includes('4 through 21')));
  assert.ok(result.errors.some((error) => error.includes('EventStart')));
});
test('rejects generic INI syntax that Valkyrie cannot load', () => {
  const result = validateQuest({
    'quest.ini': '[Quest]\nformat=21\ntype=MoM\npacks=MoMBase\nname=Incorrect Schema\n',
    'tiles.ini': '[Tile1]\nId=TileSideLobby\nOrientation=0\n',
    'tokens.ini': '[TokenClue]\nId=TokenClue\nName=Clue\n',
    'events.ini': '[EventStart]\nName=EventStart\nText=Begin\nButton1=Begin\nEvent1=EventEnd\n\n[EventEnd]\nText=End\n',
    'Localization.English.txt': '.,English\n',
  }, selectedCatalog(loadCatalog(), []));
  assert.ok(result.errors.some((error) => error.includes('Missing [QuestData]')));
  assert.ok(result.errors.some((error) => error.includes('lowercase side')));
  assert.ok(result.errors.some((error) => error.includes('lowercase type')));
  assert.ok(result.errors.some((error) => error.includes('lowercase display')));
});
test('mock interview produces a valid quest after review', async () => {
  const first = await createInterview('A forgotten archive', true, store, selectedCatalog(loadCatalog(), []));
  assert.equal(first.state, 'question');
  const ready = await answer(first.id, 'gothic', '', store);
  assert.equal(ready.state, 'review');
  await review(first.id, { approved: true }, store);
  const result = await generate(first.id, store);
  assert.deepEqual(result.validation.errors, []);
  assert.ok(result.validation.files['quest.ini']);
  assert.equal(result.coverImage, undefined); // MOM_AI_IMAGE not set
});

test('cover image is embedded in package when generated', async () => {
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  // Simulate a cover already in files and quest.ini updated with image= line
  const files = { 'quest.ini': '[Quest]\nformat=21\ntype=MoM\nimage=cover.jpg\n', 'cover.jpg': fakeJpeg };
  const { packageQuest } = require('./quest');
  const os = require('os'); const tmpDir = os.tmpdir();
  const outPath = packageQuest('test-cover', files, tmpDir);
  const { execSync } = require('child_process');
  const listing = execSync(`unzip -l "${outPath}"`).toString();
  assert.ok(listing.includes('cover.jpg'), 'cover.jpg must be in the zip');
  require('fs').unlinkSync(outPath);
});
