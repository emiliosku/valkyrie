'use strict';

const { PROVIDERS, providerCandidates } = require('./policy');

function parseJson(text) { const match = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i); try { return JSON.parse((match ? match[1] : text).trim()); } catch (_) { return null; } }
function completionText(data) { const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content; if (typeof content === 'string') return content; if (Array.isArray(content)) return content.map((part) => part.text || part.content || '').join(''); return ''; }
function providerError(message, status, retryAfterMs, detail) { const error = new Error(message); error.status = status; error.retryAfterMs = retryAfterMs; error.detail = detail; return error; }
function retryAfter(response) { const value = response.headers && response.headers.get && response.headers.get('retry-after'); return value && Number.isFinite(Number(value)) ? Number(value) * 1000 : undefined; }
async function responseDetail(response) { if (!response.text) return ''; return (await response.text()).replace(/\s+/g, ' ').slice(0, 500); }
async function openAiChat(candidate, messages, options, fetchImpl) {
  const config = PROVIDERS[candidate.provider]; const key = process.env[config.key]; if (!key) throw providerError(`${config.key} is not set`, 401);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: candidate.model, messages, temperature: options.temperature || 0.3, max_tokens: options.maxTokens || 1600 }) });
    if (!response.ok) throw providerError(`${candidate.provider} request failed with ${response.status}`, response.status, retryAfter(response), await responseDetail(response));
    const text = completionText(await response.json()); if (!text) throw providerError(`${candidate.provider} returned an empty completion`, 502); return text;
  } catch (error) { if (error.name === 'AbortError') throw providerError(`${candidate.provider} request timed out`, 408); throw error; } finally { clearTimeout(timer); }
}
async function geminiChat(candidate, messages, options, fetchImpl) {
  const config = PROVIDERS.gemini; const key = process.env[config.key]; if (!key) throw providerError(`${config.key} is not set`, 401);
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const contents = messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), options.timeoutMs || 45000);
  try {
    const response = await fetchImpl(`${config.baseUrl}/models/${encodeURIComponent(candidate.model)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { temperature: options.temperature || 0.3, maxOutputTokens: options.maxTokens || 1600, responseMimeType: 'application/json' } }) });
    if (!response.ok) throw providerError(`gemini request failed with ${response.status}`, response.status, retryAfter(response), await responseDetail(response));
    const data = await response.json(); const text = (((data.candidates || [])[0] || {}).content || {}).parts || []; const joined = text.map((part) => part.text || '').join(''); if (!joined) throw providerError('gemini returned an empty completion', 502); return joined;
  } catch (error) { if (error.name === 'AbortError') throw providerError('gemini request timed out', 408); throw error; } finally { clearTimeout(timer); }
}
async function callCandidate(candidate, messages, options, fetchImpl) { return candidate.provider === 'gemini' ? geminiChat(candidate, messages, options, fetchImpl) : openAiChat(candidate, messages, options, fetchImpl); }
// HTTP 400 from a remote provider often means that its current model does not
// support this request shape. Local validation errors never reach this layer.
function retryable(error) { return !error.status || [400, 408, 429, 500, 502, 503, 504].includes(error.status); }
const cooldowns = new Map();
function coolingDown(candidate) { return (cooldowns.get(candidate.key) || 0) > Date.now(); }
function cool(candidate, error) { if (retryable(error)) cooldowns.set(candidate.key, Date.now() + (error.retryAfterMs || (error.status === 429 ? 60000 : 30000))); }
async function complete(store, messages, options = {}) {
  if (options.mock) return { text: options.mockText(), provider: 'mock', model: 'mock', key: 'mock', fallbacks: [] };
  const candidates = options.candidates || await providerCandidates(store, options.fetchImpl || fetch); if (!candidates.length) throw providerError('No configured verified-free provider model is available', 503);
  const fallbacks = [];
  for (const candidate of candidates) {
    if (!options.ignoreCooldown && coolingDown(candidate)) { fallbacks.push({ provider: candidate.provider, model: candidate.model, reason: 'cooldown' }); continue; }
    const started = Date.now();
    try {
      console.info(`[mom-ai-author:${options.stage || 'completion'}] trying ${candidate.key}`);
      const text = await callCandidate(candidate, messages, options, options.fetchImpl || fetch);
      if (options.accept && !options.accept(text)) throw providerError(`${candidate.provider} returned an unusable structured response`, 502);
      return { text, provider: candidate.provider, model: candidate.model, key: candidate.key, fallbacks, latencyMs: Date.now() - started };
    } catch (error) {
      if (!retryable(error)) throw error; cool(candidate, error); console.warn(`[mom-ai-author:${options.stage || 'completion'}] ${candidate.key} failed with ${error.status || 'network'}${error.detail ? `: ${error.detail}` : ''}; trying the next candidate`); fallbacks.push({ provider: candidate.provider, model: candidate.model, reason: error.message });
    }
  }
  throw providerError('All configured verified-free provider models are temporarily unavailable', 503);
}

module.exports = { parseJson, complete, callCandidate, retryable, completionText, providerError };
