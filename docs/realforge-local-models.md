# RealForge local models

RealForge is **local-first**. It does not require API keys or cloud providers.
When you want model-assisted planning beyond the built-in `mock` provider, RealForge
supports optional **local** adapters only.

## Built-in mock provider (default)

```bash
realforge ask --provider mock --task "review diagnostics for hello.real"
```

`MockProvider` is deterministic and fully offline. It demonstrates the provider
interface and agent plan format without calling any network service.

## Ollama (scaffolded)

Ollama runs models locally via HTTP. RealForge 0.1 includes an `OllamaProvider`
scaffold but does not require Ollama for tests or core workflows.

Configure the base URL:

```bash
export REALFORGE_OLLAMA_URL=http://127.0.0.1:11434
```

`realforge doctor` reports whether this variable is set. Connectivity probing is not
implemented in 0.1.

## OpenAI-compatible local servers (scaffolded)

Tools such as LM Studio, llama.cpp server, or vLLM often expose a local
OpenAI-compatible HTTP API. RealForge includes `OpenAICompatibleLocalProvider` as a
scaffold for those endpoints — **local servers only**, not cloud OpenAI.

```bash
export REALFORGE_OPENAI_COMPAT_URL=http://127.0.0.1:1234/v1
```

## What is intentionally excluded (v0.1)

- Cloud OpenAI, Anthropic, Gemini, or Cursor integrations
- API key management
- Automatic file editing from model output without permission gates

## Provider interface

All providers implement `ModelProvider.generate_plan(task) -> AgentPlan` in
`src/realforge/providers/base.py`. New local adapters should subclass this interface
and remain testable without network access where possible.
