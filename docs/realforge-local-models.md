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

Copy `.realforge.toml.example` to **`.realforge.local.toml`** (gitignored) for private
local models. Do not commit the local file — model identity stays on your machine.

### Ollama

```toml
[model]
provider = "ollama"
model = "<configured-locally>"
base_url = "http://localhost:11434"
```

### OpenAI-compatible local server

For privately served local endpoints (LM Studio, llama.cpp server, vLLM, or similar):

```toml
[model]
provider = "openai_compatible_local"
display_name = "Private Local Model"
model = "<configured-locally>"
base_url = "http://localhost:8000/v1"
trust = "local_untrusted"
```

See also `docs/provider-config.example.toml`.

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
- Session-only endpoint/model fields (no browser network calls)
- **LOCAL UNTRUSTED** trust label
- Instructions to copy `.realforge.toml.example` → `.realforge.local.toml`

Real config loading from disk in the desktop shell is future work; the public repo
stays provider-agnostic.

## Provider interface

All providers implement:

- `generate_plan(task) -> AgentPlan`
- `generate(task) -> GenerationResult`

See `src/realforge/providers/base.py`.
