'use strict';

const { rankedAvailableModels, ZEN_BASE_URL } = require('./policy');

function parseJson(text) {
  const match = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  try { return JSON.parse((match ? match[1] : text).trim()); } catch (_) { return null; }
}
function providerError(message, status) { const error = new Error(message); error.status = status; return error; }
async function callChat(model, messages, temperature, timeoutMs, maxTokens, fetchImpl = fetch) {
  const key = process.env.OPENCODE_API_KEY;
  if (!key) throw providerError('OPENCODE_API_KEY is not set', 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${ZEN_BASE_URL}/chat/completions`, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!response.ok) throw providerError(`Zen request failed with ${response.status}`, response.status);
    const data = await response.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw providerError('Zen returned an empty completion', 502);
    return text;
  } catch (error) {
    if (error.name === 'AbortError') throw providerError('Zen request timed out', 408);
    throw error;
  } finally { clearTimeout(timer); }
}
function retryable(error) { return !error.status || [408, 429, 500, 502, 503, 504].includes(error.status); }
async function complete(store, messages, options = {}) {
  if (options.mock) return { text: options.mockText(), model: 'mock', fallbacks: [] };
  const candidates = await rankedAvailableModels(store, options.fetchImpl);
  if (!candidates.length) throw providerError('No verified free Zen model is currently available', 503);
  const fallbacks = [];
  for (const model of candidates) {
    const started = Date.now();
    try {
      console.info(`[mom-ai-author] trying ${model}`);
      return { text: await callChat(model, messages, options.temperature || 0.3, options.timeoutMs || 45000, options.maxTokens || 1600, options.fetchImpl || fetch), model, fallbacks, latencyMs: Date.now() - started };
    }
    catch (error) {
      if (!retryable(error)) throw error;
      console.warn(`[mom-ai-author] ${model} failed with ${error.status || 'network'}; trying the next candidate`);
      fallbacks.push({ model, reason: error.message });
    }
  }
  throw providerError('All verified free Zen models are temporarily unavailable', 503);
}

module.exports = { parseJson, complete, callChat, retryable };
