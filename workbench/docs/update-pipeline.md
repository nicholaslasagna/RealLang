# RealForge Workbench — signed update pipeline (0.10)

This document describes how Workbench prepares for **signed, verified updates**
without enabling fake auto-update behavior in development builds.

## Current state (0.10)

| Capability | Status |
|------------|--------|
| Update Center UI (Settings → Updates) | Yes |
| Typed `UpdateConfiguration` model | Yes |
| Environment-based readiness detection | Yes |
| Release readiness checklist (informational) | Yes |
| Network update check | **No** — not wired |
| Download / install | **No** — `installAllowed` stays false |
| `tauri-plugin-updater` | **Deferred** — add when signing infra is live |

Default build behavior:

- `configured: false`
- `signingRequired: true`
- `installAllowed: false`
- `state: not_configured`

No fake endpoints, public keys, or success states.

## Configuration model

IPC `get_update_status` returns:

| Field | Meaning |
|-------|---------|
| `configuration.configured` | Both endpoint and public key are present |
| `configuration.channel` | `stable`, `preview`, or `local_dev` |
| `configuration.endpointConfigured` | `REALFORGE_UPDATE_ENDPOINT` is set |
| `configuration.publicKeyConfigured` | `REALFORGE_UPDATER_PUBKEY` is set |
| `configuration.signingRequired` | Always `true` |
| `configuration.installAllowed` | Always `false` until verified signed update exists |
| `configuration.disabledReason` | Human-readable reason when not ready |

### Environment variables (optional, no secrets in repo)

| Variable | Purpose |
|----------|---------|
| `REALFORGE_UPDATE_ENDPOINT` | HTTPS URL to signed update metadata JSON |
| `REALFORGE_UPDATER_PUBKEY` | Minisign public key for signature verification |
| `REALFORGE_UPDATE_CHANNEL` | `stable` (default), `preview`, or `local_dev` |

Detection rules:

| Endpoint | Public key | State |
|----------|------------|-------|
| absent | absent | `not_configured` |
| present | absent | `missing_public_key` |
| absent | present | `missing_endpoint` |
| present | present | `ready_to_check` |

When `ready_to_check`, **Check for Updates** is enabled but returns an honest
message that network check/install are not wired yet — no fake “up to date”.

## Release readiness checklist (0.17)

The Update Center renders a **typed, honest** release readiness checklist
(`src/data/release/release-readiness.ts`, rendered by `ReleaseReadinessPanel`).
Each of the 15 items has `id`, `label`, `status` (`pass`/`warn`/`missing`/
`deferred`), `platform` (`all`/`macOS`/`Windows`), `requiredFor` (`dev`/`preview`/
`stable`), `details`, and `nextAction`:

| Item | Default status |
|------|----------------|
| Workbench version aligned | `pass` (derived) |
| Tauri build passes | `warn` (verify in CI) |
| npm audit clean | `warn` (verify in CI) |
| Security Center reviewed | `pass` |
| glib upstream-blocked advisory documented | `pass` |
| App icons generated | `pass` |
| macOS signing configured | `deferred` |
| macOS notarization configured | `deferred` |
| Windows signing configured | `deferred` |
| Updater public key configured | `missing` (unless env set) |
| Updater endpoint configured | `missing` (unless env set) |
| Release notes prepared | `warn` |
| Update manifest generated | `missing` |
| Signed update artifact generated | `missing` |
| Install-and-restart verified | `missing` |

Signing, notarization, updater, manifest, artifact, and install items are **never**
`pass` until actually configured/produced. The panel also lists the display-only
**validation commands** (`npm run check`/`test`/`build`/`smoke:visual`/`check:tauri`/
`tauri:build`/`npm audit`) — the UI never runs them. See the
[signed updater threat model](./signed-updater-threat-model.md).

The bundle version stays **0.16.0** through 0.17 (a readiness milestone, not a
shipped release); it is bumped only when an actual signed release is cut.

## Icon & signing readiness (TODO before stable)

The desktop bundle ships generated RealForge brand icons derived from
`assets/realforge-mark.svg`. Before a stable release:

- [x] Generate branded PNG, **`icon.icns`**, and **`icon.ico`** assets.
- [ ] Review macOS and Windows icon rendering on real signed builds.
- [ ] Review **DMG appearance** (background, layout, volume name).
- [ ] Confirm **app name** consistency ("RealForge Workbench") across
      `tauri.conf.json`, bundle, and UI.
- [ ] Set a stable **bundle identifier** (reverse-DNS) and keep it fixed.
- [ ] Configure a macOS **Developer ID signing identity** + **notarization**.
- [ ] Configure a Windows **Authenticode** certificate and installer signing.

These are tracked as `deferred`/`warn` in the readiness checklist above. No final
branding is generated in 0.17.

## Safety rules

- **No unsigned updates** — never download or install unsigned packages.
- **No fake auto-update** — disabled button or structured `not_configured` only.
- **No network** from the web UI — update checks are desktop IPC only.
- **Install and Restart** disabled until `installAllowed` is true after verified signed update.

## Future: enable signed updates (1.0+)

When release infrastructure is ready:

1. **Generate signing keys** (keep private key out of repo):
   ```bash
   npm run tauri signer generate -- -w ~/.tauri/realforge-workbench.key
   ```

2. **Add `tauri-plugin-updater`** to `src-tauri/Cargo.toml` and configure `tauri.conf.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "endpoints": ["https://releases.example.com/workbench/{{target}}/{{arch}}/{{current_version}}"],
         "pubkey": "<minisign-public-key>"
       }
     }
   }
   ```

3. **CI release job**:
   - Bump version in `package.json`, `Cargo.toml`, `tauri.conf.json`
   - `npm run tauri:build`
   - Sign update artifacts (`tauri signer sign`)
   - Publish `latest.json` (or channel-specific manifest) to HTTPS endpoint
   - Verify signature before advertising update

4. **Wire Rust bridge** (`src-tauri/src/bridge/update.rs`):
   - Call `tauri-plugin-updater` only when env/config is complete
   - Set `installAllowed: true` only after signature verification succeeds
   - Map plugin states to `UpdateStatus` (`checking`, `update_available`, etc.)

5. **Platform polish (future)**:
   - macOS: Developer ID signing + notarization + stapling
   - Windows: Authenticode signing for installer and updater
   - Channel-specific manifests for `preview` / `stable`

Until then, developers can set `REALFORGE_UPDATE_*` env vars locally to verify
readiness UI without enabling downloads.

## Workspace invalidation (0.10)

If a persisted workspace path no longer exists:

- Resolution status: `saved_path_missing`
- Home and Settings show **Saved workspace moved or deleted**
- Actions: **Choose new workspace**, **Clear saved workspace**
- Health probe is skipped (no aggressive CLI retries)

Clearing saved workspace falls back to `REALFORGE_REPO_ROOT` or walk-up discovery.

## Related docs

- [desktop-shell.md](./desktop-shell.md) — IPC commands and project layout
- [../src/bridge/README.md](../src/bridge/README.md) — frontend bridge API
