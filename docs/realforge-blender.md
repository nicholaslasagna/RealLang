# RealForge Blender planning

RealForge 2.6 adds a Blender-oriented asset planning report:

```bash
realforge blender asset-plan --provider mock \
  --task "model a twisted forest altar prop"
```

`BlenderAssetPlan` records modeling, sculpting, retopology, UV, texture-bake,
export, scale, pivot, collision-proxy, LOD, validation, and risk notes. It is a
planning artifact, not a `.blend` file or executable Blender script.

Blender does not need to be installed. RealForge does not locate, open, invoke,
script, or automate Blender. It does not generate geometry, UVs, textures,
materials, collision, rigs, animations, LODs, or export files.

Mock output is deterministic and untrusted. Future provider output will remain
untrusted and must be reviewed against the target engine, platform, source
brief, naming rules, and performance budgets.

By default the command prints a readable `UNTRUSTED / DRY RUN ONLY` report.
`--json` emits the full schema. Explicit `--write` stores JSON under
`.realforge/pipelines/blender/`; it never writes into a Blender or engine project.
