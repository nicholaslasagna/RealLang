# RealForge vision reports

RealForge 2.3 adds an optional provider-backed vision report path:

```bash
realforge vision analyze \
  --image references/concept.png \
  --task "review this image for a future asset workflow" \
  --provider mock
```

The command loads one image inside the configured workspace, validates its
format and provider size limit, computes SHA-256, and constructs a structured
`VisionRequest`. Supported inputs in 2.3 are PNG, GIF, JPEG, and WebP.

`VisionAnalysis` output includes provider/model provenance, image hashes,
observations, style notes, likely uses, risks, limitations, confidence, and
`untrusted: true`.

## Mock behavior

The mock provider does not inspect semantic image content. It returns no
observed elements, confidence `0.0`, and explicit limitations. This validates
the request/report workflow without pretending that RealForge recognized
objects, people, style, text, or meaning.

Future configured vision providers may return semantic output, but that output
will remain untrusted and require validation.

## Safety

- Paths outside the workspace are rejected.
- Missing files, directories, unsupported formats, and oversized inputs are
  rejected before provider use.
- Images are read for hash/header metadata only by the mock workflow and are
  never modified.
- No OCR, image code execution, external model server, or internet access is
  required.
- `--write` stores JSON only under `.realforge/multimodal/vision/`.

`realforge creative image` remains the provider-free metadata-only command.
`realforge vision analyze` is the provider-interface path for future local
vision adapters.
