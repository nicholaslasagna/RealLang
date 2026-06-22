# Private provider console and readiness dashboard (Workbench 0.28-0.29)

Workbench 0.28 adds a frontend-only readiness summary for the user-configured local
provider. It derives its state from the existing sanitized provider status report
and the current session's fixed smoke-check status. It adds no provider request,
IPC command, storage path, or execution authority.

## Lifecycle

The dashboard reports the safe provider lifecycle without exposing private
identity or configuration contents:

1. private configuration detected;
2. sanitized provider status available;
3. fixed approval-gated smoke check available;
4. bounded private chat sandbox available;
5. optional image-provider metadata present while execution remains disabled.

The smoke check and chat sandbox remain separate operations. A smoke pass records
only `pass` in component state for the current Workbench session; it does not copy
or persist the smoke response. Chat prompts and responses remain inside the existing
single-turn sandbox and do not enter readiness state.

## Trust and privacy boundary

The readiness model contains booleans, a generic provider kind, `local_untrusted`,
fixed sandbox limits, and a session-only smoke status. It contains no API key,
exact model identity, model path, private prompt, full endpoint URL, provider
response, or private configuration contents.

Workspace context, file access, tools, shell access, memory, persistence, and image
generation are explicitly reported as off. Image-provider execution remains false
even when image-provider metadata is configured. Web preview remains execution-free;
desktop-only smoke and chat controls retain their existing approval gates.

Provider output remains untrusted and must be reviewed by the user.

## Provider console organization

Workbench 0.29 keeps the 0.28 readiness model and reorganizes the surrounding
Settings surface into one provider console:

1. readiness lifecycle and next safe actions;
2. sanitized chat-provider status;
3. the fixed approval-gated smoke test;
4. the approval-gated single-turn chat sandbox;
5. image-provider metadata with execution disabled;
6. the explicit disconnected-capability boundary.

The console avoids repeating configuration fields and safety warnings across
cards. Smoke and chat remain separate operations with separate approval. Image
generation remains unavailable. Workspace context, files, tools, shell, memory,
and persistence remain disconnected. Private identity stays local-only, and all
provider output remains `local_untrusted`.

This consolidation is frontend-only. It adds no IPC command, provider request,
storage, transcript, browser network request, or execution authority.
