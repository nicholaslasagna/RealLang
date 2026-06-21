# Workbench navigation & UI hierarchy (0.15-0.16)

0.15 is a **UI declutter** milestone — it polishes hierarchy and reduces visual
noise. It changes **no** behavior, execution, or safety boundary.

## Navigation hierarchy

The sidebar is grouped so normal users see a calm surface and advanced/security
detail is one click away without dominating:

| Group | Screens |
|-------|---------|
| **Core** | Home · Workbench · Capabilities |
| **Engineering** | Code · Research |
| **Studio** | Creative · Image · Vision · Engine · Assets |
| **Evaluate** | Benchmarks · Security |
| **System** | Reports · Updates · Settings |

- Security moved from a standalone "Advanced" group into **Evaluate** (beside
  Benchmarks); Reports moved into **System**. The "Advanced" group is removed.
- Group headers are quieter; a thin divider separates secondary groups.
- The active item has a clearer left-accent + bolder label.

## Normal vs advanced surfaces

- **Normal:** Home, Workbench, Capabilities, Studio, Benchmarks.
- **Advanced / security / system:** Security, Reports, Updates, Settings — fully
  available, just visually secondary. Staff controls remain **off by default**
  and gated; Updates stays locked until staff preview is enabled.

## Version labeling

The sidebar footer shows the two versions honestly and separately:

- **Workbench 0.15** (the desktop UI)
- **RealForge backend 2.7** (the Python backend)

Stale "Version 2.7" copy is gone; versions are never conflated.

## Safety status cluster (top bar)

The five safety statuses are grouped into one compact cluster with a single loud
primary (a green **SAFE** lead) and quiet detail pills carrying tooltips:

- READONLY · LOCAL ONLY · NETWORK OFF · DOCTOR PASS · STAFF OFF/PREVIEW

No safety information is removed — on narrower desktops the pills collapse to
icons with tooltips, and the same labels also appear in Settings → Safety/Doctor.

## Security Center UX

- Clear sections: **Known findings** → **Read-only scan bridge** (live scans +
  dependency evidence) → **Deep security review** (future capabilities).
- Cards show only essential badges (status, severity, fix availability); the full
  badge set (human review, untrusted, platform tags) appears in the detail
  inspector.
- esbuild reads as **RESOLVED** (done/validated); glib reads as **BLOCKED
  UPSTREAM / TRACKED · NO FIX YET** — intentionally tracked, not broken, and never
  marked fixed.
- `npm audit` keeps its **MAY REQUIRE NETWORK** warning. "Plan fix" stays
  obviously **preview-only**; no scan runs without an explicit click.

## Composer polish

- The composed action title leads; the exact argv preview stays visible but
  visually secondary.
- The inspector **summarizes first** (one plain-language line about preview/
  approval state) and shows facts/requirements second.

## Responsive

Verified at 1024 / 1280 / 1440 with no horizontal overflow: the inspector hides
below 1100px, the status cluster collapses to icon-only pills below 1100px, and
the sidebar narrows to icons below 980px.

## Versioning & About (0.16)

Two versions are tracked and **never conflated**:

- **Workbench** (this desktop UI): `0.16.0`
- **RealForge backend** (the Python engine): `2.7`

0.16 aligns every Workbench version surface to `0.16.0`: `package.json`,
`package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the Rust
constants (`mod.rs`, `update.rs`), the frontend constant (`web-fallback.ts`), the
sidebar footer, the runtime/About surface, and the Update Center "Current version".
The desktop bundle metadata therefore matches the UI. A `version-alignment`
regression test pins these so a stale `0.12.0`/`0.10`/`0.15` label cannot silently
return.

The sidebar footer shows **Workbench 0.16.0** with **RealForge backend 2.7** beside
it. **Settings → General → About** ("About RealForge Workbench") adds a calm runtime
surface: Workbench version, backend version, runtime mode (web preview / desktop),
platform, bridge mode, update status, build channel, workspace status, and a
security-posture summary. Its **Copy diagnostics** button copies inert JSON only —
versions, modes, and statuses — with **no** environment variables, secrets, keys,
file paths, or command output. The Update Center uses the **Workbench** version (not
the backend version) for app-update metadata.

## Onboarding states (what / why / next)

Empty, loading, and error states answer three questions consistently — *what
happened*, *why it matters*, and the *next safe action* — via the shared
`StateNote` component and the existing workspace/update panels. This covers
workspace missing, saved workspace moved/deleted, Python/CLI missing, bridge
unhealthy, web-mode unsupported, Update Center not configured, "no scan run yet",
`npm audit` clean, scan failed, and staff-off. States stay calm unless genuinely
dangerous.

## What did not change

No backend execution, no auto-fix, no write bridge, no shell, no arbitrary args,
no new IPC commands, no weakened staff gating, and no removed warnings. 0.16 is a
metadata/About/onboarding polish milestone only.
