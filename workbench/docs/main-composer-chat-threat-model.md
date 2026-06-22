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
