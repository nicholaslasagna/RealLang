# RealForge image-generation workflow planning

RealForge 2.3 does not generate images. It adds a provider interface that can
produce an untrusted `ImagePromptSpec` for future image tools:

```bash
realforge image prompt \
  --provider mock \
  --task "design a dark cinematic forest monster concept"
```

Optional inputs include `--brief`, repeated `--style-note`, and
`--target-use-case`. Output contains prompt, negative prompt, style,
composition, lighting, camera, materials, constraints, intended-tool metadata,
risks, and `untrusted: true`.

The v2.3 output mode is always `prompt_spec`. The deterministic mock provider
does not call an image model, create a bitmap, write a texture, or invoke a
local/remote tool.

By default the command prints a readable report. `--json` prints the report
schema, and `--write` stores JSON under
`.realforge/multimodal/image_prompts/`. No binary output path exists in 2.3.

Prompt specifications require human review before use with any future image
provider. Generated results from future tools will need separate provenance,
content validation, and benchmark coverage.

## RealForge 2.4 planner

RealForge 2.4 retains `image prompt` and adds job specs, prompt packs, reference
boards, and iteration plans:

```bash
realforge image job --provider mock --task "plan a forest creature concept"
realforge image prompt-pack --provider mock --task "build forest creature prompt variants"
realforge image references --task "record approved references" --image references/creature.png
realforge image iterate --job <saved-job-id>
```

These commands still do not generate images. Provenance metadata records prompt
and reference hashes for the planning artifact; it is not proof that a future
provider generated or preserved a particular image. See
[Image workflows](realforge-image-workflows.md) for schemas and storage paths.
