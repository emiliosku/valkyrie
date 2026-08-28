'use strict';

const POLICY_VERSION = 3;
const PROVIDER_ORDER = (process.env.MOM_AI_PROVIDER_ORDER || 'ollama,openrouter,huggingface,groq,zen,gemini').split(',').map((id) => id.trim()).filter(Boolean);
const DEFAULT_MODELS = {
  zen: ['nemotron-3-ultra-free', 'hy3-free', 'mimo-v2.5-free', 'big-pickle', 'x-preview-f-free', 'nemotron-3.5-lightning-free'],
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
  // Hugging Face and Gemini do not publish a universally stable zero-cost catalog.
  // They are enabled only after an operator explicitly verifies a free model.
  huggingface: [],
  gemini: [],
  // OpenRouter maintains this free-only router and performs its own upstream
  // failover, avoiding an application-maintained, quickly stale model list.
  openrouter: ['openrouter/free'],
  // Fixed preference order; local ratings do not affect provider selection.
  ollama: [
    'nemotron-3-ultra',
    'gpt-oss:120b',
    'minimax-m3',
    'nemotron-3-super',
    'gemma4:31b',
    'nemotron-3-nano:30b',
    'gpt-oss:20b',
  ],
};
const ENV_MODEL_NAMES = { zen: 'MOM_AI_FREE_MODELS', groq: 'MOM_AI_GROQ_FREE_MODELS', huggingface: 'MOM_AI_HF_FREE_MODELS', gemini: 'MOM_AI_GEMINI_FREE_MODELS', ollama: 'MOM_AI_OLLAMA_FREE_MODELS', openrouter: 'MOM_AI_OPENROUTER_FREE_MODELS' };
const PROVIDERS = {
  ollama: { key: 'OLLAMA_API_KEY', baseUrl: (process.env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/$/, '') },
  openrouter: { key: 'OPENROUTER_API_KEY', baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '') },
  huggingface: { key: 'HF_TOKEN', baseUrl: (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '') },
  groq: { key: 'GROQ_API_KEY', baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '') },
  zen: { key: 'OPENCODE_API_KEY', baseUrl: (process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '') },
  gemini: { key: 'GEMINI_API_KEY', baseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '') },
};
let zenCatalog = { fetchedAt: 0, ids: new Set() };
let ollamaCatalog = { fetchedAt: 0, ids: new Set() };

function modelsFor(provider) { return (process.env[ENV_MODEL_NAMES[provider]] || DEFAULT_MODELS[provider].join(',')).split(',').map((id) => id.trim()).filter(Boolean); }
function isConfigured(provider) { return !!(PROVIDERS[provider] && process.env[PROVIDERS[provider].key]); }
async function zenAvailableModels(fetchImpl = fetch) {
  if (Date.now() - zenCatalog.fetchedAt < 15 * 60 * 1000 && zenCatalog.ids.size) return zenCatalog.ids;
  const response = await fetchImpl(`${PROVIDERS.zen.baseUrl}/models`);
  if (!response.ok) throw new Error(`Zen model catalog returned ${response.status}`);
  const payload = await response.json();
  zenCatalog = { fetchedAt: Date.now(), ids: new Set((payload.data || []).map((model) => model.id)) };
  return zenCatalog.ids;
}
async function ollamaAvailableModels(fetchImpl = fetch) {
  if (Date.now() - ollamaCatalog.fetchedAt < 15 * 60 * 1000 && ollamaCatalog.ids.size) return ollamaCatalog.ids;
  const response = await fetchImpl(`${PROVIDERS.ollama.baseUrl}/api/tags`, { headers: { authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } });
  if (!response.ok) throw new Error(`Ollama model catalog returned ${response.status}`);
  const payload = await response.json();
  ollamaCatalog = { fetchedAt: Date.now(), ids: new Set((payload.models || []).map((model) => model.name)) };
  return ollamaCatalog.ids;
}
async function providerCandidates(store, fetchImpl = fetch) {
  const candidates = [];
  for (const provider of PROVIDER_ORDER) {
    if (!PROVIDERS[provider] || !isConfigured(provider)) continue;
    let models = modelsFor(provider);
    if (provider === 'zen' || provider === 'ollama') {
      try { const available = provider === 'zen' ? await zenAvailableModels(fetchImpl) : await ollamaAvailableModels(fetchImpl); models = models.filter((model) => available.has(model)); }
      catch (error) { console.warn(`[mom-ai-author] ${provider} catalog unavailable: ${error.message}`); models = []; }
    }
    candidates.push(...models.map((model) => ({ provider, model, key: `${provider}/${model}` })));
  }
  return candidates;
}

module.exports = { POLICY_VERSION, PROVIDERS, PROVIDER_ORDER, modelsFor, providerCandidates };
