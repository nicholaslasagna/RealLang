# RealForge update bundles (1.5)

RealForge 1.5 adds **update bundle records** — versioned, reviewable metadata that packages a validated pending proposal as an update candidate. This is the backend for a future staff-only “Update available” workflow.

Update bundles are **metadata and reporting only**. They do **not** apply patches, auto-merge, auto-commit, or change source files.

## Commands

```bash
realforge update-bundle create --proposal <proposal_id>
realforge update-bundle list
realforge update-bundle show <bundle_id>
realforge update-bundle mark <bundle_id> --status approved|rejected|superseded
realforge update-bundle export <bundle_id> --output path.json
```

All commands require **`[staff].enabled = true`**.

## Create requirements

`update-bundle create` reads a **pending** merge proposal and:

1. Verifies proposal status is `pending`
2. Verifies proposal passed validation metadata
3. Verifies stored patch SHA-256 matches proposal metadata
4. Writes `UpdateBundle` JSON under `.realforge/updates/` (gitignored)

Nothing is applied or committed.

## UpdateBundle fields

| Field | Description |
|-------|-------------|
| `id` | Bundle identifier |
| `created_at` | UTC timestamp |
| `title` | From source proposal |
| `version_base` | Current RealForge package version at creation time |
| `candidate_version` | e.g. `1.5-candidate` (does not bump package version) |
| `area` | Improvement area from experiment metadata |
| `source_proposal_id` | Linked pending proposal |
| `source_cycle_id` | Optional linked cycle report |
| `source_eval_id` | Optional latest eval report |
| `patch_sha256` | Verified patch hash |
| `validation_mode` / `validation_summary` | From proposal |
| `eval_summary` | Optional summary from latest eval |
| `patch_targets` | Files changed |
| `risk_summary` | Risk notes from proposal |
| `status` | `candidate`, `approved`, `rejected`, `superseded`, or `applied` |
| `next_steps` | Manual `show-proposal` / `apply-proposal --confirm` |
| `safety_notes` | Non-applicability reminders |

## Status workflow

- **create** → `candidate`
- **mark** → `approved`, `rejected`, or `superseded` (metadata only)
- Applying changes still requires **`realforge apply-proposal <id> --confirm`**

Staff approval (bundle status) and proposal apply remain **separate steps**.

## Export

`update-bundle export` writes metadata JSON by default. Use `--include-patch` only when explicitly needed; default export excludes patch text.

## Safety

- Staff-only and config-gated
- Bundle writes obey workspace boundary
- Patch hash verified at bundle creation
- No infinite improvement loops
- RealForge does not claim frontier superiority

See also [Staff mode](realforge-staff-mode.md) and [RealForge](realforge.md).
