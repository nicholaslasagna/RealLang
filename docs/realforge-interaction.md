# RealForge interaction and capabilities

RealForge 2.2 adds a read-only interaction foundation for a future local-first
AI engineering workbench. It does not add a GUI, TUI, interactive shell, hidden
autonomy, or new write paths.

## Capability registry

```bash
realforge capabilities
realforge capabilities --json
```

The registry describes these domains:

- code
- docs
- research
- creative
- image
- vision
- engine
- assets
- eval
- self-improvement
- scheduler

Each capability records its current status, safety level, available commands,
whether it may write files, staff/network requirements, description, and next
suggested command. Planned capabilities are labeled rather than presented as
implemented.

Staff-only commands are hidden while staff mode is disabled. The scheduler
capability remains visible as metadata so users can understand the platform's
safety boundary without receiving an operational staff command.

## Slash-command grammar

```bash
realforge slash
realforge slash --json
```

This prints mappings such as `/plan`, `/check`, `/repair`, `/creative`, and
`/engine` to existing CLI commands. It defines grammar for future GUI/TUI
clients; it does not start a shell or execute a mapped command.

Unsafe defaults are not introduced: `/repair` maps to `--dry-run`, research
retains its HTTPS/domain gate, and staff shortcuts only appear when staff mode
is explicitly enabled.

## Settings surfaces

```bash
realforge settings
realforge settings --json
realforge settings doctor
realforge settings doctor --json
```

`settings` shows effective provider, model, workspace, permission, staff,
scheduler, benchmark-gate, research-network, safety, and output-directory
settings. It does not expose secrets or modify configuration.

`settings doctor` reports `PASS`, `WARN`, or `BLOCKED` for:

- workspace boundary validity
- staff and scheduler gates
- refused `auto_apply` / `auto_commit` settings
- local provider configuration or mock fallback
- explicit research network behavior
- `.realforge` gitignore coverage
- output-directory boundaries
- scheduler benchmark gate

Warnings do not weaken safety. A blocked configuration returns a nonzero exit
status and remains unchanged.

## UI readiness

All three command families have `--json` output backed by the same dataclasses
used for terminal formatting. A future UI can consume these reports without
parsing terminal text. Human-readable output remains the default.

The optional `realforge interact` loop is deferred. It should only be added as
a separate vertical slice with no-write defaults, explicit provider calls, and
no hidden autonomy.

RealForge 2.3 updates the image and vision capability entries with
`multimodal capabilities`, `vision analyze`, and prompt-spec-only `image prompt`
commands. These remain structured, untrusted workflows and do not add an
interactive shell or binary image generation.

RealForge 2.4 expands the image capability entry with `image job`,
`image prompt-pack`, `image references`, and `image iterate`. The `/image`
grammar maps to `image job`; it still executes nothing by itself. Every 2.4
artifact is untrusted and binary image generation remains unimplemented.
