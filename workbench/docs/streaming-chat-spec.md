# Streaming chat — build spec (Milestone M1)

Goal: tokens appear **live** in the Workbench chat instead of arriving all at once.
This keeps every existing safety boundary; it only changes *when* bytes are delivered.

## Status

- ✅ **Python streaming layer (done).** `http_util.stream_sse`, `OpenAICompatibleLocalProvider.stream_chat_sandbox`, and `provider_chat_sandbox.run_private_provider_chat_sandbox_stream` are implemented and unit-tested (`tests/test_realforge_chat_stream.py`). The CLI exposes it:
  `python -m realforge.cli provider chat-sandbox --stdin --stream` → emits **NDJSON**, one sanitized event per line.
- ⏳ **Rust streaming bridge** (below) — not started.
- ⏳ **TS bridge + React consumption** (below) — not started.

## Wire protocol (already emitted by the CLI)

One JSON object per stdout line:

- `{"type":"delta","text":"<sanitized chunk>"}` — repeated; control chars stripped, capped to the 4096-char total budget.
- `{"type":"final","ok":true,"status":"pass","duration_ms":N,"input_length":N,"response_truncated":bool,"untrusted_output":true,"configured":bool,"provider_kind":string|null}`
- `{"type":"error","ok":false,"status":"rejected|not_configured|fail","error":{"code","message"},"untrusted_output":true,...}`

No model name, API key, base_url, path, or token usage is ever present — verified by tests.

## Rust (`src-tauri/src/bridge/provider_chat_sandbox.rs`)

Add a streaming command alongside the existing synchronous one (do **not** change the existing `run_private_provider_chat_sandbox`):

```
#[tauri::command]
async fn run_private_provider_chat_sandbox_stream(
    input: ChatSandboxInput,            // existing deny_unknown_fields struct
    on_event: tauri::ipc::Channel<ChatStreamEvent>,
) -> Result<(), BridgeError>
```

- Reuse `validate_prompt` (same caps/control-char rules) before spawning.
- Spawn the **same** fixed command but with `--stream`: argv `["provider","chat-sandbox","--stdin","--stream"]`; write the prompt to stdin only; Rust still owns the executable/argv (no path/argv/model from the frontend).
- Read **stdout line-by-line** (BufReader). For each line: enforce a max line length + a running total stdout-byte cap (reuse `CHAT_SANDBOX_MAX_STDOUT_BYTES`); `serde_json::from_str` into a `ChatStreamEvent` enum with `#[serde(tag="type", deny_unknown_fields)]` variants `Delta{text}` / `Final{...}` / `Error{...}`; forward each via `on_event.send(...)`. Drop unparseable lines.
- Enforce the existing timeout; on timeout/spawn failure send a synthesized `Error` event.
- Cancellation: reuse the existing single-active-request guard + cancel signal so `cancel_private_provider_chat_sandbox` kills the streaming child too.
- Register the command in `lib.rs` `invoke_handler`.

## TS bridge (`src/bridge/workbench-bridge.ts` + `types.ts`)

```
export async function runPrivateProviderChatSandboxStream(
  input: ProviderChatSandboxInput,
  onEvent: (e: ChatStreamEvent) => void
): Promise<void> {
  if (!isDesktopRuntime()) { onEvent({ type: "error", error: { code: "unsupported_web", message: "…desktop only" }, ... }); return; }
  const { Channel } = await import("@tauri-apps/api/core");
  const channel = new Channel<ChatStreamEvent>();
  channel.onmessage = onEvent;
  await invokeDesktop("run_private_provider_chat_sandbox_stream", { input, onEvent: channel });
}
```

Add `ChatStreamEvent` union to `types.ts`. The request shape stays `{ prompt, approvalAcknowledged }`.

## React (`WorkbenchScreen.askLocalModel` + `WorkbenchChatTurn`)

- `askLocalModel(prompt, includeContext)`: append a turn with `running:true`, then call the streaming bridge. On each `delta`, append `text` to that turn's accumulating `streamedText`; on `final`, set the turn's result/status + `running:false`; on `error`, set an error result.
- Keep the **client-side 4096 cap** in `WorkbenchChatTurn` (defense in depth) and the auto-scroll on update.
- Approval gate, context opt-in, LOCAL UNTRUSTED label, no-persistence, and no approval-audit are all unchanged.
- Optional: a "Stop" button wired to `cancelPrivateProviderChatSandbox`.

## Tests to add

- Rust: NDJSON line parsing → events; over-cap line/total rejected; unknown event type dropped; timeout → error event.
- React: a mocked channel emitting `delta` × N then `final` grows the turn text live and ends not-running; an `error` event renders the error turn; still no audit entry / no persistence; LOCAL UNTRUSTED visible.
- Safety scan: the streaming files add no `fetch`/`invoke(` beyond the one bridge call; no model identity strings.

## Boundary unchanged

Streaming changes delivery timing only. Prompt cap 2000, response cap 4096, timeout, untrusted output, session-only, no persistence, no approval-audit entry, no workspace/files/tools, request shape `{ prompt, approvalAcknowledged }` — all identical to the synchronous path.
