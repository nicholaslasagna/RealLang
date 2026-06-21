# RealForge Workbench UI prototype

This directory contains the first static interactive RealForge Workbench
prototype. It follows the approved near-black cockpit direction while remaining
offline-safe and disconnected from destructive backend actions.

Workbench 0.2 adds typed report contracts and defensive adapters under
`src/data/`. Checked JSON fixtures are compiled into a repository-owned browser
bundle so the static prototype can exercise future report ingestion without
fetching data or executing a command.

Workbench 0.3 adds a **read-only JSON report import mode** (the **Reports**
screen). A user can paste or load a RealForge-style report and preview it safely
through the same 0.2 adapters. No backend command is executed, no file is
written, no network request is made, and imported JSON is treated as untrusted.

Workbench 0.3.1 hardens that import path. Imported JSON is **always** treated as
untrusted regardless of its own fields, source-declared validation is shown as a
*claim* rather than RealForge verification, staff gating is enforced by the
preview layer (not by the payload), preview rendering is bounded, and the
adapters now align better with real RealForge 2.7 backend report shapes.

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
invocation, and no network access.

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

The planned integration order is pasted/local JSON report preview (0.3), then
read-only CLI report loading, then a separately reviewed safe command composer,
and finally an approval-gated backend bridge. Read-only CLI loading and any
live backend connection are not implemented in 0.3.
