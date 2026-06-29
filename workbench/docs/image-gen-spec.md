# Local image generation — build spec (Milestone M2)

Goal: Image screen generates a real PNG from the user's configured local image provider.

## Status
- ✅ **Python foundation (done).** `provider_image_gen.run_private_provider_image_gen` → CLI `provider image --stdin --json`. Loads `[image_provider]` from `~/.realforge.local.toml`, POSTs `{prompt,n:1,response_format:b64_json,model?}` to `<base_url>/images/generations`, returns sanitized JSON: `{ok,status,duration_ms,image_base64,mime,image_bytes,untrusted_output,error}`. Caps: prompt 2000, decoded image 8 MB, PNG-signature checked, model/key never returned. Tested: `tests/test_realforge_image_gen.py` (8).
- ⏳ Rust IPC + React Image screen (below).

## Rust (`src-tauri/src/bridge/`)
New `provider_image_gen.rs` + command `run_private_provider_image_gen(input: {prompt, approvalAcknowledged})`:
- Reuse the chat-sandbox spawn pattern: `python -m realforge.cli provider image --stdin --json`, prompt to stdin only, Rust owns argv.
- Validate prompt (reuse `validate_prompt`); approval required; timeout (≥60s — image is slow); cap stdout (~12 MB for the b64 JSON).
- Parse the one JSON object into a sanitized `ImageReport` (`deny_unknown_fields`); return to frontend. Do **not** write the image to disk in Rust.
- Register in `lib.rs`.

## TS bridge (`src/bridge/`)
`runPrivateProviderImageGen(input) -> ImageResult` (desktop-only; web returns `unsupported_web`). Mirror `runPrivateProviderChatSandbox`. Add `ProviderImageReport`/`ProviderImageResult` types.

## React — Image screen (`src/features/studio/`)
Replace the mock Image tab body with a real generator:
- Prompt textarea + per-send **approval checkbox** + Generate button (same gate pattern as chat). Placeholder "Describe an image…".
- On result: render `<img src={`data:${mime};base64,${image_base64}`}>` badged **LOCAL UNTRUSTED**; show duration; **Save image…** = `<a download>` of the data URL (user picks location; nothing auto-written).
- Errors: redacted message + Configure-provider link (image provider not set → Settings).
- No persistence, no audit entry, session-only.

## Setup (user)
`~/.realforge.local.toml`:
```
[image_provider]
kind = "local_image_provider"
base_url = "http://localhost:8188/v1"   # local OpenAI-compatible image server
model = "<your image model>"            # gitignored; never in tracked files
api_key = "<optional>"
```

## Boundary
Localhost-only endpoint (validated), fixed argv, prompt cap, 8 MB image cap, PNG-only, output LOCAL UNTRUSTED, no model/key/path returned, no auto-write, no persistence/audit. Request shape `{ prompt, approvalAcknowledged }`.
