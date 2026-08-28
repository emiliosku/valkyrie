'use strict';
process.env.HF_TOKEN = 'hf-test-key';
process.env.GROQ_API_KEY = 'groq-test-key';
process.env.GEMINI_API_KEY = 'gemini-test-key';
process.env.OLLAMA_API_KEY = 'ollama-test-key';
process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const { complete, retryable } = require('./llm');
const { modelsFor, providerCandidates } = require('./policy');
const groqCandidates = [{ provider: 'groq', model: 'openai/gpt-oss-120b', key: 'groq/openai/gpt-oss-120b' }, { provider: 'groq', model: 'openai/gpt-oss-20b', key: 'groq/openai/gpt-oss-20b' }];

test('tries the next free model after a temporary failure', async () => {
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    const model = JSON.parse(options.body).model;
    attempted.push(model);
    if (model === 'openai/gpt-oss-120b') return { ok: false, status: 429 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) };
  };
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates: groqCandidates, ignoreCooldown: true, fetchImpl, maxTokens: 100 });
  assert.deepEqual(attempted, ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.equal(result.fallbacks[0].model, 'openai/gpt-oss-120b');
});

test('falls through when a model ignores the response schema', async () => {
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    const model = JSON.parse(options.body).model;
    attempted.push(model);
    const content = model === 'openai/gpt-oss-120b' ? 'I will ask a question next.' : '{"state":"question"}';
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates: groqCandidates, ignoreCooldown: true, fetchImpl, accept: (text) => text.startsWith('{') });
  assert.deepEqual(attempted, ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  assert.equal(result.model, 'openai/gpt-oss-20b');
});

test('fails over between configured hosted providers', async () => {
  const candidates = [{ provider: 'huggingface', model: 'openai/gpt-oss-120b:fastest', key: 'huggingface/openai/gpt-oss-120b:fastest' }, { provider: 'groq', model: 'openai/gpt-oss-20b', key: 'groq/openai/gpt-oss-20b' }];
  const fetchImpl = async (url) => url.includes('router.huggingface.co')
    ? { ok: false, status: 400, headers: { get: () => null } }
    : { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) };
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates, ignoreCooldown: true, fetchImpl });
  assert.equal(result.key, 'groq/openai/gpt-oss-20b');
  assert.equal(result.fallbacks[0].provider, 'huggingface');
});

test('uses Gemini native JSON mode', async () => {
  let request;
  const result = await complete({}, [{ role: 'system', content: 'Return JSON' }, { role: 'user', content: 'test' }], { candidates: [{ provider: 'gemini', model: 'gemini-test', key: 'gemini/gemini-test' }], ignoreCooldown: true, fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"state":"question"}' }] } }] }) }; } });
  assert.equal(result.key, 'gemini/gemini-test');
  assert.ok(request.url.includes(':generateContent?key='));
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
});

test('uses Ollama Cloud native chat API', async () => {
  let request;
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates: [{ provider: 'ollama', model: 'gpt-oss:120b', key: 'ollama/gpt-oss:120b' }], ignoreCooldown: true, fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ message: { content: '{"state":"question"}' } }) }; } });
  assert.equal(result.key, 'ollama/gpt-oss:120b');
  assert.ok(request.url.endsWith('/api/chat'));
  assert.equal(request.body.stream, false);
  assert.equal(request.body.think, false);
  assert.equal(request.body.format, 'json');
  assert.ok(request.body.options.num_predict > 1600);
});

test('uses OpenRouter free-only router with JSON mode', async () => {
  let request;
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates: [{ provider: 'openrouter', model: 'openrouter/free', key: 'openrouter/openrouter/free' }], ignoreCooldown: true, fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) }; } });
  assert.equal(result.key, 'openrouter/openrouter/free');
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(request.body.response_format, { type: 'json_object' });
});

test('skips the remaining provider models after a timeout', async () => {
  const attempted = [];
  const candidates = [
    { provider: 'ollama', model: 'nemotron-3-ultra', key: 'ollama/nemotron-3-ultra' },
    { provider: 'ollama', model: 'gpt-oss:120b', key: 'ollama/gpt-oss:120b' },
    { provider: 'openrouter', model: 'openrouter/free', key: 'openrouter/openrouter/free' },
  ];
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates, fetchImpl: async (url, options) => {
    const model = JSON.parse(options.body).model; attempted.push(model);
    if (model === 'nemotron-3-ultra') return { ok: false, status: 408, headers: { get: () => null } };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) };
  } });
  assert.deepEqual(attempted, ['nemotron-3-ultra', 'openrouter/free']);
  assert.equal(result.key, 'openrouter/openrouter/free');
});

test('extracts Ollama thinking content when content is empty', async () => {
  const result = await complete({}, [{ role: 'user', content: 'test' }], { candidates: [{ provider: 'ollama', model: 'gpt-oss:120b', key: 'ollama/gpt-oss:120b' }], ignoreCooldown: true, fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: '', thinking: '{"state":"question","question":"test?","options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}' } }) }) });
  assert.equal(result.text.includes('"state":"question"'), true);
});

test('falls through after a provider rejects a large payload', () => assert.equal(retryable({ status: 413 }), true));

test('uses the quality-oriented Ollama Cloud cold-start order', () => {
  assert.deepEqual(modelsFor('ollama'), ['nemotron-3-ultra', 'gpt-oss:120b', 'minimax-m3', 'nemotron-3-super', 'gemma4:31b', 'nemotron-3-nano:30b', 'gpt-oss:20b']);
});

test("uses OpenRouter's free-only router by default", () => assert.deepEqual(modelsFor('openrouter'), ['openrouter/free']));

test('trims Groq to capable models only', () => assert.deepEqual(modelsFor('groq'), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']));

test('interview stage routes to Groq first', async () => {
  const candidates = await providerCandidates({}, async (url) => {
    if (url.includes('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'nemotron-3-ultra' }] }) };
    return { ok: false, status: 404 };
  }, 'interview');
  const providers = candidates.map((c) => c.provider);
  assert.equal(providers[0], 'groq');
  assert.ok(providers.includes('ollama'));
});

test('generation stage routes to Ollama first', async () => {
  const candidates = await providerCandidates({}, async (url) => {
    if (url.includes('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'nemotron-3-ultra' }] }) };
    return { ok: false, status: 404 };
  }, 'generation');
  const providers = candidates.map((c) => c.provider);
  assert.equal(providers[0], 'ollama');
});
