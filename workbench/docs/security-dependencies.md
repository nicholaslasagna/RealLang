# Workbench dependency security notes

This note tracks dependency security advisories affecting the RealForge Workbench,
what was resolved, and what remains blocked upstream. It is kept honest: a blocked
advisory is documented as blocked, never marked fixed.

Last reviewed: Workbench 0.14 (read-only security scan bridge).

These advisories are surfaced in the Workbench **Security Center** screen with
severity, exposure, affected files, and preview-only fix plans. The Security
Center never edits dependency files or applies fixes. **0.14** adds a read-only
scan bridge (`npm audit --json`, `cargo tree`, `cargo tree -i glib`) whose output
is untrusted evidence; `npm audit` may require the npm registry (network) and is
labeled accordingly. `cargo tree` is dependency evidence, not vulnerability truth,
and the glib advisory remains **blocked** — scanning does not resolve it. See
[security-center.md](security-center.md) and the
[scan bridge threat model](security-scan-bridge-threat-model.md).

## Summary

| Advisory | Ecosystem | Status | Resolution |
|----------|-----------|--------|------------|
| esbuild `<0.28.1` dev-server file read | npm | **Resolved** | Bumped direct devDependency to `^0.28.1` (installed 0.28.1); `npm audit` → 0 vulnerabilities. |
| glib `<0.20.0` soundness advisory | Rust (Cargo) | **Blocked upstream** | Cannot update while Tauri 2.11's GTK3 (gtk-rs 0.18) Linux webview stack pins `glib ^0.18`. Linux-only exposure; tracked for a future Tauri bump. |

## 1. esbuild (npm) — Resolved

- **Advisory:** esbuild allows arbitrary file read when running its development
  server on Windows. Affected `>=0.27.3, <0.28.1`; patched in `0.28.1`.
- **Why it was present:** `esbuild` is a direct `devDependency` used only by
  `scripts/build-data-artifacts.mjs` to compile the shared CLI allowlist / data
  bundle (`dist-node/`, `legacy/js/data-bundle.js`) at build time. Vite 8 is
  rolldown-based and does **not** depend on esbuild, so there was no transitive
  pull to reconcile.
- **Actual exposure before fix:** minimal — the project never runs `esbuild serve`
  (Vite is the dev server), and the build runs locally on the developer's machine.
- **Fix:** `devDependencies.esbuild` moved from `^0.27.3` to `^0.28.1`; lockfile
  regenerated with `npm install`. The lockfile change is esbuild + its
  platform-specific subpackages only. `build:data`, `npm run check`, `npm test`,
  and `npm run build` all pass. `npm audit` reports **0 vulnerabilities**.

## 2. glib (Rust) — Blocked upstream

- **Advisory:** glib `>=0.15.0, <0.20.0` carries a Rust memory-safety / soundness
  advisory (unsound iterator implementation in the glib bindings); patched in
  `glib 0.20.0`. Dependabot cannot auto-update it because another dependency
  constrains the version.
- **Installed version:** `glib 0.18.5`.
- **Constraining dependency path** (`cargo tree -i glib`, Linux target):

  ```text
  glib 0.18.5
    └── gtk 0.18.2            (gtk-rs GTK3 bindings; requires glib ^0.18)
          ├── atk / gdk / gio / pango / cairo-rs   (all gtk-rs 0.18)
          ├── webkit2gtk 2.0.2
          ├── tao 0.35.3
          └── wry 0.55.1
                └── tauri-runtime-wry 2.11.3
                      └── tauri 2.11.3
                            └── realforge-workbench 0.12.0
  ```

- **Why auto-update is blocked:** `gtk 0.18.2` requires `glib ^0.18`, so glib is
  pinned to the `0.18.x` line. Confirmed:

  ```text
  $ cargo update -p glib --precise 0.20.0
  error: failed to select a version for the requirement `glib = "^0.18"`
  candidate versions found which didn't match: 0.20.0
  required by package `gtk v0.18.2`
    ... which satisfies dependency `gtk = "^0.18"` of package `tauri v2.11.3`
  ```

  Moving to `glib 0.20` requires the entire gtk-rs GTK3 stack (gtk/gdk/gio/atk/
  pango/cairo-rs) plus `webkit2gtk`, `tao`, and `wry` to adopt the gtk-rs 0.20
  generation. As of Tauri **2.11.3** (latest at review time), the Linux webview
  stack is still on gtk-rs 0.18. `cargo update -p wry -p tao` reports "Locking 0
  packages" — already at the newest versions compatible with Tauri 2.11.3. There
  is no in-repo pin that resolves this without forking upstream crates, which is
  not safe to do here.

- **Current exposure in the Workbench:**
  - glib/GTK is a **Linux-only** dependency. The Workbench desktop shell uses the
    platform-native webview on macOS (WKWebView) and Windows (WebView2); the
    glib/GTK/webkit2gtk crates are `cfg(target_os = "linux")`-gated and are **not
    compiled or linked** in macOS or Windows builds.
  - The advisory is a **soundness/undefined-behavior** issue in a specific glib
    iterator binding, not a known remote-code-execution vector. The Workbench does
    not call the affected glib API directly; usage is internal to the GTK/webkit
    stack on Linux.
  - The Workbench is a local-first developer tool with no untrusted network input
    feeding the desktop shell, which further narrows practical risk.

- **Mitigation plan:**
  1. Track Tauri upstream for the Linux webview stack moving to gtk-rs 0.20
     (and/or a GTK4/webkitgtk-6 path). Re-run `cargo update` and
     `cargo update -p glib --precise 0.20.0` on each Tauri minor bump.
  2. Do **not** hand-pin `glib` or remove Tauri functionality to force the bump —
     that would break the build or the desktop webview without fixing the issue.
  3. Until upstream moves, treat the alert as **acknowledged and tracked**, with
     exposure limited to Linux desktop builds.

This advisory is **not** resolved and is **not** suppressed; it remains visible in
Dependabot until the upstream Tauri/gtk-rs constraint is lifted.
