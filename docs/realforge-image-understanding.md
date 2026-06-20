# RealForge image understanding

RealForge 2.5 expands the experimental vision adapter foundation with richer,
structured reports for creative review, image comparison, game and map planning,
and asset-brief preparation. Reports are provider-produced and untrusted.

## Commands

```bash
realforge vision understand --provider mock --image references/concept.png \
  --task "analyze visual style for a horror game asset"
realforge vision compare --provider mock \
  --image references/a.png --image references/b.png \
  --task "compare style consistency"
realforge vision asset-brief --provider mock --image references/concept.png \
  --task "prepare a prop asset brief"
```

All commands support `--json`. Explicit `--write` stores JSON under the
corresponding `.realforge/multimodal/vision_*` directory. Reports are gitignored,
and no write occurs without `--write`.

## Report types

`ImageUnderstandingReport` records validated image metadata and hashes alongside
provider output for subjects, environment, composition, lighting, palette,
materials, style, mood, gameplay relevance, asset opportunities, map-design
opportunities, risks, limitations, confidence, and an explicit
`semantic_analysis_performed` marker.

`ImageComparisonReport` records two or more validated inputs, all hashes,
similarities, differences, style-consistency notes, asset-pipeline notes, risks,
limitations, and confidence.

`ImageToAssetBriefReport` links one source hash to the existing `AssetBrief`
schema plus inferred constraints and engine, modeling, texture, collision, and
animation notes. It is a planning report, not an asset or import instruction.

## Mock behavior

`MockMultimodalProvider` is deterministic and offline. It does not inspect
semantic image content. Understanding reports set
`semantic_analysis_performed: false`, report no detected subjects, and use
confidence `0.0`. Comparison reports describe validated hashes and workflow
metadata only; hash differences do not establish visual differences. Mock asset
briefs are task-derived scaffolding and contain explicit manual-review steps.

This behavior tests schemas, safety boundaries, provider dispatch, and report
storage without claiming image recognition.

## Safety boundary

- Image paths are workspace-bounded and must be regular supported files.
- Provider image-count and byte-size limits are enforced before provider use.
- Images are hashed and header-inspected but never modified or executed.
- No OCR, Pillow, OpenCV, live model, internet access, or binary generation is
  required.
- Provider output remains untrusted, including output from future semantic
  vision adapters.
- Reports do not automatically edit source files, create assets, invoke engines,
  or feed another workflow.
- Human validation is required before using any report in a production pipeline.
