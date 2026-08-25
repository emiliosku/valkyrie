# Future Unity Editor Integration

This service is intentionally separate from Valkyrie in its first release. Do not copy generated INI files directly into an active editor quest and do not store an OpenCode key in Unity.

## Integration seam

1. Add an `AI Author` action in `unity/Assets/Scripts/QuestEditor/EditorTools.cs`.
2. Add desktop-only endpoint and enable settings through `ConfigFile.cs` and `AdvancedOptionsScreen.cs`.
3. Implement a loopback-only `UnityWebRequest` client with timeouts, cancellation, response limits, and no credential handling.
4. Reuse the interview protocol (`/v1/interviews`, answers, and review) to render native question and story-bible dialogs.
5. Evolve the service with a versioned typed-operation response for Unity. The editor must validate each operation, apply it to existing `QuestData` models, then call `QuestEditor.Save()` and `QuestEditor.Reload()`.

## Do not do

- Do not grant the service filesystem access to quest directories.
- Do not import raw generated ZIPs into an active editor session.
- Do not enable this flow on Android; Valkyrie's editor is intentionally desktop-only.
- Do not use the untracked AI source in `valkyrie_upgrade`; it does not compile and does not follow the active serializer contract.
