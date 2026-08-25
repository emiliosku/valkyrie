'use strict';

const POLICY_VERSION = 1;
const DEFAULT_FREE_MODELS = [
  'hy3-free',
  'nemotron-3-ultra-free',
  'mimo-v2.5-free',
  'big-pickle',
  'x-preview-f-free',
  'nemotron-3.5-lightning-free',
];
// Zen's catalog does not expose pricing or endpoint metadata. Operators may
// update this allowlist without a code release after verifying a new free model.
const FREE_MODELS = (process.env.MOM_AI_FREE_MODELS || DEFAULT_FREE_MODELS.join(','))
  .split(',').map((id) => id.trim()).filter(Boolean);
const ZEN_BASE_URL = (process.env.ZEN_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
let catalog = { fetchedAt: 0, ids: new Set() };

async function availableModels(fetchImpl = fetch) {
  if (Date.now() - catalog.fetchedAt < 15 * 60 * 1000 && catalog.ids.size) return catalog.ids;
  const response = await fetchImpl(`${ZEN_BASE_URL}/models`);
  if (!response.ok) throw new Error(`Zen model catalog returned ${response.status}`);
  const payload = await response.json();
  catalog = { fetchedAt: Date.now(), ids: new Set((payload.data || []).map((model) => model.id)) };
  return catalog.ids;
}

async function rankedAvailableModels(store, fetchImpl) {
  const available = await availableModels(fetchImpl);
  const scores = store.modelScores();
  return FREE_MODELS
    .filter((id) => available.has(id))
    .sort((a, b) => (scores[b] || 0) - (scores[a] || 0) || FREE_MODELS.indexOf(a) - FREE_MODELS.indexOf(b));
}

module.exports = { POLICY_VERSION, FREE_MODELS, ZEN_BASE_URL, availableModels, rankedAvailableModels };
