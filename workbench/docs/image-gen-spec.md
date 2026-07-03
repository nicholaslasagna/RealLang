# Local image generation — build spec (Milestone M2)

Goal: Image screen generates a real PNG from the user's configured local image
backend. Backends are **pluggable** — link any image server — with **ComfyUI** as
the first-class option.

## Backends
Both produce the same sanitized output (`image_base64` PNG), so the Rust/TS/React
layer is backend-agnostic. Dispatch is by `[image_provider].kind`.

| kind | how it works |
|------|--------------|
| `comfyui` *(primary)* | Queue the user's API-format workflow at `POST /prompt`, poll `GET /history/{id}`, fetch the first `SaveImage` output via `GET /view`. The workflow must contain the literal token `%prompt%` in its positive text node; the bounded user prompt is JSON-escaped and injected there. |
| `local_image_provider` | Any OpenAI-compatible `POST /images/generations` server. `{prompt,n:1,response_format:b64_json,model?}` → `data[0].b64_json`. |

## Status
- ✅ **Python (done, both backends).** `provider_image_gen.run_private_provider_image_gen`
  → CLI `provider image --stdin --json`. Dispatches on kind. Returns sanitized JSON:
  `{ok,status,duration_ms,image_base64,mime,image_bytes,untrusted_output,error}`.
  Caps: prompt 2000, decoded image 8 MB, PNG-signature checked, model/key/workflow
  never returned. ComfyUI: localhost-only endpoint, `%prompt%` injection, history
  poll with timeout, `/view` byte cap. Tested: `tests/test_realforge_image_gen.py`
  (16 — OpenAI-compatible + ComfyUI inline/path/timeout/exec-error/no-placeholder/non-PNG).
- ⏳ Rust IPC + TS bridge + React Image screen + `execution_enabled` flip (below).

## Rust (`src-tauri/src/bridge/`)
New `provider_image_gen.rs` + command `run_private_provider_image_gen(input: {prompt, approvalAcknowledged})`:
- Mirror the chat-sandbox spawn pattern: `python -m realforge.cli provider image --stdin --json`,
  prompt to stdin only, Rust owns argv. Reuse `validate_prompt` (chars/bytes/control/empty).
- Approval required; timeout ≥90 s (image is slow); cap stdout ~16 MB (b64 PNG).
- Parse the one JSON object into a sanitized `ImageReport`; redact error codes via an
  allowlist; force `untrusted_output`; mime → `image/png` or null. Do **not** write the
  image to disk in Rust. Register in `lib.rs`.

## TS bridge (`src/bridge/`)
`runPrivateProviderImageGen(input) -> ImageResult` (desktop-only; web → `unsupported_web`).
Mirror `runPrivateProviderChatSandbox`. Add `ProviderImageReport`/`ProviderImageResult` types.

## React — Image screen (`src/features/studio/`)
Replace the Image tab's "Planning only" body with a real generator:
- Prompt textarea + per-send **approval checkbox** + Generate button (chat's gate pattern).
- On result: render `<img src={`data:${mime};base64,${image_base64}`}>` badged **LOCAL
  UNTRUSTED**; show duration; **Save image…** = `<a download>` of the data URL (user picks
  location; nothing auto-written).
- Errors: redacted message + Configure-provider link (image provider not set → Settings).
  ComfyUI workflow errors (`workflow_no_placeholder`, `invalid_workflow`, `workflow_missing`)
  get setup guidance.
- No persistence, no audit entry, session-only.
- Flip `execution_enabled` once the screen ships, so the generator unlocks only when an
  image backend is configured.

## Setup (user) — `~/.realforge.local.toml` (gitignored)
ComfyUI (primary):
```
[image_provider]
kind = "comfyui"
base_url = "http://127.0.0.1:8188"     # localhost-only, validated
workflow_path = "/path/to/workflow_api.json"   # ComfyUI → Save (API Format)
# or inline:  workflow = '''{ ...api json with "%prompt%" in a CLIPTextEncode text... }'''
```
The workflow must include a `SaveImage` node (so the result appears in `/history`) and the
token `%prompt%` in its positive prompt text field.

Any OpenAI-compatible server:
```
[image_provider]
kind = "local_image_provider"
base_url = "http://localhost:8188/v1"
model = "<your image model>"            # gitignored; never in tracked files
api_key = "<optional>"
```

## Boundary
Localhost-only endpoint (validated), fixed argv, prompt cap, 8 MB image cap, PNG-only,
output LOCAL UNTRUSTED, no model/key/path/workflow returned, no auto-write, no
persistence/audit. Request shape `{ prompt, approvalAcknowledged }`.
