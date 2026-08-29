'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.MOM_AI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mom-ai-author-server-test-'));
const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('./server');

async function post(base, pathname, payload) {
  const response = await fetch(`${base}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
test('local HTTP mock flow produces a downloadable package', async (context) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const catalog = await fetch(`${base}/v1/catalog`);
  assert.equal(catalog.status, 200);
  assert.ok((await catalog.json()).packs.some((pack) => pack.id === 'MoMBase'));
  const annotator = await fetch(`${base}/annotator`);
  assert.equal(annotator.status, 200);
  assert.match(await annotator.text(), /Tile Port Drafting Table/);
  const connector = await fetch(`${base}/connector`);
  assert.equal(connector.status, 200);
  assert.match(await connector.text(), /Tile Connection Reviewer/);
  const connectorLayout = await fetch(`${base}/connector-layout.js`);
  assert.equal(connectorLayout.status, 200);
  assert.match(await connectorLayout.text(), /function placements/);
  const tilePorts = await fetch(`${base}/v1/tile-ports`);
  assert.equal(tilePorts.status, 200);
  assert.equal(typeof (await tilePorts.json()).tiles, 'object');
  const oversized = await fetch(`${base}/v1/interviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea: 'x'.repeat(33 * 1024) }) });
  assert.equal(oversized.status, 413);
  const started = await post(base, '/v1/interviews', { idea: 'An archive beneath the manor', selectedPacks: ['RN'], mock: true });
  assert.equal(started.status, 201);
  const ready = await post(base, `/v1/interviews/${started.body.id}/answers`, { answerId: 'gothic' });
  assert.equal(ready.body.state, 'review');
  const reviewed = await post(base, `/v1/interviews/${started.body.id}/review`, { approved: true });
  assert.equal(reviewed.body.approved, true);
  const generated = await post(base, `/v1/interviews/${started.body.id}/generate`, {});
  assert.equal(generated.status, 200);
  const download = await fetch(`${base}${generated.body.download}`);
  assert.equal(download.status, 200);
  assert.equal((await download.arrayBuffer()).byteLength > 22, true);
});
