# Private local provider config (Workbench)

Workbench supports **provider-agnostic** private local profiles for chat/reasoning and
(optional, future) local image generation. The public repository never stores model
identity, weights, API keys, or private prompts.

## Local config location

Private provider settings belong in a **fixed home config file**:

```text
~/.realforge.local.toml
```

Copy the public template from `.realforge.toml.example` or
`docs/provider-config.example.toml`. That file is **gitignored** and must never be
committed. Model weights stay outside the repository.

## Desktop IPC: `load_private_local_provider_config`

The desktop shell returns a **CLI-parity** sanitized status object (snake_case JSON).
The fixed-path IPC reader does not probe endpoints and does not execute a provider.

Fields align with `realforge provider status --json`:

| Field | Purpose |
|-------|---------|
| `ok` | Home config read succeeded |
| `configured` | Chat provider + local endpoint + model flag |
| `source` | `home_private` or `defaults` (Workbench does not resolve env/repo) |
| `provider_kind` | Recognized generic provider kind |
| `trust` | Always `local_untrusted` |
| `endpoint_configured` | Local endpoint present and allowed |
| `endpoint_host` | Safe `http://localhost:…` style host only |
| `model_configured` | Boolean only — never exact model name |
| `api_key_configured` | Boolean only — never API key value |
| `image_provider_configured` | Optional image metadata present |
| `image_provider_kind` | Generic local image provider kind when configured |
| `image_endpoint_host` | Safe local image endpoint when configured |
| `image_provider_execution_enabled` | Always `false` |
| `warnings` | Non-secret advisory strings |
| `errors` | Structured `{ code, message }` entries |

Run `realforge provider status --json` in a terminal for full precedence
(env / home / repo / defaults). The Workbench status card uses its fixed redacted
config reader rather than executing that status command.

Run `realforge provider smoke --json` in a terminal to verify local runtime
reachability with a fixed minimal request. The command caps output and treats the
response as untrusted.

Workbench 0.25 can run that same fixed smoke command from Settings after a fresh
approval acknowledgement. The desktop bridge accepts no prompt, path, endpoint,
model identity, or arbitrary arguments. It returns a second sanitized report with
booleans, safe loopback host metadata, duration, structured errors, and a capped
**UNTRUSTED** preview. Web mode cannot run smoke, and the result is not persisted.
See the [provider smoke threat model](provider-smoke-threat-model.md).

## Settings UI

Settings → **Provider / Local Model** shows **Private Local Model** and
**Private Local Image Model** cards using only the sanitized fields above,
including **LOCAL UNTRUSTED** badges and a hint to run `realforge provider status --json`.
The provider smoke card is a fixed reachability check, not chat or general provider
execution.

Workbench 0.26 adds a separate **Private Chat Sandbox**. It sends one bounded
user-written text value only after a fresh approval acknowledgement. The runtime
receives no workspace context, files, tools, history, image request, or automatic
follow-up. The capped response remains **LOCAL UNTRUSTED** and stays in component
memory until Clear, reload, or application exit.

The corresponding CLI command reads text from stdin only:

```text
realforge provider chat-sandbox --stdin --json
```

The sandbox is not an agent and does not persist prompts or responses. See the
[private chat sandbox threat model](private-chat-sandbox-threat-model.md).

Workbench 0.27 keeps this authority unchanged while adding one-request-at-a-time
enforcement, desktop child-process cancellation, and explicit timeout/cancelled
states. Approval resets after each attempt. Users may clear only the visible
response or clear the entire sandbox; neither action writes history. Copy is an
explicit action that includes only the capped visible response with a **LOCAL
UNTRUSTED** label. No hidden transcript, audit record, workspace/file context,
tools, shell, writes, or image generation are added.

Workbench 0.28 adds a **Provider Readiness** dashboard above these separate
surfaces. It derives a sanitized lifecycle from provider status plus the fixed
smoke check's current-session status. It does not ingest the smoke response or chat
prompt/response bodies. The dashboard shows local configuration booleans, fixed
chat limits, metadata-only image-provider state, and an explicit disconnected list
for workspace context, files, tools, shell, memory, persistence, and image
generation. The trust boundary remains `local_untrusted`; private identity remains
local-only. See [provider readiness dashboard](provider-readiness-dashboard.md).

Workbench 0.29 consolidates the provider settings area into a single ordered
console: readiness, sanitized status, smoke, chat sandbox, disabled image-provider
metadata, and the disconnected-capability boundary. This removes duplicated copy
without combining the smoke and chat approval flows. Output remains
`local_untrusted`; private identity remains local-only; workspace, files, tools,
shell, memory, persistence, and image execution remain off. No new IPC or provider
authority is introduced.

## RealForge CLI

The Python RealForge CLI/runtime loads the same fixed home config file with precedence:

1. CLI flags / environment variables
2. `~/.realforge.local.toml`
3. Repo `.realforge.toml`
4. Defaults (`mock`)

Diagnostics redact API keys and exact model identity. Provider output remains
`local_untrusted`.

Use `realforge provider status` or `realforge provider status --json` for sanitized
provider diagnostics from the CLI.

Optional `[image_provider]` metadata is parsed for future local image providers;
execution is not enabled.

## Future work

- Wire image provider execution behind explicit staff gates
- Review any future provider-smoke audit metadata under a separate privacy/schema change
- Review any future chat audit metadata under a separate privacy/schema change
- Never commit private model names, weights, or secrets to the public repo
