'use strict';
process.env.OPENCODE_API_KEY = 'test-key';
const test = require('node:test');
const assert = require('node:assert/strict');
const { complete } = require('./llm');

test('tries the next free model after a temporary failure', async () => {
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'hy3-free' }, { id: 'nemotron-3-ultra-free' }] }) };
    const model = JSON.parse(options.body).model;
    attempted.push(model);
    if (model === 'nemotron-3-ultra-free') return { ok: false, status: 429 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"state":"question"}' } }] }) };
  };
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'user', content: 'test' }], { fetchImpl, maxTokens: 100 });
  assert.deepEqual(attempted, ['nemotron-3-ultra-free', 'hy3-free']);
  assert.equal(result.model, 'hy3-free');
  assert.equal(result.fallbacks[0].model, 'nemotron-3-ultra-free');
});

test('falls through when a model ignores the response schema', async () => {
  const attempted = [];
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'hy3-free' }, { id: 'nemotron-3-ultra-free' }] }) };
    const model = JSON.parse(options.body).model;
    attempted.push(model);
    const content = model === 'nemotron-3-ultra-free' ? 'I will ask a question next.' : '{"state":"question"}';
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const result = await complete({ modelScores: () => ({}) }, [{ role: 'user', content: 'test' }], { fetchImpl, accept: (text) => text.startsWith('{') });
  assert.deepEqual(attempted, ['nemotron-3-ultra-free', 'hy3-free']);
  assert.equal(result.model, 'hy3-free');
});
