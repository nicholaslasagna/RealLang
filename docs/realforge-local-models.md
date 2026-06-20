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

### Ollama

```toml
[model]
provider = "ollama"
model = "qwen2.5-coder:32b"
base_url = "http://localhost:11434"
```

### OpenAI-compatible local server

For LM Studio, llama.cpp server, vLLM, or similar **local** endpoints:

```toml
[model]
provider = "openai_compatible_local"
model = "local-coder"
base_url = "http://localhost:1234/v1"
```

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
- API key management for cloud services
- Automatic file editing from model output without `--apply` and permission gates

## Provider interface

All providers implement:

- `generate_plan(task) -> AgentPlan`
- `generate(task) -> GenerationResult`

See `src/realforge/providers/base.py`.
