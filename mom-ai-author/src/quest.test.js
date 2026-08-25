'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MOM_AI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-ai-author-test-'));
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateQuest } = require('./quest');
const { createInterview, answer, review, generate } = require('./interview');
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
test('mock interview produces a valid quest after review', async () => {
  const first = await createInterview('A forgotten archive', true, store);
  assert.equal(first.state, 'question');
  const ready = await answer(first.id, 'gothic', '', store);
  assert.equal(ready.state, 'review');
  await review(first.id, { approved: true, ratings: { hook: 4, atmosphere: 4, coherence: 4, agency: 4, pacing: 4, momFit: 5, finale: 4 } }, store, 1);
  const result = await generate(first.id, store, 1);
  assert.deepEqual(result.validation.errors, []);
  assert.ok(result.validation.files['quest.ini']);
});
