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
(env / home / repo / defaults). Workbench does not execute the CLI.

Run `realforge provider smoke --json` in a terminal to verify local runtime
reachability with a fixed minimal prompt. The command reads only the fixed private
home config, caps output, and treats the response as untrusted. Workbench does not
execute smoke yet.

## Settings UI

Settings → **Provider / Local Model** shows **Private Local Model** and
**Private Local Image Model** cards using only the sanitized fields above,
including **LOCAL UNTRUSTED** badges and a hint to run `realforge provider status --json`.

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
- Never commit private model names, weights, or secrets to the public repo
