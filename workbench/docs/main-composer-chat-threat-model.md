# Main composer → private chat sandbox threat model (0.32)

Workbench 0.32 lets the **main composer** optionally send the user's entered text
to the **existing** private chat sandbox and render the untrusted response in the
thread. It adds no new provider execution path: it reuses the narrow
`run_private_provider_chat_sandbox` IPC introduced for the Settings sandbox card.

## What may happen

- Composer text may be sent **only** to the private chat sandbox, and only after
  an explicit, per-send approval in **Ask local model** mode.
- The request carries **only** a bounded prompt string plus
  `approvalAcknowledged: true`. Rust rejects unknown fields.

## What is excluded by construction

- **No workspace files** are read or attached.
- **No repository context** or project metadata is included.
- **No current file contents** are included.
- **No tools**, function calling, or plugins.
- **No shell** access or command execution from the composer.
- **No writes**, patch application, commit, merge, update, or scheduler path.
- **No memory / history persistence** — a single current turn is held in React
  state and replaced on the next send. Nothing is written to disk, app config,
  the approval audit, or a transcript store.
- **No image generation.**
- **No autonomous loops** — one request per explicit, approved click.

## Trust and bounds

- Provider output is **`local_untrusted`** and is always labelled **LOCAL
  UNTRUSTED** in the thread.
- Prompt and response are **session-only** unless the user explicitly copies the
  visible text (copy includes the `LOCAL UNTRUSTED` label).
- The response is **capped** (backend cap plus a defensive UI cap of 4096
  characters) and flagged when truncated.
- Prompt length is bounded (2000 characters / 8 KB) and validated by Rust; the
  backend enforces a short timeout (25 s) and stdout/stderr caps.
- Errors are **sanitized, structured** `BridgeError` values. The API key, exact
  model name/identity, model path, and private config are never returned across
  IPC.

## Runtime boundary

- **Web mode cannot execute provider chat.** The Ask-local mode control is
  disabled in web, and the web bridge fallback returns `unsupported_web`.
- **Desktop mode uses the existing narrow sandbox IPC only.** The frontend passes
  no executable, argv, path, or file content; Rust owns the executable and writes
  the prompt only to the child's stdin.
- The composer component itself performs **no IPC** — it raises a callback; the
  screen makes the single existing bridge call.

## Mode separation

The composer is explicitly two distinct modes the user chooses between:

1. **Safe preview** — stages a structured, display-only action preview (no
   execution), unchanged from prior versions.
2. **Ask local model** — sends one bounded request to the local sandbox.

This is **not** an autonomous agent, not image generation, and not connected to
the workspace. The private model's identity remains local-only and is never
written to tracked files.

## 0.38 — visible session thread, keyboard, and profile selector

- **Visible multi-turn thread, single-turn calls.** The UI now shows a back-and-forth
  conversation for the session, but each provider call remains one bounded request:
  **prior turns are NOT sent**. The thread is labelled "session view only."
- **Session-only, still not persisted.** Turns live in React state only — never written
  to disk/app-config, never added to the approval audit, never kept as hidden transcript
  memory. "Clear chat" drops the visible turns.
- **Keyboard.** In Ask-local mode, Enter (and Cmd/Ctrl+Enter) sends; Shift+Enter inserts a
  newline. Enter re-checks the same gates (desktop, explicit approval, non-empty, not
  running) — it never bypasses approval. Safe-preview keeps the default newline behavior and
  never calls the model.
- **Mode separation.** Ask-local renders only the chat thread (no staged action preview);
  Safe-preview renders only the preview surface (no model call).
- **Profile selector.** A "Local model profile" selector is shown but **informational and
  disabled** ("Configured local provider" / "uses your configured default local provider")
  because the sandbox IPC selects no profile. It exposes no model name, endpoint, key, or
  path. No new fields are sent across IPC — the request stays `{ prompt, approvalAcknowledged }`.

## 0.40 — opt-in bounded visible chat context

Ask-local mode can optionally include **recent visible chat turns** as context with the
current prompt. It changes nothing about the backend: the request stays
`{ prompt, approvalAcknowledged }`, and the context is composed into that single bounded
prompt string on the frontend.

- **Only visible chat turns** may be included — the user prompts and local-model responses
  already shown in this session's thread. Nothing else.
- **Opt-in.** The "Include recent visible chat" control defaults **off**. The user can turn it
  off again at any time.
- **Capped** by both turn count (≤ 4 most-recent completed turns) and characters (context
  block ≤ 1500 chars; the whole composed prompt is hard-capped to the backend's 2000-char
  limit, with the current prompt preserved first).
- **Disclosed before send.** When enabled, the composer shows how many visible turns will be
  included ("Including up to N visible turns · capped"), and turns that carried context are
  badged in the thread.
- **Excluded by construction:** no workspace files, no repo contents, no current file
  contents, no tools, no shell, no provider status/config, no secrets, no model identity, no
  hidden data. The composed string contains only visible turn text plus a fixed disclosure
  preamble.
- **No persistence / no hidden memory.** Turns remain session-only React state; nothing is
  written to disk, app-config, or a transcript store.
- **No approval audit entry** is created for the chat body.
- Output remains **`local_untrusted`**. Each call is still a single bounded request, gated by
  the existing per-send approval.

## 0.41 — visible chat context preview (transparency)

When "Include recent visible chat" is enabled, the composer now shows an inspectable preview
of exactly what would be added, **before** sending.

- **Disclosure:** how many visible turns will be included and an approximate character count,
  flagged "· capped" when caps trimmed anything ("Including up to N visible turns · ~C chars").
- **Collapsed "Preview context"** details show the exact visible turn text (`You` / `Local
  model`) that will be composed in — nothing else. It states "No files, tools, workspace,
  memory, or hidden context."
- **Accuracy:** the preview and the composed prompt share one code path
  (`buildContextPreview` / `composeVisibleChatContext` reuse the same turn cap, per-field
  clip, and char cap), so the preview matches what is actually sent. Running and error turns
  are excluded from both.
- **No new data or authority.** The preview reflects only visible turn text — no provider
  status/config, secrets, model identity, workspace, or files. The request shape is unchanged
  (`{ prompt, approvalAcknowledged }`), still opt-in, capped, session-only, no persistence, no
  approval-audit entry, output `local_untrusted`.
