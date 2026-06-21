# RealForge Workbench UI prototype

This directory contains the first static interactive RealForge Workbench
prototype. It follows the approved near-black cockpit direction while remaining
offline-safe and disconnected from destructive backend actions.

Workbench 0.2 adds typed report contracts and defensive adapters under
`src/data/`. Checked JSON fixtures are compiled into a repository-owned browser
bundle so the static prototype can exercise future report ingestion without
fetching data or executing a command.

## Run

```bash
cd workbench
npm run dev
```

Then open `http://localhost:4173`. No package installation is required. The
prototype uses browser-native HTML, CSS, and JavaScript plus a repository-owned
Lucide icon subset.

## Validate

```bash
npm run check
npm test
npm run build
```

`npm run build` creates an ignored static copy under `workbench/dist/`.
`npm run fixtures` regenerates the checked browser fixture bundle after a source
JSON fixture changes; `npm run check` fails when that bundle is stale.

## Data flow

```text
source JSON fixture -> defensive adapter -> view model -> static renderer
```

Adapters collect warnings instead of throwing on missing or malformed optional
fields. Provider and generated output defaults to `UNTRUSTED`; staff-only report
data remains gated while Staff Mode is off. Type declarations cover the current
status, settings, capability, benchmark, patch/update, scheduler, creative,
image, vision, Unreal, Blender, asset, and engine-pipeline report families.

## Safety boundary

- All data is static and mocked.
- Command palette selections update display state only.
- Workbench submission stages text locally in browser memory only.
- Staff mode is a visual preview; the backend remains `STAFF OFF`.
- No fetch, WebSocket, command execution, file write, apply, commit, or merge
  integration exists.
- Future CLI/report JSON integration must preserve the same explicit trust and
  approval boundaries.

The planned integration order is pasted/local JSON report preview, read-only CLI
report loading, and then separately reviewed safe command composition. Arbitrary
JSON import and live CLI loading are not implemented in 0.2.
