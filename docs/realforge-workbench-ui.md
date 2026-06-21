# RealForge Workbench UI prototype

The repository includes an experimental static RealForge Workbench prototype in
`workbench/`. It translates the approved cockpit design into an offline-safe,
repository-owned interface foundation for future CLI/report JSON integration.

The prototype includes Home, Workbench, Capabilities, Code, Research, Creative,
Image, Vision, Engine, Assets, Benchmarks, **Reports**, Updates, and Settings
screens (14 total) plus a searchable slash-command palette. Staff workflows are
hidden behind a clearly labeled visual preview and remain off by default.

This is not a backend integration. Built-in values are mocked or fixture-backed,
no RealForge command is executed from the browser, and no source, proposal, Git,
provider, network, engine, or asset operation is available. No auto-apply,
auto-commit, or auto-merge path exists.

## Architecture direction

Workbench started as a **static offline-safe prototype** (HTML + CSS + browser
JavaScript). That was appropriate for 0.1–0.3. RealForge Workbench is intended to
become a **flawless cross-platform desktop application** (macOS and Windows): a
Codex/Cursor/Claude-Code-like local AI engineering workbench — not a long-term raw
HTML dashboard or quick web UI.

Long-term stack: **React + TypeScript + Vite** frontend, **Tauri** desktop shell,
**local-first** runtime, **strict allowlisted bridge** (fixed `argv`, no shell
strings), with future installer packaging and code signing/notarization.

**Do not keep expanding the monolithic `js/components.js` shell for major
features.** After Workbench 0.4, follow the migration plan for desktop-ready
architecture.

See the migration plan: [React migration plan](../workbench/docs/react-migration-plan.md).

## Workbench 0.4 — manual CLI bridge catalog

Workbench 0.4 adds a **read-only CLI report catalog** on the Reports screen:

- Shared allowlist: `workbench/src/data/import/cli-report-sources.js`
- Dev-only Node bridge: `workbench/tools/realforge-report-bridge.mjs`
- UI copies `node tools/realforge-report-bridge.mjs load <id>` — **never runs it**
- User pastes JSON output into the import box; adapters treat it as untrusted

No localhost backend, no browser command runner, no shell bridge.

## Workbench 0.3 — report import

The **Reports** screen previews RealForge-style JSON (paste or sample fixtures).
Imported JSON is always untrusted; staff gating is enforced by the preview layer;
suggested commands are not executed.

## Workbench 0.2 — data architecture

Workbench 0.2 adds TypeScript declaration contracts, defensive report adapters,
status normalization, source JSON fixtures, and UI view-model composition under
`workbench/src/data/`.

Adapters tolerate missing optional fields, return validation warnings for
malformed values, default provider output to `UNTRUSTED`, and preserve dry-run,
staff-only, approval, local-only, network-off, readonly, and no-write states.

## Integration order

1. Fixture-backed static UI (0.1–0.2)
2. Paste/sample report import with trust hardening (0.3)
3. Manual CLI bridge catalog + Node helper (0.4)
4. **React/TS desktop app migration** (0.5) — **Phase 1 complete**: Vite + React shell, all 14 screens
5. **Tauri shell + packaging** (0.6–0.7) — installers, signing, read-only IPC bridge
6. Future: approval-gated local bridge (write paths, safe command composer)

Run and validation instructions are in [`workbench/README.md`](../workbench/README.md).
