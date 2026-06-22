# RealForge local models

RealForge is designed to run with **local LLMs instead of cloud APIs**. Model selection
is configured in **`.realforge.toml`** at the project root.

RealForge remains **experimental**. Local model adapters can plan and generate RealLang
source, but **autonomous file editing remains permission-gated**. RealForge does not
claim to outperform Codex, Claude Code, or Cursor yet.

Planning output is **untrusted**. RealForge 0.5 adds context-aware planning through
`plan --include-context` and `ask --include-context`, but planning is not editing and
does not execute model-proposed commands.

## Configuration file

Store **private** provider settings in **`~/.realforge.local.toml`** in your user home
directory (gitignored). Do not commit that file, model weights, API keys, or private prompts.

**Model weights** belong outside the repository (for example a user-owned `~/Models/...`
directory on your machine). The public repo never tracks weight files.

The RealForge CLI and runtime read `~/.realforge.local.toml` when present. Diagnostics
show only redacted status (configured, provider kind, local endpoint host/port,
`model_configured`, `trust=local_untrusted`) — never API keys or private model names.

Public templates use generic labels only (**Private Local Model**, **user-configured local
model**, **OpenAI-compatible local provider**). Upstream model licenses and attribution
must be handled privately on your machine if you redistribute a derivative; the public
repo does not claim ownership of upstream weights.

Local model output remains **untrusted** until validated by RealForge adapters,
diagnostics, benchmarks, and staff approval gates where required.

### Configuration precedence (CLI/runtime)

1. Explicit CLI flags and environment variables (`REALFORGE_OLLAMA_URL`, `REALFORGE_OPENAI_COMPAT_URL`)
2. `~/.realforge.local.toml` (private, gitignored)
3. Repo-local `.realforge.toml` (public template values only)
4. Defaults (`mock` provider)

Provider output remains **untrusted** regardless of source.

### Provider status command (sanitized)

```bash
realforge provider status
realforge provider status --json
```

Reports redacted fields only: `configured`, `source` (`env`, `home_private`, `repo`,
`defaults`), `provider_kind`, `trust`, `endpoint_configured`, safe local `endpoint_host`,
`model_configured`, `api_key_configured` (boolean), `image_provider_configured`,
`image_provider_kind`, safe local `image_endpoint_host`, and
`image_provider_execution_enabled` (false until image execution ships).

Never prints API keys, exact private model names, weight paths, or full config contents.

Invalid `~/.realforge.local.toml` returns a structured error from `provider status`.
Other commands that call `load_config()` remain blocked until the home file is fixed.

Workbench Settings → **Provider / Local Model** shows the same sanitized status fields
via desktop IPC (`home_private` / `defaults` only). Use the CLI command in a terminal for
full env/repo precedence.

Public private-local templates use `trust = "local_untrusted"` on `[provider]`.

### Provider smoke command (reachability)

`provider status` verifies **configuration**. `provider smoke` reads only the fixed
private home config and verifies that its OpenAI-compatible local endpoint accepts a
minimal fixed chat request.

```bash
realforge provider smoke
realforge provider smoke --json
```

Smoke behavior:

- Only supports `openai_compatible_local`
- Sends the fixed prompt `Reply with OK.` (no arbitrary user prompt)
- Uses a very low `max_tokens` cap and a short timeout
- No tools, workspace context, file contents, or provider output persistence
- Treats model output as **untrusted**; prints only a capped response preview
- Redacts connection, HTTP, and JSON errors without returning headers or response bodies

Never prints API keys, exact private model names, model paths, or the full response when long.

Workbench 0.25 can run the same fixed smoke command from Settings in desktop mode
after explicit acknowledgement. It accepts no arbitrary prompt or arguments, returns
only sanitized status fields plus a capped **UNTRUSTED** preview, and does not persist
the response. Web preview cannot run it. See the
[Workbench smoke threat model](../workbench/docs/provider-smoke-threat-model.md).

### Private chat sandbox (single turn)

Workbench 0.26 and the CLI expose a bounded single-turn sandbox:

```bash
printf '%s' '<user text>' | realforge provider chat-sandbox --stdin --json
```

The command reads user text from stdin only. It applies input, output, token, and
timeout caps; sends no workspace context, files, tools, memory, or chat history; and
does not persist either body. Output is **LOCAL UNTRUSTED** and must be reviewed.
Workbench requires a fresh acknowledgement for every send, keeps the exchange in
component memory only, and refuses execution in web mode. This is not an agent or
image-generation interface. See the
[chat sandbox threat model](../workbench/docs/private-chat-sandbox-threat-model.md).

### Ollama

```toml
[model]
provider = "ollama"
model = "<configured-locally>"
base_url = "http://localhost:11434"
```

### OpenAI-compatible local server

For a user-configured OpenAI-compatible local provider:

```toml
[provider]
kind = "openai_compatible_local"
display_name = "Private Local Model"
model = "<configured-locally>"
base_url = "http://localhost:8000/v1"
trust = "local_untrusted"
```

See also `docs/provider-config.example.toml`.

### Optional private local image provider (future)

Image generation is **not executed** yet. You may add metadata for a future local image
provider in the same home config file:

```toml
[image_provider]
kind = "local_image_provider"
display_name = "Private Local Image Model"
base_url = "http://localhost:8188"
trust = "local_untrusted"
```

RealForge records redacted status only (`execution_enabled=false`). No browser or CLI
image calls are made in this milestone.

Environment variables still supplement config when `base_url` is omitted:

- `REALFORGE_OLLAMA_URL`
- `REALFORGE_OPENAI_COMPAT_URL`

## Commands (RealForge 0.2)

```bash
# Plan from configured provider (defaults to mock when no config file)
realforge ask --task "review diagnostics for hello.real"
realforge plan --task "review diagnostics for hello.real"

# Generate RealLang source (dry-run prints only; no file writes)
realforge generate --task "hello world program" --dry-run

# Explicit mock provider override (used in tests)
realforge plan --provider mock --task "offline plan"
```

`generate --apply --output path/to/file.real` writes only with explicit `--apply` and
`workspace-write` permission mode. Default behavior is dry-run.

## Built-in mock provider (default)

When `.realforge.toml` is absent, RealForge uses the deterministic `mock` provider.
Tests use `MockProvider` only and never require network access.

## Ollama adapter

`OllamaProvider` calls the local Ollama HTTP API (`/api/chat`) using `[model]` settings.
No cloud endpoints are contacted.

## OpenAI-compatible local adapter

`OpenAICompatibleLocalProvider` calls `/chat/completions` on the configured **local**
base URL only.

## What is intentionally excluded

- Cloud OpenAI, Anthropic, Gemini, or Cursor integrations
- Committing private model names, weights, API keys, or local paths into the public repo
- Automatic file editing from model output without `--apply` and permission gates

## Workbench private local model UI

Settings → **Provider / Local Model** shows a generic **Private Local Model** profile:

- OpenAI-compatible local provider type
- Sanitized chat/image status and local host/port only (no browser network calls)
- **LOCAL UNTRUSTED** trust label
- Instructions to copy `.realforge.toml.example` → `~/.realforge.local.toml`
- Desktop IPC reads sanitized metadata from the fixed home config file (no secrets)

See [private local provider](../workbench/docs/private-local-provider.md).

## Provider interface

All providers implement:

- `generate_plan(task) -> AgentPlan`
- `generate(task) -> GenerationResult`

See `src/realforge/providers/base.py`.
