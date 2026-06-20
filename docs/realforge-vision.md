# RealForge vision reports

RealForge 2.3 adds an optional simple provider-backed vision report path:

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

## Rich workflows in 2.5

RealForge 2.5 adds three richer report paths:

```bash
realforge vision understand --provider mock --image references/concept.png \
  --task "review creative and game-design implications"
realforge vision compare --provider mock \
  --image references/a.png --image references/b.png \
  --task "compare style consistency"
realforge vision asset-brief --provider mock --image references/concept.png \
  --task "prepare an asset planning brief"
```

`vision analyze` remains the smaller observation/style/use-case report.
`vision understand` adds structured creative, composition, lighting, material,
gameplay, asset, and map-planning fields. `vision compare` accepts two or more
images. `vision asset-brief` embeds the existing `AssetBrief` schema in an
untrusted image-to-asset planning report.

The mock provider does not inspect visual content. It reports
`semantic_analysis_performed: false`, confidence `0.0`, and explicit limitations.
Its comparison output describes hashes and workflow metadata, not visual
similarity. Its asset brief is task-derived scaffolding, not an inferred asset.

Explicit `--write` stores JSON under:

- `.realforge/multimodal/vision_understanding/`
- `.realforge/multimodal/vision_comparisons/`
- `.realforge/multimodal/vision_asset_briefs/`

No OCR, live vision model, internet access, or image mutation is required.
Future provider-produced semantic reports remain untrusted even when they set
`semantic_analysis_performed: true`.
