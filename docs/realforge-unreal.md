# RealForge Unreal foundation

RealForge 2.1 provides Unreal project detection and dry-run planning. It does
not open Unreal Editor, run Unreal commandlets, edit project files, import
assets, or require Unreal Engine to be installed.

## Project scan

```bash
realforge engine scan --path /workspace/MyGame
```

The scanner detects a root `.uproject` file and the conventional `Config/`,
`Content/`, `Source/`, and `Plugins/` directories. It records the
`EngineAssociation` value when the descriptor is valid JSON and lists detected
`.uplugin` descriptors.

Scanning is read-only. The project path must be inside the configured
workspace. Optional `--write` stores the `EngineProjectProfile` under
`.realforge/engines/` without modifying the scanned project.

## Unreal plans

```bash
realforge unreal plan \
  --path /workspace/MyGame \
  --provider mock \
  --task "plan a map blockout and performance review"
```

The command combines the trusted filesystem scan with untrusted provider
planning output. It returns an `UnrealCommandPlan` with:

- proposed review and implementation steps
- project-relative files to inspect or potentially modify
- whether future work would require Unreal Editor
- command suggestions that are displayed but never executed
- explicit risks
- `dry_run_only: true`
- `requires_human_approval: true`
- `untrusted_provider_output: true`

Optional `--write` stores plans under `.realforge/engines/plans/`.

## Limits

- Detection is filesystem-based and does not validate assets or Blueprints.
- No Unreal installation is required or invoked.
- No editor scripting, command sandbox, map mutation, or asset import exists in
  2.1.
- A plan is not proof that the proposed Unreal workflow is correct or that it
  meets production performance or quality targets.

Future milestones may add a reviewed command sandbox and editor-scripting
dry-run layer. Direct engine mutation remains out of scope for 2.1.
