# RealForge Workbench — React migration plan (0.5+)

This document proposes a **phased migration** from the current static HTML/CSS/JS
prototype to a **TypeScript-first, componentized desktop application** suitable for
a Codex/Cursor/Claude-Code-like local AI engineering experience on **macOS and
Windows**. It is the recommended next milestone **after** Workbench **0.4**
(manual read-only CLI bridge catalog).

RealForge Workbench must not remain a long-term raw HTML dashboard or a quick web
UI. The static prototype is a **design and safety proving ground** that must evolve
into a **flawless, beautiful, seamless cross-platform desktop product**: local-first,
strictly allowlisted local bridge, no arbitrary shell, no browser-to-random-backend
behavior.

Do **not** add major new features to `js/components.js` after 0.4.

## Product direction (desktop-first)

| Principle | Implication |
|-----------|-------------|
| macOS + Windows | First-class on both; Linux dev-friendly but not a packaging priority yet |
| Native-feeling UX | Window chrome, menus, shortcuts, focus, scroll, and density match premium desktop tools — not a webpage in a frame |
| Local-first | State, settings, and reports live on disk; network is explicit and off by default |
| Strict bridge | UI talks to RealForge only through `src/bridge/` — fixed allowlist, fixed `argv`, never shell strings |
| Tauri preferred | Rust shell + WebView2 (Windows) / WebKit (macOS); no Electron unless requirements change |
| Packaging-ready | Installers, updates, code signing, and notarization are planned constraints, not afterthoughts |
| Safety preserved | Imported JSON, provider output, and CLI output remain untrusted; staff mode gated |

**Non-goals for the web prototype era:** localhost API as the long-term trust boundary,
dev-server-only behavior in production, arbitrary command composition, auto-apply/commit/merge.

## Current architecture inventory (0.1–0.4)

### Runtime (static prototype)

| Piece | Path | ~size | Role |
|-------|------|-------|------|
| Entry | `index.html` | — | Script-tag bootstrap, no bundler |
| App controller | `js/app.js` | 282 LOC | Global `state`, routing, events |
| UI monolith | `js/components.js` | 546 LOC | String templates for **all 14 screens** |
| Navigation/fixtures | `js/mock-data.js` | 36 LOC | Screen list + fixture view models |
| Styles | `styles.css` | 2,445 LOC | Global cockpit design system |
| Dev server | `python3 -m http.server 4173` | — | Static file host only |

### Data layer (preserve)

| Piece | Path | Role |
|-------|------|------|
| Contracts | `src/data/contracts/report-contracts.d.ts` | Report family types |
| Adapters | `src/data/adapters/report-adapters.js` | Defensive parsing, warnings |
| View models | `src/data/viewModels/workbench-view-models.js` | Fixture → render models |
| Import | `src/data/import/report-import.js` | Paste/sample JSON, trust hardening |
| CLI allowlist | `src/data/import/cli-report-sources.js` | Fixed `argv`; shared UI + Node bridge |
| Status | `src/data/status.js` | Safety label helpers |
| Fixtures | `src/data/fixtures/*.json` | Checked source JSON |
| Fixture bundle | `src/data/fixtures/fixture-bundle.generated.js` | Browser import bundle |

### Tooling (preserve)

| Piece | Path | Role |
|-------|------|------|
| Bridge | `tools/realforge-report-bridge.mjs` | Dev-only Node helper; **not** in browser |
| Build | `scripts/build.mjs` | Offline `dist/` copy |
| Fixtures | `scripts/generate-fixtures.mjs` | Regenerate bundle |

### Tests (preserve and extend)

| File | Tests | Focus |
|------|-------|-------|
| `tests/data-adapters.test.mjs` | 7 | Adapters, view models, staff gating |
| `tests/report-import.test.mjs` | 25 | Import trust, detection, bounds |
| `tests/ui-structure.test.mjs` | 10 | Offline, screens, safety copy, CLI catalog |
| `tests/cli-report-bridge.test.mjs` | 6 | Allowlist, bridge, no browser exec |

**Total: 48 tests** (`npm test`).

### Screens (14)

`home`, `workbench`, `capabilities`, `code`, `research`, `creative`, `image`,
`vision`, `engine`, `assets`, `benchmarks`, `reports`, `updates`, `settings`

### Workbench 0.4 boundary (complete)

- **Browser:** Reports screen shows allowlisted CLI sources; copies
  `node tools/realforge-report-bridge.mjs load <id>` to clipboard only.
- **Terminal:** Developer runs bridge manually; pastes JSON into import box.
- **Allowlist (only):** `capabilities --json`, `slash --json`, `settings doctor --json`
- **No:** fetch, WebSocket, localhost backend, browser command runner, shell strings,
  apply/run, arbitrary args.

---

## What to preserve

- Polished near-black cockpit visual design (tokens, spacing, typography)
- All 14 screens and navigation groups
- Slash command palette (preview-only; domain search)
- Report import + 0.3.1 trust hardening (untrusted payload, staff gates, bounds)
- CLI bridge catalog (manual terminal workflow)
- Fixture-driven development without live providers
- Staff UI preview (off by default; no backend mutation)
- Safety copy: readonly, local-only, network off, no auto-apply/commit/merge
- Data adapters and contract semantics
- Existing Node tests (port, do not delete)

## What to replace

| Current | Replacement |
|---------|---------------|
| `js/components.js` monolith | React components per screen/feature |
| `js/app.js` global state + `render()` | Typed store + React tree |
| `innerHTML` string templates | JSX + `escape`/structured rendering |
| `styles.css` monolith | Design tokens + CSS modules per component |
| Script-tag load order | Vite ESM graph |
| Implicit module globals (`window.RealForge*`) | Explicit TS imports |

## Target stack

| Layer | Choice |
|-------|--------|
| UI | React 18+ |
| Language | TypeScript |
| Build / dev | Vite |
| Styling | CSS modules + shared tokens (extracted from `styles.css`) |
| State | Zustand or small React context slices |
| Routing | Internal screen router first (match `state.screen`); URL routes optional later |
| Desktop (later) | **Tauri 2** — IPC only through `src/bridge/`; WebView2 (Win) / WKWebView (macOS) |

## Cross-platform desktop architecture

### 1. macOS and Windows path differences

All path logic must go through **platform-safe utilities** (`path` in Node/Rust,
`src/bridge/path-utils.ts` in the frontend for display only). Never concatenate
paths with hardcoded `/` or assume Unix layout in shared code.

| Concern | Rule |
|---------|------|
| Path separators | Use `path.join` / `path.resolve` (Node) or `std::path` (Rust). UI displays paths with OS-native separators via bridge metadata, not string hacks |
| Workspace roots | Stored as absolute paths from OS dialogs (`tauri-plugin-dialog`); validated on bridge side; never trust pasted paths for execution |
| Executable discovery | `realforge` resolved by bridge: bundled sidecar (Tauri), venv `Scripts\python.exe` (Win) vs `bin/python` (macOS), or `PATH` lookup — **never** user-typed binary paths |
| Shell differences | **Avoid shells entirely.** `execFile` / `Command::new` with argument arrays only — no `cmd.exe /c`, no `sh -c`, no string interpolation |
| Quoting | **Never build shell strings.** Display commands (`realforge capabilities --json`) are labels only; execution uses frozen `argv` arrays from the allowlist |
| Dev-only scripts | `tools/realforge-report-bridge.mjs` may use Unix venv paths today; isolate Unix-only assumptions in `tools/` and document Windows parity before Tauri ships |

```typescript
// src/bridge/path-utils.ts (planned)
import { join, normalize } from "node:path";

/** Join segments for bridge-side use only; never for shell commands. */
export function joinWorkspace(...segments: string[]): string {
  return normalize(join(...segments));
}
```

**Windows notes:** `USERPROFILE` vs `HOME`, `LOCALAPPDATA` for app data, drive letters,
long paths (`\\?\` prefix in Rust when needed). **macOS notes:** `~/Library/Application Support`,
notarization-friendly file locations, Gatekeeper-friendly signed bundles.

### 2. Local process bridge safety

The bridge is the **only** place subprocesses run. The React UI never spawns processes.

| Control | Requirement |
|---------|-------------|
| No arbitrary command strings | UI sends **source IDs** or typed IPC enums — never raw CLI text |
| Fixed allowlist | `cli-report-sources.ts` is single source of truth (UI catalog + Node dev bridge + Tauri commands) |
| Fixed `argv` arrays | Each source defines `argv: readonly string[]`; bridge appends nothing from user input |
| Timeout / max output | Default 15s timeout, 2MB stdout cap (already in dev bridge); Tauri commands enforce the same |
| Sanitized environment | Minimal env: `PATH`, home, locale, `PYTHONPATH` to repo `src` — no inherited API keys unless later explicitly designed |
| Structured errors | `{ code, message, sourceId, stderr? }` — never throw opaque strings to UI |
| Write-capable commands | **Deferred** until approval-gated milestone; denylist `apply`, `scheduler`, `staff`, `commit`, `merge`, `write` in bridge |
| Output trust | All stdout JSON flows through report import adapters as **untrusted** |

```typescript
// src/bridge/types.ts (planned)
export type BridgeErrorCode =
  | "UNKNOWN_SOURCE"
  | "TIMEOUT"
  | "OUTPUT_TOO_LARGE"
  | "EXEC_FAILED"
  | "PARSE_FAILED"
  | "DENYLISTED";

export interface BridgeResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: BridgeErrorCode; message: string };
}
```

Current dev bridge (`tools/realforge-report-bridge.mjs`) already uses `execFileSync`,
fixed `argv`, timeout, max buffer, and sanitized env — Tauri must mirror this contract.

### 3. Desktop packaging readiness (Tauri preferred)

| Layer | Responsibility |
|-------|----------------|
| `app/` (Vite + React) | UI only — no `child_process`, no `fetch` to localhost by default |
| `src/bridge/` | TypeScript IPC client; maps to Tauri `invoke` commands |
| `src-tauri/` (0.6+) | Rust: allowlisted process spawn, path resolution, settings persistence, workspace access |
| `tools/` | Dev-only Node helpers; not shipped in production installer |

**Tauri over alternatives:** smaller binary, OS webview, Rust-side process control fits
allowlist model, native dialogs and menus, built-in updater hooks for signed releases.

**Production constraints:**

- No reliance on `python3 -m http.server` or Vite dev server in the shipped app
- Frontend built to static assets embedded or served from `asset://` / Tauri resource protocol
- No raw `localhost` HTTP API as the trust boundary unless deliberately designed, authenticated, and locked to loopback with explicit user consent
- Clear separation: **UI state** (React) vs **local bridge** (Rust) vs **RealForge CLI** (Python subprocess with fixed argv)

**Future packaging checklist (documented, not implemented in 0.5):**

- macOS: `.app` bundle, Developer ID signing, notarization, stapled tickets
- Windows: MSI or NSIS via Tauri bundler, Authenticode signing, SmartScreen-friendly releases
- Auto-update channel separate from staff/update-bundle approval flow
- Versioned install paths; clean uninstall; no orphaned shell hooks

### 4. Desktop user experience

The app should feel like a **premium AI workbench** (Codex / Cursor / Claude Code quality bar), not a dashboard webpage.

| Area | Target |
|------|--------|
| Launch | Fast cold start; splash only if needed; no visible dev-server lag |
| Layout | No horizontal overflow, no tiny unreadable text, responsive sidebar collapse, consistent 8px grid |
| Typography | Minimum body 13–14px effective; monospace for code/reports; high contrast on near-black cockpit |
| Command palette | Beautiful, keyboard-first (`Cmd/Ctrl+K`), instant filter, preview-only commands, clear safety badges |
| Settings | Stable persistence (Tauri store / JSON on disk); section nav; doctor/status surfaces |
| Workspace | Native folder picker; recent workspaces; clear “no workspace” onboarding |
| Provider/model manager | Local-first configuration UI; no hidden network calls |
| Report import | Paste + file drop; untrusted banner; bounded preview; staff gates |
| Network state | Persistent, visible rail: offline / local-only / network-off badges — never ambiguous |
| Staff mode | Off by default; explicit toggle with warning; staff surfaces hidden when off |
| Shortcuts | Cross-platform map: `Cmd` on macOS, `Ctrl` on Windows; documented in palette help |
| Motion | Subtle, fast transitions; respect `prefers-reduced-motion` |
| Scroll & focus | Native scrollbars where appropriate; visible focus rings; no scroll jank |

Visual tokens from `styles.css` migrate to shared design system — the prototype’s polished
cockpit aesthetic is **preserved and refined**, not replaced with generic web UI.

### 5. Future app surfaces (post-prototype roadmap)

Ordered by product value; each surface uses fixtures first, then bridge when approval-gated:

| Surface | Phase | Notes |
|---------|-------|-------|
| Workspace onboarding | 0.6 | Pick folder, verify RealForge install, run doctor |
| Local model/provider setup | 0.6+ | Read-only config views first; writes approval-gated |
| RealForge doctor/status | 0.4 → 0.6 | Report import today; live doctor via bridge later |
| Report import | 0.3 ✅ | Paste, samples, trust hardening |
| Read-only CLI report loading | 0.4 ✅ | Manual terminal; Tauri invoke in 0.6 |
| Safe command composer | 0.7+ | Suggest/fix argv; never execute without approval UI |
| Approval-gated backend bridge | 0.7+ | Write paths, apply, scheduler — explicit user confirm |
| Update bundles/proposals | staff-gated | Preview in Updates screen; apply never automatic |
| Benchmark/leaderboard | 0.5c+ | Read-only fixture → live reports via allowlist |

### 6. Cross-platform validation expectations

| Expectation | Implementation |
|-------------|----------------|
| Document Win/mac differences | This plan + `src/bridge/README.md`; platform matrix in CI when Tauri lands |
| Tests avoid shell assumptions | Assert on `argv` arrays, not rendered shell strings; mock runners in bridge tests |
| Path handling | Shared `path-utils`; fixture paths use forward slashes in repo only |
| No shell interpolation | CI grep: `exec(`, `spawn(`, `` `.*${`, `shell: true` banned in bridge-adjacent code |
| No hardcoded Unix-only paths in shared code | `.venv/bin/python` isolated to `tools/` until `resolvePython` is cross-platform |
| Manual matrix | macOS + Windows smoke before each bridge/packaging release |
| Visual QA | Both platforms: 1280×800 minimum, 1920×1080 target, 125% Win scaling |

**Gate:** `npm run check && npm test && npm run build` on every PR; add Tauri `cargo test` and platform smoke in 0.6.

---

```text
workbench/
  index.html              # legacy static entry (kept until cutover)
  js/                     # legacy static UI (frozen after 0.4)
  styles.css              # legacy global styles (source for token extraction)
  src/
    data/                 # EXISTING — migrate .js → .ts in place or parallel
      contracts/
      adapters/
      viewModels/
      import/
      fixtures/
    ui/                   # NEW — shared presentational components
      README.md
      layout/             # Topbar, Sidebar, StatusRail, AppShell
      primitives/         # Badge, Button, Card, Icon, SectionHeading
    features/             # NEW — screen-level feature modules
      README.md
      home/
      workbench/
      capabilities/
      reports/            # Import panel, CLI catalog, preview
      settings/
      updates/            # Staff-gated update preview
      palette/            # Command palette
      studio/             # creative, image, vision, engine, assets
    state/                # NEW — typed app state + hooks
      README.md
      workbench-store.ts
      hooks/
    bridge/               # NEW — local integration boundary (no browser exec)
      README.md
      cli-report-sources.ts   # shared allowlist (from import/)
      types.ts
      path-utils.ts           # platform-safe path helpers (display + validation)
      local-bridge.ts         # IPC client interface; Tauri invoke in 0.6
      errors.ts               # structured BridgeResult / error codes
    platform/             # NEW (0.6) — keyboard shortcuts, OS detection for UI only
      shortcuts.ts
      os.ts
  app/                    # NEW (0.5a) — Vite React app root
    index.html
    vite.config.ts
    tsconfig.json
    src/
      main.tsx
      App.tsx
  src-tauri/              # NEW (0.6) — Tauri Rust shell, allowlisted spawn
    src/
      bridge/
        commands.rs
        spawn.rs
    tauri.conf.json
  tools/
    realforge-report-bridge.mjs
  tests/                  # EXISTING — add component tests alongside
  docs/
    react-migration-plan.md
```

The **legacy static app** stays runnable until React reaches screen parity, then
becomes `legacy/` or is removed in a single cutover release.

---

## Migration phases

### Phase 0 — Freeze static shell ✅ (0.4)

- CLI allowlist + Node bridge + Reports catalog UI
- No new screens in `components.js`
- 48 tests green

### Phase 1 — Scaffold ✅ (0.5a)

**Goal:** Vite + React + TS shell with layout parity; all 14 screens in React.

- Vite + React + TypeScript at `src/main.tsx`
- Zustand store; preserved safety defaults (`staffPreview: false`)
- All screens ported to `src/features/`
- Global `styles.css` preserved; legacy static shell in `legacy/`
- `npm run dev` → port 5173; `npm run dev:legacy` → port 4173
- **Deliverable:** 55 tests green; production `dist/` build

### Phase 2 — Data layer TypeScript ✅ (0.5b)

**Goal:** Typed data layer; all existing adapter/import tests pass unchanged.

- Migrated `status`, `adapters`, `import`, `cli`, `view-models`, `fixtures` to TypeScript modules
- Removed `globalThis` bootstrap from React app; direct ESM imports via `workbench-data.ts`
- Legacy shell uses esbuild `legacy/js/data-bundle.js` built from shared TS sources
- Node bridge imports `dist-node/cli-report-sources.mjs` from same allowlist
- Extracted design tokens to `src/styles/tokens.css`
- **Deliverable:** 58 tests green; `npm run build:data` in check pipeline

### Phase 3 — TypeScript strictness + bridge prep ✅ (0.5c)

**Goal:** Harden foundation before Tauri; no safety model changes.

- Removed `@ts-nocheck` from `cli-report-sources`, `report-import`, `view-models`
- Expanded `report-contracts.ts` import/CLI types (`ImportParseResult`, `ReportAdapterName`, etc.)
- Cross-platform `tools/resolve-python.mjs` (`.venv/bin/python`, `Scripts/python.exe`, PATH fallback)
- CSS tokens split: `tokens-colors`, `tokens-layout`, `tokens-status-badges`
- Removed deprecated `ensure-mock-data.ts` shim (use `workbench-data.ts`)
- **Deliverable:** 61 tests green; visual smoke at 1024/1440 unchanged

### Phase 4 — Tauri shell (0.6)

Replace `app.js` state:

```typescript
interface WorkbenchState {
  screen: WorkbenchScreen;
  settingsSection: string;
  staffPreview: boolean;
  commandQuery: string;
  sidebarOpen: boolean;
  importRaw: string;
  importType: string;
  importPreview: ImportPreview | null;
  operationStatus: string;
  lastCommand: string;
  stagedTask: string;
}
```

Hooks: `useNavigation`, `useCommandPalette`, `useReportImport`, `useStaffPreview`.

### Phase 5 — Visual parity & cutover (0.5e)

- Per-screen visual regression (manual or screenshot diff)
- Switch default `npm run dev` to Vite app
- Archive or remove legacy `js/` after sign-off

### Phase 6 — Tauri shell + local bridge (0.6)

**Goal:** Shippable macOS and Windows desktop app with read-only allowlisted bridge.

- Add `src-tauri/` with Tauri 2; embed Vite production build
- Implement Rust `spawn` mirroring Node bridge: fixed `argv`, timeout, max output, sanitized env
- Cross-platform `resolvePython` / bundled `realforge` sidecar strategy
- Native workspace folder picker; settings persistence to app data dir
- `LocalBridge` IPC: `listReportSources`, `loadReportSource(id)` — same allowlist as dev
- **Deliverable:** Signed dev builds on macOS and Windows; no dev server in production

### Phase 7 — Packaging, signing, polish (0.7+)

- Installers (`.dmg`/`.msi`), code signing, macOS notarization
- Keyboard shortcut parity audit (`Cmd` vs `Ctrl`)
- Safe command composer + approval-gated write bridge (separate security review)
- Auto-update channel (does not bypass staff/update approval)

Node `realforge-report-bridge.mjs` remains the **developer** path until Tauri bridge reaches parity.

---

## Component map (target)

| Legacy (`components.js`) | React target |
|--------------------------|--------------|
| `renderTopbar` | `ui/layout/Topbar.tsx` |
| `renderSidebar` | `ui/layout/Sidebar.tsx` |
| `renderStatusRail` | `ui/layout/StatusRail.tsx` |
| `renderCommandPalette*` | `features/palette/CommandPalette.tsx` |
| `renderReports` + `renderCliBridgePanel` | `features/reports/ReportsScreen.tsx` |
| `renderImportPreview` | `features/reports/ImportPreview.tsx` |
| `renderSettings` | `features/settings/SettingsScreen.tsx` |
| `renderUpdates` | `features/updates/UpdatesScreen.tsx` |
| Studio renders | `features/studio/*` |
| `badge`, `button`, `icon` | `ui/primitives/*` |

---

## Test strategy

| Layer | Approach |
|-------|----------|
| Data adapters/import | Keep existing Node tests; run against `.ts` modules |
| CLI bridge | Keep `cli-report-bridge.test.mjs`; import from `src/bridge/`; mock runner, assert `argv` not shell strings |
| UI structure | Port to Vitest + `@testing-library/react` for layout/safety labels |
| Trust invariants | Port report-import tests verbatim |
| Path utilities | Unit tests with mocked `win32`/`posix` paths; no `/usr/bin` assumptions in shared tests |
| Cross-platform | Bridge tests platform-agnostic; optional `CI_MATRIX=windows,macos` for Tauri integration |
| E2E (optional later) | Playwright or Tauri WebDriver in offline mode; screenshot both platforms for layout regressions |

**Gate:** No phase merges without `npm run check && npm test && npm run build`.

**Anti-patterns in tests:**

- Asserting exact copied shell command strings as execution contract (display labels OK)
- Hardcoding `.venv/bin/python` outside `tools/` tests
- Using `execSync("realforge ...")` instead of injecting a mock runner with `argv`

---

## Safety constraints (non-negotiable)

| Rule | Enforcement |
|------|-------------|
| No browser command execution | CI grep: no `child_process`, `loadSource` in `app/src` |
| No fetch/network in default UI | CI grep: no `fetch(`, `WebSocket`, `EventSource` |
| No arbitrary shell | Bridge uses fixed `argv` only; denylist for write subcommands |
| Imported JSON always untrusted | Import pipeline invariant; tests must not regress |
| Staff off by default | Store default `staffPreview: false`; staff screens gated |
| No auto-apply/commit/merge | No UI actions that call apply paths |
| Provider output untrusted | Adapter defaults; visible badges |
| CLI output untrusted | Same import path as paste |
| No localhost backend in 0.5 | No Express/dev API; Tauri IPC only in later milestone |
| Cross-platform paths | `path.join` / Rust `Path`; no shell string paths |
| Production ≠ dev server | Shipped app serves embedded assets; no Vite HMR dependency |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Visual regression during CSS split | Extract tokens first; screenshot compare per screen on macOS and Windows |
| Dual maintenance (legacy + React) | Time-box Phase 3; freeze legacy except fixes |
| Trust hardening lost in port | Port import tests before UI; no new import logic in components |
| Tauri tempts arbitrary IPC | `LocalBridge` interface + allowlist-only commands in code review |
| Scope creep (live execution) | Explicit non-goals in each phase README |
| `innerHTML` → XSS in React | Prefer JSX; sanitize only where HTML required |
| Windows path / venv bugs | Cross-platform `resolvePython` in Rust; CI on Windows before 0.6 release |
| “Web app in a frame” feel | Native menus, shortcuts, window state, no browser chrome, density audit |
| Signing/notarization delays | Document cert requirements early; unsigned dev builds for inner loop |
| Shell injection via bridge | Argument arrays only; denylist in Rust + TS; security review for Phase 7 writes |

---

## Success criteria for Workbench 0.5

- [ ] All 14 screens in React with visual parity
- [ ] Slash palette, report import, CLI catalog behavior preserved
- [ ] 48+ existing tests pass; new component tests for layout/reports/palette
- [ ] `npm run check`, `npm test`, `npm run build` green
- [ ] No network/exec primitives in React app source
- [ ] `src/bridge/` documents Tauri integration boundary and cross-platform path rules
- [ ] Legacy static app removable or archived
- [ ] Desktop UX checklist started: overflow, font size, keyboard shortcuts documented

## Success criteria for Workbench 0.6 (desktop)

- [ ] Tauri app runs on macOS and Windows from production build (no dev server)
- [ ] Read-only bridge via IPC matches Node dev bridge contract
- [ ] Workspace picker and settings persistence
- [ ] Platform smoke tests documented and passing
- [ ] No shell strings in spawn path; structured bridge errors in UI

---

## Recommended next milestone

**Workbench 0.5a — Vite + React scaffold + layout shell only.**

Design for desktop from day one: fixed min widths, keyboard hooks, token extraction from
cockpit CSS, and `src/bridge/` types — even before Tauri lands.

Do not port screens until the data layer TypeScript migration plan (0.5b) is
scheduled. Do not add product features to `js/components.js`.

See also: [`../README.md`](../README.md), [`../../docs/realforge-workbench-ui.md`](../../docs/realforge-workbench-ui.md).
