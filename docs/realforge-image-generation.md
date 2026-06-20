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
