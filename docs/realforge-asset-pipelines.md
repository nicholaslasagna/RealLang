# RealForge asset pipelines

RealForge 2.6 adds experimental, planning-only asset and engine pipeline
reports. The planners connect optional creative and multimodal artifacts to
reviewable production steps without creating assets, executing tools, or
modifying projects.

## Asset pipeline command

```bash
realforge asset pipeline --provider mock \
  --task "turn a forest monster concept into a reviewed hero-prop workflow" \
  --target-engine unreal
```

Optional source references accept a saved 12-character artifact ID or a JSON
path inside the workspace:

- `--asset-brief`
- `--image-job`
- `--reference-board`
- `--vision-report`

Referenced files are workspace-bounded, limited to 1 MiB each, parsed as JSON,
and checked for expected schema fields. Their contents remain untrusted when
included in provider context. The resulting `AssetPipelinePlan` records source
IDs, target tools, production stages, modeling/texturing/material/collision/LOD
plans, naming and folder conventions, validation, performance budgets, and
risks.

## Engine planners

```bash
realforge engine pipeline --path MyGame --provider mock \
  --task "plan a reviewed asset workflow"
realforge unreal import-plan --path MyGame --provider mock \
  --task "plan a static-mesh import"
```

Both commands reuse the read-only engine scanner. Project paths must remain
inside the workspace. Provider file paths are validated as project-relative;
Unreal target paths must use a safe `/Game/...` virtual path.

`EnginePipelineReport.command_suggestions` are inert strings. RealForge does
not pass them to a shell, engine, or subprocess. Files listed under
`files_to_modify_if_approved` are planning metadata and are not modified.

## Storage and trust

All reports are untrusted, dry-run artifacts requiring human review. Explicit
`--write` stores JSON only under:

- `.realforge/pipelines/assets/`
- `.realforge/pipelines/unreal/`
- `.realforge/pipelines/blender/`
- `.realforge/pipelines/engines/`

The pipeline directory is gitignored and workspace-bounded. No write occurs
without `--write`. There is no asset output path, apply mode, command runner,
Unreal Editor integration, or Blender integration in 2.6.

## Limits

- Plans are not evidence that source artifacts are correct or production-ready.
- Performance budgets and import settings require project and platform validation.
- RealForge does not inspect meshes, textures, materials, Blueprints, or DCC scenes.
- No binary mesh, texture, material, animation, map, or project file is generated.
- Human approval and external validation remain required for every production action.
