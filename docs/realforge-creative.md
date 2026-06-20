# RealForge creative planning

RealForge 2.1 adds an experimental, local-first creative planning foundation.
It produces structured planning artifacts for game concepts, maps/worlds,
assets, and image metadata. It does not generate production assets or claim
AAA-quality output.

## Commands

```bash
realforge creative brief --provider mock --task "design an asymmetrical horror game"
realforge creative map --provider mock --task "design Hall 13 abandoned school map"
realforge creative asset --provider mock --task "design a forest monster statue prop"
realforge creative image --image references/statue.png
```

The brief, map, and asset commands call the configured local provider and
require one strict JSON object. Provider output is always labeled
`untrusted_provider_output: true`. Invalid JSON or invalid field types stop
safely without writing an artifact.

By default commands print JSON only. `--write` stores artifacts under:

- `.realforge/creative/briefs/`
- `.realforge/creative/maps/`
- `.realforge/creative/assets/`
- `.realforge/creative/images/`

Writes are explicit, gitignored, and restricted to the configured workspace.

## Image reports

RealForge 2.1 image support is metadata-only. It computes SHA-256, records file
size/type metadata, and reads PNG/GIF dimensions when available through the
Python standard library.

It does not identify objects, styles, people, locations, or gameplay meaning.
Without a future vision provider, reports state that no semantic image
identification was performed and that manual notes are required. Image files
are never modified, and paths outside the workspace are rejected.

RealForge 2.3 adds a separate `realforge vision analyze` provider-interface
path. The existing `creative image` command remains metadata-only and does not
silently invoke that provider path. See [Vision reports](realforge-vision.md).

RealForge 2.4 adds a separate image workflow planner for job specs, prompt
packs, metadata-only reference boards, and iteration plans. It does not alter
the 2.1 creative artifact formats or generate binary assets. See
[Image workflows](realforge-image-workflows.md).

## Safety boundary

- Creative artifacts are plans, not evidence that a game or asset exists.
- No mesh, texture, animation, map, or other binary asset is generated.
- No provider-suggested command is executed.
- No workspace source file is changed unless the user explicitly requests an
  artifact write, and writes stay under `.realforge/creative/`.
- Local provider output remains untrusted.

Future work may add creative evals, vision adapters, asset-pipeline planning,
and style-bible memory. Those capabilities are not implemented in 2.1.
