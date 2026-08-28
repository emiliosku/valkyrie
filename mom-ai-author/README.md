# MoM AI Author

Local web companion for authoring text-only Mansions of Madness 2E scenarios for Valkyrie. It interviews the author, reviews a story bible, generates a validated `.valkyrie` package, and leaves import under the player's control.

## Run

Requires Node 18+ and at least one configured remote provider for live requests.

```bash
cd mom-ai-author
npm install
GROQ_API_KEY=... npm start
```

Open `http://127.0.0.1:3000`. Select mock mode to exercise the entire flow without a network request. Run `npm test` for the offline test suite.

Keys are read only by the local service and are never sent to the browser or Valkyrie.

## Authoring flow

`materials -> idea -> interview -> story bible -> revision -> generation -> validation -> narrative critique -> package`

Before an interview, select the MoM expansions the case may use. `MoMBase` is always required. The companion parses Valkyrie's checked-in MoM pack manifests and validates generated tile, monster, investigator, item/spell, token, UI image, and audio IDs against that selected catalog. It does not ship or inspect official FFG artwork or audio, so asset availability remains a player-import warning until the future Unity-editor integration can use its live loaded catalog.

The interview prompt includes a compact summary of available game content (monsters, tiles, items, spells, NPCs, game tokens) for the selected expansions so the model can reference real game entities during the creative process. Up to 10 interview questions are asked.

Scenarios are investigator-agnostic: investigators are selected by the player before the game begins. The story must not reference, require, or assume any specific investigator. Named NPCs (witnesses, allies, antagonists, victims) may be introduced for storytelling purposes.

The user never selects a provider or model. The server uses stage-aware provider routing:

| Stage group | Stages | Default provider order |
| --- | --- | --- |
| Interview | `interview`, `revision` | `groq`, `ollama`, `openrouter` |
| Generation | `generation`, `repair`, `critic`, `narrative-repair` | `ollama`, `openrouter`, `groq` |

Interview stages use fast-inference providers (Groq completes in ~1-2s). Generation stages prefer providers with larger context and output budgets.

| Provider | Key | Transport | Default verified-free models |
| --- | --- | --- | --- |
| Ollama Cloud | `OLLAMA_API_KEY` | Native Ollama chat API | `nemotron-3-ultra`, `gpt-oss:120b`, `minimax-m3`, `nemotron-3-super`, `gemma4:31b`, `nemotron-3-nano:30b`, `gpt-oss:20b` |
| OpenRouter | `OPENROUTER_API_KEY` | OpenAI-compatible | `openrouter/free`, OpenRouter's free-only router with upstream failover |
| Groq | `GROQ_API_KEY` | OpenAI-compatible | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` |
| Hugging Face Inference Providers | `HF_TOKEN` | OpenAI-compatible router | None; set an explicitly verified free model list. |
| Gemini | `GEMINI_API_KEY` | Native `generateContent` | None; set an explicitly verified free model list. |

Only providers with a configured key and non-empty verified-free model policy participate. Change the stage-specific orders with `MOM_AI_INTERVIEW_PROVIDER_ORDER` and `MOM_AI_GENERATION_PROVIDER_ORDER`. The retired `MOM_AI_PROVIDER_ORDER` is ignored.

Temporary availability, schema, and rate-limit failures retry the next eligible provider/model. A timeout or rate-limit failure cools the entire provider so remaining models are skipped immediately. Authentication and invalid-input failures do not fall through. Mock mode is explicit and is never an automatic fallback. A package is available for download only after structural validation and narrative review complete; if a required review or repair cannot run, generation remains retryable rather than producing an unchecked package.

Verified-free policies may be overridden after independently confirming both zero cost and API compatibility: `MOM_AI_OLLAMA_FREE_MODELS`, `MOM_AI_OPENROUTER_FREE_MODELS`, `MOM_AI_GROQ_FREE_MODELS`, `MOM_AI_HF_FREE_MODELS`, and `MOM_AI_GEMINI_FREE_MODELS`. Models merely present in a provider catalog are intentionally excluded, preventing a silent paid fallback.

Story-bible ratings and model-performance statistics are not collected. `MOM_AI_DATA_DIR` controls only the temporary package output directory.

Set `MOM_AI_IMAGE=true` to generate a cover image for each quest using the HuggingFace Inference API. `HF_TOKEN` must be set. The default model is `black-forest-labs/FLUX.1-schnell` (4-step, fast, free tier). Override with `MOM_AI_IMAGE_MODEL`. Cover generation is non-blocking: if it fails or is not configured, the quest is packaged without a cover image.

Set `MOM_AI_DEBUG=true` to log safe provider diagnostics: candidate, stage, prompt/output byte counts, elapsed time, provider completion metadata, and structural validation errors. It never logs API keys, prompt text, or generated quest contents.

## Limits and safety

- The service binds to `127.0.0.1` by default and never stages files into Valkyrie's data directory.
- Generated packages are text-only. They reference player-imported MoM assets by ID and never bundle FFG assets.
- Structural validation rejects unsafe filenames, missing required files, malformed quest metadata, and incomplete button/event pairs. It cannot prove that external asset IDs exist or that every quest is winnable.
- Download links expire after 15 minutes.

Import a downloaded package explicitly through Valkyrie after importing owned MoM game data.
