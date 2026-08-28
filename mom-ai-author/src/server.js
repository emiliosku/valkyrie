'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const interview = require('./interview');
const { packageQuest } = require('./quest');
const { loadCatalog, selectedCatalog } = require('./catalog');
const { TARGET_PACKS, createTileStore } = require('./tiles');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..', 'public');
const outDir = path.join(store.dataDir, 'out');
const downloads = new Map();
const tiles = createTileStore();
fs.rmSync(outDir, { recursive: true, force: true });
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
function text(res, status, content, type) { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(content); }
function body(req) { return new Promise((resolve, reject) => { const chunks = []; let size = 0; let finished = false; const fail = (message, status) => { if (finished) return; finished = true; const error = new Error(message); error.status = status; reject(error); }; req.on('data', (chunk) => { if (finished) return; size += chunk.length; if (size > 32 * 1024) { req.resume(); return fail('Request body is too large', 413); } chunks.push(chunk); }); req.on('end', () => { if (finished) return; try { finished = true; resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (_) { fail('Request body must be valid JSON', 400); } }); req.on('error', (error) => fail(error.message, error.status || 400)); }); }
function clearExpiredDownloads() { for (const [token, item] of downloads) if (item.expiresAt < Date.now()) { fs.rmSync(item.file, { force: true }); downloads.delete(token); } }
function download(result) { clearExpiredDownloads(); const files = result.coverImage ? { ...result.validation.files, 'cover.jpg': result.coverImage } : result.validation.files; const file = packageQuest(result.name, files, outDir); const token = crypto.randomUUID(); downloads.set(token, { file, expiresAt: Date.now() + 15 * 60 * 1000 }); return `/v1/download/${token}`; }
async function route(req, res) {
  const url = new URL(req.url, `http://${host}`); const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'GET' && url.pathname === '/') return text(res, 200, fs.readFileSync(path.join(publicDir, 'index.html')), 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/app.js') return text(res, 200, fs.readFileSync(path.join(publicDir, 'app.js')), 'application/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/annotator') return text(res, 200, fs.readFileSync(path.join(publicDir, 'annotator.html')), 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/annotator.js') return text(res, 200, fs.readFileSync(path.join(publicDir, 'annotator.js')), 'application/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/connector') return text(res, 200, fs.readFileSync(path.join(publicDir, 'connector.html')), 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/connector.js') return text(res, 200, fs.readFileSync(path.join(publicDir, 'connector.js')), 'application/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/v1/health') return json(res, 200, { protocol: 1, service: 'mom-ai-author' });
  if (req.method === 'GET' && url.pathname === '/v1/catalog') return json(res, 200, loadCatalog());
  if (req.method === 'GET' && url.pathname === '/v1/tile-ports') return json(res, 200, tiles.load());
  if (req.method === 'GET' && url.pathname === '/v1/connections') return json(res, 200, tiles.loadConnections());
  if (req.method === 'GET' && url.pathname === '/v1/tiles') { const requested = url.searchParams.get('packs'); const packs = requested ? requested.split(',').filter((pack) => TARGET_PACKS.includes(pack)) : TARGET_PACKS; return json(res, 200, { packs, tiles: tiles.list(loadCatalog(), packs) }); }
  if (req.method === 'GET' && url.pathname === '/v1/connection-candidates') { const requested = url.searchParams.get('packs'); const packs = requested ? requested.split(',').filter((pack) => TARGET_PACKS.includes(pack)) : TARGET_PACKS; return json(res, 200, { packs, candidates: tiles.connectionCandidates(loadCatalog(), packs) }); }
  if (req.method === 'GET' && parts.length === 4 && parts[0] === 'v1' && parts[1] === 'tiles' && parts[3] === 'image') { const file = tiles.image(loadCatalog(), parts[2]); return text(res, 200, fs.readFileSync(file), 'image/vnd-ms.dds'); }
  if (req.method === 'PUT' && parts.length === 3 && parts[0] === 'v1' && parts[1] === 'tile-ports') return json(res, 200, tiles.setPorts(loadCatalog(), parts[2], await body(req)));
  if (req.method === 'PUT' && parts.length === 3 && parts[0] === 'v1' && parts[1] === 'connections') return json(res, 200, tiles.saveConnection(loadCatalog(), decodeURIComponent(parts[2]), await body(req)));
  if (req.method === 'POST' && url.pathname === '/v1/interviews') { const input = await body(req); const idea = String(input.idea || '').trim(); if (!idea || idea.length > 4000) return json(res, 400, { error: 'Provide an idea up to 4000 characters.' }); if (input.selectedPacks !== undefined && (!Array.isArray(input.selectedPacks) || input.selectedPacks.length > 18 || input.selectedPacks.some((pack) => typeof pack !== 'string'))) return json(res, 400, { error: 'selectedPacks must be an array of MoM pack IDs.' }); return json(res, 201, await interview.createInterview(idea, input.mock === true, store, selectedCatalog(loadCatalog(), input.selectedPacks))); }
  if (req.method === 'POST' && parts.length === 4 && parts[0] === 'v1' && parts[1] === 'interviews' && parts[3] === 'answers') { const input = await body(req); return json(res, 200, await interview.answer(parts[2], input.answerId, input.customResponse, store)); }
  if (req.method === 'POST' && parts.length === 4 && parts[0] === 'v1' && parts[1] === 'interviews' && parts[3] === 'review') { const input = await body(req); return json(res, 200, await interview.review(parts[2], input, store)); }
  if (req.method === 'POST' && parts.length === 4 && parts[0] === 'v1' && parts[1] === 'interviews' && parts[3] === 'generate') { const result = await interview.generate(parts[2], store); if (result.validation.errors.length) return json(res, 422, { error: 'Generated quest did not pass validation.', validation: result.validation }); return json(res, 200, { name: result.name, validation: result.validation, download: download(result), files: result.validation.files }); }
  if (req.method === 'GET' && parts.length === 3 && parts[0] === 'v1' && parts[1] === 'download') { clearExpiredDownloads(); const item = downloads.get(parts[2]); if (!item) return text(res, 404, 'not found', 'text/plain'); res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${path.basename(item.file)}"` }); return fs.createReadStream(item.file).pipe(res); }
  return json(res, 404, { error: 'Not found' });
}
setInterval(clearExpiredDownloads, 60 * 1000).unref();
const server = http.createServer((req, res) => route(req, res).catch((error) => {
  const status = error.status === 401 ? 503 : ([400, 408, 413, 429, 502, 503, 504].includes(error.status) ? error.status : 500);
  json(res, status, { error: error.message });
}));
if (require.main === module) server.listen(port, host, () => console.log(`MoM AI Author listening at http://${host}:${port}`));
module.exports = { server, route };
