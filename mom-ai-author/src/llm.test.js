'use strict';
process.env.OPENCODE_API_KEY = 'test-key';
process.env.HF_TOKEN = 'hf-test-key';
process.env.GROQ_API_KEY = 'groq-test-key';
process.env.GEMINI_API_KEY = 'gemini-test-key';
process.env.OLLAMA_API_KEY = 'ollama-test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const { complete, retryable } = require('./llm');
const zenCandidates = [{ provider: 'zen', model: 'nemotron-3-ultra-free', key: 'zen/nemotron-3-ultra-free' }, { provider: 'zen', model: 'hy3-free', key: 'zen/hy3-free' }];

test('tries the next free model after a temporary failure', async () => {
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    const model = JSON.parse(options.body).model;
    attempted.push(model);
    if (model === 'nemotron-3-ultra-free') return { ok: false, status: 429 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) };
  };
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'user', content: 'test' }], { candidates: zenCandidates, ignoreCooldown: true, fetchImpl, maxTokens: 100 });
  assert.deepEqual(attempted, ['nemotron-3-ultra-free', 'hy3-free']);
  assert.equal(result.model, 'hy3-free');
  assert.equal(result.fallbacks[0].model, 'nemotron-3-ultra-free');
});

test('falls through when a model ignores the response schema', async () => {
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    const model = JSON.parse(options.body).model;
    attempted.push(model);
    const content = model === 'nemotron-3-ultra-free' ? 'I will ask a question next.' : '{"state":"question"}';
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'user', content: 'test' }], { candidates: zenCandidates, ignoreCooldown: true, fetchImpl, accept: (text) => text.startsWith('{') });
  assert.deepEqual(attempted, ['nemotron-3-ultra-free', 'hy3-free']);
  assert.equal(result.model, 'hy3-free');
});

test('fails over between configured hosted providers', async () => {
  const candidates = [{ provider: 'huggingface', model: 'openai/gpt-oss-120b:fastest', key: 'huggingface/openai/gpt-oss-120b:fastest' }, { provider: 'groq', model: 'openai/gpt-oss-20b', key: 'groq/openai/gpt-oss-20b' }];
  const fetchImpl = async (url) => url.includes('router.huggingface.co')
    ? { ok: false, status: 400, headers: { get: () => null } }
    : { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) };
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'user', content: 'test' }], { candidates, ignoreCooldown: true, fetchImpl });
  assert.equal(result.key, 'groq/openai/gpt-oss-20b');
  assert.equal(result.fallbacks[0].provider, 'huggingface');
});

test('uses Gemini native JSON mode', async () => {
  let request;
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'system', content: 'Return JSON' }, { role: 'user', content: 'test' }], { candidates: [{ provider: 'gemini', model: 'gemini-test', key: 'gemini/gemini-test' }], ignoreCooldown: true, fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"state":"question"}' }] } }] }) }; } });
  assert.equal(result.key, 'gemini/gemini-test');
  assert.ok(request.url.includes(':generateContent?key='));
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
});

test('uses Ollama Cloud native chat API', async () => {
  let request;
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'user', content: 'test' }], { candidates: [{ provider: 'ollama', model: 'gpt-oss:120b', key: 'ollama/gpt-oss:120b' }], ignoreCooldown: true, fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ message: { content: '{"state":"question"}' } }) }; } });
  assert.equal(result.key, 'ollama/gpt-oss:120b');
  assert.ok(request.url.endsWith('/api/chat'));
  assert.equal(request.body.stream, false);
  assert.equal(request.body.think, false);
  assert.equal(request.body.format, 'json');
});

test('falls through after a provider rejects a large payload', () => assert.equal(retryable({ status: 413 }), true));
