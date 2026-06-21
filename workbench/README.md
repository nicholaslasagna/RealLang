# RealForge Workbench UI

This directory contains the RealForge Workbench — a local-first AI engineering
interface prototype evolving toward a cross-platform desktop app (macOS +
Windows). **0.5 Phase 1** migrated the UI to **React + TypeScript + Vite**;
**0.5b** migrated the data layer to typed TypeScript modules; **0.5c** tightened
TypeScript strictness on import/CLI/view-models, split design tokens, and improved
cross-platform Node bridge Python resolution — still no backend execution.

Historical milestones:

- **0.1** static offline UI prototype
- **0.2** typed report contracts and defensive adapters (`src/data/`)
- **0.3** read-only JSON report import (Reports screen)
- **0.3.1** import trust hardening
- **0.4** manual read-only CLI bridge catalog
- **0.5** React + TypeScript + Vite app shell (all 14 screens)
- **0.5b** TypeScript data layer migration (adapters, import, CLI catalog, fixtures)
- **0.5c** TypeScript strictness, CSS token split, cross-platform bridge prep

## Run (React app — default)

```bash
cd workbench
npm install   # first time only
npm run dev
```

Open `http://localhost:5173`. Vite serves the React app with repository-owned
assets and the existing cockpit CSS.

## Legacy static shell (reference)

The pre-React HTML/JS prototype is preserved under `legacy/`:

```bash
npm run dev:legacy
```

Then open `http://localhost:4173` (serves `legacy/index.html`).

## Validate

```bash
npm run check      # fixtures + syntax + tsc
npm test           # node tests + vitest React tests
npm run build      # production dist/ (offline bundle)
npm run build:data # legacy bundle + Node CLI allowlist artifacts
npm run smoke:visual  # Playwright layout smoke at 1024px and 1440px (after build)
```

`npm run build` writes `workbench/dist/` (Vite output). `npm run build:data`
builds the legacy data bundle and Node CLI allowlist. Fixture JSON lives under
`src/data/fixtures/` and is imported directly by the TypeScript modules.

## Architecture (0.5c)

```text
src/data/
  contracts/report-contracts.ts   → import/adapter/shared types
  status/status.ts                → fully typed normalization
  cli/cli-report-sources.ts       → typed allowlist (no @ts-nocheck)
  import/report-import.ts         → typed import engine (no @ts-nocheck)
  view-models/workbench-view-models.ts
  adapters/report-adapters.ts     → still @ts-nocheck (large legacy module)
  workbench-data.ts               → app-facing data API
src/styles/
  tokens-colors.css / tokens-layout.css / tokens-status-badges.css
tools/
  resolve-python.mjs              → cross-platform venv Python resolution
  realforge-report-bridge.mjs     → dev-only read-only CLI bridge
legacy/js/data-bundle.js          → esbuild IIFE for legacy shell
```

**Safety unchanged:** no fetch/network, no browser command execution, no apply/
run, imported JSON always untrusted, staff preview off by default. Tauri desktop
shell remains a future phase — see [docs/react-migration-plan.md](docs/react-migration-plan.md).

## Report import (0.3 / hardened in 0.3.1)

The **Reports** screen previews RealForge-style JSON reports without a backend:

- Paste JSON, or load a built-in sample (skill benchmark, update bundle +
  proposal, creative brief, vision report, settings, capability registry).
- The report type is auto-detected from its fields (for example
  `task_results` + `domain_scores` -> skill benchmark, `patch_sha256` /
  `patch_targets` -> patch proposal, `candidate_version` -> update bundle,
  `capabilities` -> capability registry, `sections` -> settings,
  `detected_subjects` / `asset_opportunities` -> image understanding). A manual
  type selector is always available, and unmatched JSON falls back to a generic
  raw field preview marked **UNRECOGNIZED**.
- The preview reuses the report adapters, so it shows the report type, parsed
  summary, key fields, adapter warnings, safety labels, whether the report is
  staff-only, and whether provider output is untrusted.
- A persistent banner states that imported JSON is untrusted and that RealForge
  will not execute commands or apply changes from a report.
- Suggested commands inside a report are shown as suggestions only and marked
  **NOT EXECUTED**. Patch, proposal, merge, and update reports are labeled
  **review only** with a disabled apply control (the backend bridge is not
  connected).
- Staff-only reports stay gated while Staff Mode is off: advanced details remain
  locked until the staff UI preview is enabled, which changes no backend state.

**Trust invariants (0.3.1).** The import preview layer enforces trust; it does
not let the imported payload describe itself as safe:

- Imported JSON is **always** treated as untrusted. Fields like
  `"untrusted": false` cannot remove the UNTRUSTED label.
- A source-declared `"status": "VALIDATED"` (or a `VALIDATED` safety label) is
  surfaced as **VALIDATION CLAIMED · UNVERIFIED**, never as RealForge
  verification.
- Staff gating is derived from the report **type** plus the Workbench staff
  state. A payload's `"staff_only": false` cannot unlock a staff-only report
  type (update bundle, scheduler run); a payload may only opt into stricter
  gating.
- Adapters align with real RealForge 2.7 backend shapes — skill-bench
  (`domain_scores`, `normalized_score`, `task_results`, `passed`,
  `safety_failures`), eval (`tasks`, `scores`, `total_score`, `passed`,
  `failures`), and patch proposals (`patch_sha256`, `patch_targets`,
  `files_to_modify`, `unified_diff`) — without breaking the simplified fixture
  shapes. Image-understanding reports route to the richer adapter.
- Preview rendering is bounded: long lists and long text are capped with a clear
  **+N more** affordance, and suggested commands wrap instead of clipping.
- If auto-detect sees one type but you manually select another, the preview
  warns: "This JSON looks like X, but you selected Y."

Imported JSON is parsed in the browser only. There is no file read, no CLI
invocation from the browser, and no network access.

## CLI report bridge (0.4)

Workbench 0.4 adds a **manual, read-only CLI bridge catalog** on the Reports
screen. It does **not** execute commands from the browser.

- `workbench/src/data/import/cli-report-sources.js` is the shared allowlist of
  fixed `argv` arrays (no shell strings, no user args).
- `workbench/tools/realforge-report-bridge.mjs` is a local Node helper for
  developers: `node tools/realforge-report-bridge.mjs load <source-id>`.
- The UI shows each allowlisted source, copies the bridge command to the
  clipboard, and instructs you to paste the JSON output into the import box.
- Denied subcommands include write/apply/scheduler/staff flows (`repair`,
  `propose-patch`, `scheduler-run`, `apply-proposal`, etc.).

```bash
cd workbench
npm run bridge:list
node tools/realforge-report-bridge.mjs load capabilities
```

Output remains **untrusted** until adapted by the import pipeline. No localhost
backend, no browser-to-shell bridge, and no live UI execution.

## Data flow

```text
source JSON fixture -> defensive adapter -> view model -> static renderer
pasted/sample JSON  -> defensive adapter -> import preview (read-only, untrusted)
```

Adapters collect warnings instead of throwing on missing or malformed optional
fields. Provider and generated output defaults to `UNTRUSTED`; staff-only report
data remains gated while Staff Mode is off. Type declarations cover the current
status, settings, capability, benchmark, patch/update, scheduler, creative,
image, vision, Unreal, Blender, asset, and engine-pipeline report families.

## Safety boundary

- All built-in data is static and mocked.
- Command palette selections update display state only.
- Workbench submission stages text locally in browser memory only.
- Imported report JSON is parsed in-browser only, **always** treated as
  untrusted regardless of its own fields, and never executed or applied.
  Suggested commands are display-only; patch/update reports are review-only with
  no working apply control.
- Source-declared validation in an imported report is a *claim*, not RealForge
  verification, and is labeled as such.
- Staff mode is a visual preview; the backend remains `STAFF OFF`. Staff gating
  for imported reports is enforced by the preview layer (report type + Workbench
  staff state); a payload cannot lower it.
- No fetch, WebSocket, command execution, file write, apply, commit, or merge
  integration exists.
- Future CLI/report JSON integration must preserve the same explicit trust and
  approval boundaries.

The planned integration order is pasted/local JSON report preview (0.3), manual
read-only CLI catalog (0.4), React/TypeScript app shell (0.5), Tauri desktop
shell (0.6+), then a separately reviewed safe command composer and
approval-gated local bridge.

## Next milestone (0.6)

Phase 2 (0.5b) and 0.5c hardened the TypeScript data layer, CSS tokens, and
cross-platform bridge prep. Next: **Tauri desktop shell** — see
[docs/react-migration-plan.md](docs/react-migration-plan.md).
