# Signed updater threat model (0.17)

RealForge Workbench 0.17 prepares for a **real signed application updater** without
shipping one. There is **no** update download, no install, no unsigned install path,
and no fake endpoint or key in the repository. This document is the threat model the
updater must satisfy before it is enabled.

## Update trust boundary

A desktop application updater is one of the highest-value attack surfaces in any app:
a malicious or tampered update runs with the user's privileges. The Workbench treats
the update channel as **untrusted by default**:

- The app trusts an update **only** after verifying a cryptographic signature over the
  artifact against a **pinned public key** baked into the build.
- Nothing is installed automatically. Install and restart require **explicit user
  confirmation** and a verified signature.
- Until the updater is truly wired, both **Check for Updates** and **Install and
  Restart** stay disabled, and the UI says so honestly.

## Signed artifact requirements

- Every update artifact (bundle + detached signature) must be produced by the release
  pipeline and signed with the project's **private** signing key.
- The Workbench verifies the signature with the **public** key before considering an
  update valid. An artifact that fails verification is rejected and never executed.
- Artifact integrity is checked **before** any unpacking or install step.

## Public key handling

- The **public** key (minisign / Tauri updater pubkey) is configured via
  `REALFORGE_UPDATER_PUBKEY` and may be embedded in the build. It is not a secret.
- The Workbench uses the public key only to **verify** signatures — never to sign.

## Private key — never in the repo

- The **private** signing key MUST NEVER be committed to the repository, stored in the
  app bundle, placed in `tauri.conf.json`, or printed in logs or diagnostics.
- It lives only in the release operator's secret store / CI secrets.
- "Copy diagnostics" in the About panel copies inert versions/statuses only — never
  keys, environment variables, secrets, paths, or command output.

## Release endpoint requirements

- The signed-release endpoint is configured via `REALFORGE_UPDATE_ENDPOINT` and must
  serve an **update manifest** over **HTTPS** only.
- The endpoint is untrusted transport: its contents are validated by signature, not by
  trusting the host. A compromised endpoint cannot deliver an installable update
  without a valid signature.

## Channel model: stable / preview / local-dev

- `stable` — signed public releases. Default for end users.
- `preview` — signed pre-release builds for testers. Same signature requirements.
- `local-dev` — developer builds. Updater is effectively off; no remote install.

The channel is read from `REALFORGE_UPDATE_CHANNEL`. Channels change *which* manifest
is consulted, never *whether* signatures are required.

## Downgrade / replay considerations

- The updater must reject an update whose version is **older than or equal to** the
  installed version (no silent downgrade).
- The manifest must carry a monotonic version and be signature-bound so a captured old
  manifest cannot be **replayed** to force a downgrade.
- Preview→stable and stable→preview transitions are explicit channel choices, not
  automatic.

## Update metadata integrity

- The version, notes, and artifact references in the manifest are only trusted after
  the manifest's signature verifies.
- The displayed "latest version" / release notes are treated as **untrusted** until
  signature verification succeeds, exactly like other imported/provider data.

## Install / restart user confirmation

- Install is a deliberate, user-initiated action behind an explicit confirmation.
- No background download-and-apply. No "auto-update on launch".
- The app states clearly when an install is unavailable and why.

## macOS signing / notarization (future)

- The `.app`/`.dmg` must be signed with an Apple **Developer ID** identity and
  **notarized** (and stapled) before stable distribution.
- Gatekeeper will otherwise block or warn. This is tracked as `deferred` in the
  release readiness checklist until configured.

## Windows Authenticode (future)

- The Windows installer/executable must be signed with an **Authenticode**
  certificate to avoid SmartScreen warnings.
- Tracked as `deferred` until a certificate and signing step are configured.

## Failure states

- **Signature invalid / missing** → reject, do not install, surface an inert error.
- **Endpoint unreachable** → report "could not check"; never fall back to an unsigned
  source.
- **Manifest malformed** → treat as untrusted; do not install.
- **Downgrade detected** → refuse.
- **Pubkey/endpoint not configured** → updater shows `missing`; Check stays disabled.

## Offline behavior

- With no network, the updater reports it cannot check and changes nothing.
- The app remains fully usable offline; updates are never required to run.

## How this differs from RealForge self-improvement / update bundles

The **application updater** (this document) replaces the running desktop binary and is
gated by code signing. It is unrelated to RealForge's **self-improvement / update
bundle** workflow, which proposes *repository* changes (patches/bundles) that are
**read-only previews requiring human approval** and never auto-applied. The two share
nothing: app updates change the installed binary (signed), while update bundles are
untrusted, approval-gated *content* proposals with no write/apply path in the
Workbench.

## Why unsigned installs remain disabled

Allowing an unsigned install — even "just for dev" — would create a path where a
tampered artifact could run with the user's privileges. The Workbench therefore keeps
Install disabled until a verified, signed update exists. There is no opt-out, no
"trust this once", and no developer flag that bypasses signature verification.
