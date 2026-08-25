# MoM AI Author

Local web companion for authoring text-only Mansions of Madness 2E scenarios for Valkyrie. It interviews the author, reviews a story bible, generates a validated `.valkyrie` package, and leaves import under the player's control.

## Run

Requires Node 18+ and an OpenCode Zen API key for live requests.

```bash
cd mom-ai-author
npm install
OPENCODE_API_KEY=... npm start
```

Open `http://127.0.0.1:3000`. Select mock mode to exercise the entire flow without a network request. Run `npm test` for the offline test suite.

Zen may require an account and billing setup even where the selected model has zero token cost. The key is read only by the local service and is never sent to the browser or Valkyrie.

## Authoring flow

`materials -> idea -> interview -> story bible -> ratings/revision -> generation -> validation -> narrative critique -> package`

Before an interview, select the MoM expansions the case may use. `MoMBase` is always required. The companion parses Valkyrie's checked-in MoM pack manifests and validates generated tile, monster, investigator, item/spell, token, UI image, and audio IDs against that selected catalog. It does not ship or inspect official FFG artwork or audio, so asset availability remains a player-import warning until the future Unity-editor integration can use its live loaded catalog.

The user never selects a model. The server periodically queries Zen's model catalog and chooses the highest-ranked available model from its verified-free, chat-completions-compatible policy. Current candidates are `nemotron-3-ultra-free`, `hy3-free`, `mimo-v2.5-free`, `big-pickle`, `x-preview-f-free`, and `nemotron-3.5-lightning-free`.

Temporary availability failures retry the next eligible model. Authentication and invalid-input failures do not. Mock mode is explicit and is never an automatic fallback.

`MOM_AI_FREE_MODELS` may override the comma-separated verified-free policy after a model's price and chat-completions compatibility have been independently verified. Models merely present in Zen's catalog are intentionally excluded.

Story-bible ratings and operational outcomes are stored only in `~/.local/share/valkyrie-ai-author/ratings.sqlite` by default. They improve the local ranking after at least five rated reviews per model. Set `MOM_AI_DATA_DIR` to override the local data directory.

## Limits and safety

- The service binds to `127.0.0.1` by default and never stages files into Valkyrie's data directory.
- Generated packages are text-only. They reference player-imported MoM assets by ID and never bundle FFG assets.
- Structural validation rejects unsafe filenames, missing required files, malformed quest metadata, and incomplete button/event pairs. It cannot prove that external asset IDs exist or that every quest is winnable.
- Download links expire after 15 minutes.

Import a downloaded package explicitly through Valkyrie after importing owned MoM game data.
