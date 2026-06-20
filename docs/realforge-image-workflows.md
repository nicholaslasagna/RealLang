# RealForge image workflows

RealForge 2.4 adds an experimental image-generation workflow planner. It
creates structured job specs, prompt packs, metadata-only reference boards,
iteration plans, and provenance records. It does not generate binary images or
call live image APIs.

## Commands

```bash
realforge image job --provider mock --task "dark cinematic forest monster concept"
realforge image prompt-pack --provider mock --task "horror hallway key art"
realforge image references --task "approved visual references" \
  --image references/hallway.png --image references/lighting.png
realforge image iterate --job <saved-job-id>
```

All commands print reports by default and support `--json`. The commands that
create artifacts support explicit `--write`:

| Artifact | Storage path |
|----------|--------------|
| Image generation job | `.realforge/multimodal/image_jobs/` |
| Prompt pack | `.realforge/multimodal/prompt_packs/` |
| Reference board | `.realforge/multimodal/reference_boards/` |
| Iteration report | `.realforge/multimodal/iterations/` |

These directories are gitignored. No write occurs without `--write`, and no
main workspace source file is a workflow output.

## Planning artifacts

`ImageGenerationJob` combines one or more prompt specifications with intended
use, style, aspect ratio, requested candidate count, reference metadata,
negative-prompt strategy, selection criteria, an iteration plan, and a
provenance record.

`PromptPack` contains a base prompt, negative prompt, deterministic variants,
style and production notes, and risks. The mock provider makes these reports
repeatable for tests; it does not simulate generated pixels.

`ImageReferenceBoard` computes SHA-256 and basic file metadata for each bounded
reference. Its style summary comes only from task text. It does not identify or
interpret image contents.

`ImageIterationPlan` records review rounds, evaluation and reject criteria, and
refinement prompts. Human review is always required in 2.4. `image iterate`
loads an explicitly saved job and optionally writes a separate report; the job
file is never changed.

## Provenance limits

The provenance record stores the planner source, provider/model labels, a hash
of the prompt fields, reference-image hashes, creation time, and notes. This
helps reproduce and compare planning inputs. It does not prove that a future
provider used those inputs, authenticate a generated file, establish asset
ownership, or validate output quality.

## Safety boundary

- Provider output and every planning artifact are labeled untrusted.
- Reference paths must remain inside the workspace and point to supported,
  size-limited image files.
- Image contents are not executed, decoded by third-party libraries, or sent
  over a network.
- The mock provider performs no semantic vision analysis.
- No OCR, Pillow, OpenCV, Unreal, or Blender dependency is required.
- No binary image output path or live image-generation adapter exists in 2.4.
- Human review is required before using these plans with any future model or
  asset pipeline.

## Vision workflow integration

RealForge 2.5 adds separate `vision understand`, `vision compare`, and
`vision asset-brief` reports. They can supply review material for future image
jobs and asset pipelines, but 2.5 does not automatically connect or trust those
reports. Mock vision performs no semantic analysis. See
[Image understanding](realforge-image-understanding.md).
