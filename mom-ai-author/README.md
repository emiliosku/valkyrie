# MoM AI Author

Local web companion for authoring text-only Mansions of Madness 2E scenarios for Valkyrie. It interviews the author, reviews a story bible, generates a validated `.valkyrie` package, and leaves import under the player's control.

## Run

Requires Node 18+ and at least one configured remote provider for live requests.

```bash
cd mom-ai-author
npm install
OPENCODE_API_KEY=... npm start
```

Open `http://127.0.0.1:3000`. Select mock mode to exercise the entire flow without a network request. Run `npm test` for the offline test suite.

Keys are read only by the local service and are never sent to the browser or Valkyrie.

## Authoring flow

`materials -> idea -> interview -> story bible -> ratings/revision -> generation -> validation -> narrative critique -> package`

Before an interview, select the MoM expansions the case may use. `MoMBase` is always required. The companion parses Valkyrie's checked-in MoM pack manifests and validates generated tile, monster, investigator, item/spell, token, UI image, and audio IDs against that selected catalog. It does not ship or inspect official FFG artwork or audio, so asset availability remains a player-import warning until the future Unity-editor integration can use its live loaded catalog.

The user never selects a provider or model. The server tries configured verified-free candidates in provider order, while still ranking models within a provider from local narrative and reliability observations.

| Provider | Key | Transport | Default verified-free models |
| --- | --- | --- | --- |
| Ollama Cloud | `OLLAMA_API_KEY` | Native Ollama chat API | None; set an explicitly verified free model list. |
| Hugging Face Inference Providers | `HF_TOKEN` | OpenAI-compatible router | None; set an explicitly verified free model list. |
| Groq | `GROQ_API_KEY` | OpenAI-compatible | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.6-27b` |
| OpenCode Zen | `OPENCODE_API_KEY` | OpenAI-compatible | Zen's current verified-free policy |
| Gemini | `GEMINI_API_KEY` | Native `generateContent` | None; set an explicitly verified free model list. |

The default provider order is `ollama,huggingface,groq,zen,gemini`; only providers with a configured key and non-empty verified-free model policy participate. Change the order with `MOM_AI_PROVIDER_ORDER`.

Temporary availability, schema, and rate-limit failures retry the next eligible provider/model. A failing candidate enters a local cooldown, honoring `Retry-After` when supplied. Authentication and invalid-input failures do not fall through. Mock mode is explicit and is never an automatic fallback.

Verified-free policies may be overridden after independently confirming both zero cost and API compatibility: `MOM_AI_OLLAMA_FREE_MODELS`, `MOM_AI_FREE_MODELS` (Zen), `MOM_AI_GROQ_FREE_MODELS`, `MOM_AI_HF_FREE_MODELS`, and `MOM_AI_GEMINI_FREE_MODELS`. Models merely present in a provider catalog are intentionally excluded, preventing a silent paid fallback.

Story-bible ratings and operational outcomes are stored only in `~/.local/share/valkyrie-ai-author/ratings.sqlite` by default. They improve the local ranking after at least five rated reviews per model. Set `MOM_AI_DATA_DIR` to override the local data directory.

## Limits and safety

- The service binds to `127.0.0.1` by default and never stages files into Valkyrie's data directory.
- Generated packages are text-only. They reference player-imported MoM assets by ID and never bundle FFG assets.
- Structural validation rejects unsafe filenames, missing required files, malformed quest metadata, and incomplete button/event pairs. It cannot prove that external asset IDs exist or that every quest is winnable.
- Download links expire after 15 minutes.

Import a downloaded package explicitly through Valkyrie after importing owned MoM game data.
