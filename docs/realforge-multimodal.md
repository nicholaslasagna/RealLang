# RealForge multimodal provider interface

RealForge 2.3 adds an experimental multimodal provider abstraction for future
local vision, image-generation workflow, and embedding adapters. It is an
interface and report scaffold, not evidence that a live multimodal model is
configured.

## Capability inspection

```bash
realforge multimodal capabilities
realforge multimodal capabilities --provider mock --json
```

Capabilities report text, vision, image-generation workflow, and embedding
support plus image count/size limits. Inspection makes no provider or network
request.

The deterministic `mock` provider reports vision and image workflow support so
tests can exercise the interfaces. Mock vision performs no semantic image
recognition, and mock image generation returns prompt specifications only.

Existing Ollama and OpenAI-compatible local text adapters are represented as
text-only multimodal adapters in 2.3. Vision or image requests against them fail
with a clear unsupported-capability error; no live server is required.

## Trust boundary

- Provider output is always untrusted.
- Input images are workspace-bounded, hashed, size-limited, and never executed.
- No OCR runs.
- No network call is made by the mock provider or capability inspection.
- Reports write only with `--write` under `.realforge/multimodal/`.
- No binary image is generated.
- No existing text-provider or compiler safety gate is bypassed.

The interface is intentionally separate from the existing text provider base.
Future adapters can implement multimodal support without forcing every text
provider or test environment to install vision dependencies.

## Image workflow planning in 2.4

RealForge 2.4 composes the prompt-spec provider path into image job specs and
prompt packs. It also adds local reference boards and saved-job iteration plans.
The mock provider supplies deterministic planning fields for tests; it does not
call an image model. See [Image workflows](realforge-image-workflows.md).
