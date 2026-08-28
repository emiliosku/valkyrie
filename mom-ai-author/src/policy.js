'use strict';

const POLICY_VERSION = 4;

const INTERVIEW_STAGES = new Set(['interview', 'revision']);
const INTERVIEW_PROVIDERS = (process.env.MOM_AI_INTERVIEW_PROVIDER_ORDER || 'groq,ollama,openrouter').split(',').map((id) => id.trim()).filter(Boolean);
const GENERATION_PROVIDERS = (process.env.MOM_AI_GENERATION_PROVIDER_ORDER || 'ollama,openrouter,groq').split(',').map((id) => id.trim()).filter(Boolean);

const DEFAULT_MODELS = {
  groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
  // Hugging Face and Gemini do not publish a universally stable zero-cost catalog.
  // They are enabled only after an operator explicitly verifies a free model.
  huggingface: [],
  gemini: [],
  // OpenRouter maintains this free-only router and performs its own upstream
  // failover, avoiding an application-maintained, quickly stale model list.
  openrouter: ['openrouter/free'],
  // Fixed preference order for generation stages.
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
const ENV_MODEL_NAMES = { groq: 'MOM_AI_GROQ_FREE_MODELS', huggingface: 'MOM_AI_HF_FREE_MODELS', gemini: 'MOM_AI_GEMINI_FREE_MODELS', ollama: 'MOM_AI_OLLAMA_FREE_MODELS', openrouter: 'MOM_AI_OPENROUTER_FREE_MODELS' };
const PROVIDERS = {
  ollama: { key: 'OLLAMA_API_KEY', baseUrl: (process.env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/$/, '') },
  openrouter: { key: 'OPENROUTER_API_KEY', baseUrl: (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '') },
  huggingface: { key: 'HF_TOKEN', baseUrl: (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '') },
  groq: { key: 'GROQ_API_KEY', baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '') },
  gemini: { key: 'GEMINI_API_KEY', baseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '') },
};
let ollamaCatalog = { fetchedAt: 0, ids: new Set() };

function modelsFor(provider) { return (process.env[ENV_MODEL_NAMES[provider]] || (DEFAULT_MODELS[provider] || []).join(',')).split(',').map((id) => id.trim()).filter(Boolean); }
function isConfigured(provider) { return !!(PROVIDERS[provider] && process.env[PROVIDERS[provider].key]); }
async function ollamaAvailableModels(fetchImpl = fetch) {
  if (Date.now() - ollamaCatalog.fetchedAt < 15 * 60 * 1000 && ollamaCatalog.ids.size) return ollamaCatalog.ids;
  const response = await fetchImpl(`${PROVIDERS.ollama.baseUrl}/api/tags`, { headers: { authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } });
  if (!response.ok) throw new Error(`Ollama model catalog returned ${response.status}`);
  const payload = await response.json();
  ollamaCatalog = { fetchedAt: Date.now(), ids: new Set((payload.models || []).map((model) => model.name)) };
  return ollamaCatalog.ids;
}
async function providerCandidates(store, fetchImpl = fetch, stage) {
  const order = INTERVIEW_STAGES.has(stage) ? INTERVIEW_PROVIDERS : GENERATION_PROVIDERS;
  const candidates = [];
  for (const provider of order) {
    if (!PROVIDERS[provider] || !isConfigured(provider)) continue;
    let models = modelsFor(provider);
    if (provider === 'ollama') {
      try { const available = await ollamaAvailableModels(fetchImpl); models = models.filter((model) => available.has(model)); }
      catch (error) { console.warn(`[mom-ai-author] ollama catalog unavailable: ${error.message}`); models = []; }
    }
    candidates.push(...models.map((model) => ({ provider, model, key: `${provider}/${model}` })));
  }
  return candidates;
}

module.exports = { POLICY_VERSION, PROVIDERS, INTERVIEW_PROVIDERS, GENERATION_PROVIDERS, modelsFor, providerCandidates };
