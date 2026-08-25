'use strict';

const POLICY_VERSION = 2;
const PROVIDER_ORDER = (process.env.MOM_AI_PROVIDER_ORDER || 'huggingface,groq,zen,gemini').split(',').map((id) => id.trim()).filter(Boolean);
const DEFAULT_MODELS = {
  zen: ['nemotron-3-ultra-free', 'hy3-free', 'mimo-v2.5-free', 'big-pickle', 'x-preview-f-free', 'nemotron-3.5-lightning-free'],
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
  // Hugging Face and Gemini do not publish a universally stable zero-cost catalog.
  // They are enabled only after an operator explicitly verifies a free model.
  huggingface: [],
  gemini: [],
};
const ENV_MODEL_NAMES = { zen: 'MOM_AI_FREE_MODELS', groq: 'MOM_AI_GROQ_FREE_MODELS', huggingface: 'MOM_AI_HF_FREE_MODELS', gemini: 'MOM_AI_GEMINI_FREE_MODELS' };
const PROVIDERS = {
  huggingface: { key: 'HF_TOKEN', baseUrl: (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '') },
  groq: { key: 'GROQ_API_KEY', baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '') },
  zen: { key: 'OPENCODE_API_KEY', baseUrl: (process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '') },
  gemini: { key: 'GEMINI_API_KEY', baseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '') },
};
let zenCatalog = { fetchedAt: 0, ids: new Set() };

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
async function providerCandidates(store, fetchImpl = fetch) {
  const scores = store.modelScores(); const candidates = [];
  for (const provider of PROVIDER_ORDER) {
    if (!PROVIDERS[provider] || !isConfigured(provider)) continue;
    let models = modelsFor(provider);
    if (provider === 'zen') {
      try { const available = await zenAvailableModels(fetchImpl); models = models.filter((model) => available.has(model)); }
      catch (error) { console.warn(`[mom-ai-author] Zen catalog unavailable: ${error.message}`); models = []; }
    }
    models.sort((a, b) => (scores[`${provider}/${b}`] || 0) - (scores[`${provider}/${a}`] || 0) || modelsFor(provider).indexOf(a) - modelsFor(provider).indexOf(b));
    candidates.push(...models.map((model) => ({ provider, model, key: `${provider}/${model}` })));
  }
  return candidates;
}

module.exports = { POLICY_VERSION, PROVIDERS, PROVIDER_ORDER, modelsFor, providerCandidates };
