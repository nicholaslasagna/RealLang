# RealForge update bundles (1.5+)

RealForge 1.5 adds **update bundle records** — versioned, reviewable metadata that packages a validated pending proposal as an update candidate. RealForge 1.6 hardens bundle integrity, status transitions, export safety, and staff-flow visibility.

Update bundles are **metadata and reporting only**. They do **not** apply patches, auto-merge, auto-commit, or change source files.

**Important:** Update bundles are **not a security boundary by themselves**. The trusted apply path remains **proposal hash verification** plus **`apply-proposal` validation**. `update-bundle verify` helps detect tampering before review.

## Commands

```bash
realforge update-bundle create --proposal <proposal_id>
realforge update-bundle verify <bundle_id>
realforge update-bundle list
realforge update-bundle show <bundle_id>
realforge update-bundle mark <bundle_id> --status approved|rejected|superseded
realforge update-bundle export <bundle_id> --output path.json
realforge update-bundle export <bundle_id> --output path.json --include-patch
```

All commands require **`[staff].enabled = true`**.

## Create requirements

`update-bundle create` reads a **pending** merge proposal and:

1. Verifies proposal status is `pending`
2. Verifies proposal passed validation metadata
3. Verifies stored patch SHA-256 matches proposal metadata
4. Assigns a unique `candidate_version` (includes date + bundle id suffix)
5. Writes `UpdateBundle` JSON under `.realforge/updates/` (gitignored)

Nothing is applied or committed.

## Verify (1.6)

`update-bundle verify` re-checks bundle integrity against the source proposal:

- Source proposal exists
- Proposal status is still `pending` unless bundle is `rejected` or `superseded`
- Stored patch exists
- Patch SHA-256 matches `bundle.patch_sha256` and `proposal.copied_patch_sha256`
- `patch_targets` and `validation_mode` match proposal metadata

Prints **PASS/FAIL** with per-check reasons. Read-only; does not modify files.

## Status transitions (1.6)

| From | Allowed |
|------|---------|
| `candidate` | `approved`, `rejected`, `superseded` |
| `approved` | `superseded` |
| `rejected` | (terminal for mark) |
| `superseded` | terminal |
| `applied` | terminal |

- `approved → rejected` is **rejected** in 1.6 (even with `--force`)
- `rejected → approved` is **rejected** in 1.6
- `mark` updates metadata only; it does not apply source files

## Candidate version uniqueness (1.6)

- Format: `{major}.{minor}-candidate.{YYYYMMDD}-{bundle_id_prefix}`
- Example: `1.6-candidate.20260620-a1b2c3d4`
- Does **not** bump the RealForge package version
- Bundle id / candidate version collisions fail clearly instead of overwriting

## Export (1.6)

- Default export is **metadata-only** (no raw patch content)
- Always includes top-level `patch_sha256`
- Omits absolute local filesystem paths from exported metadata
- `--include-patch` adds an explicit `untrusted_patch` object labeled **UNTRUSTED**

## UpdateBundle fields

| Field | Description |
|-------|-------------|
| `id` | Bundle identifier |
| `created_at` | UTC timestamp |
| `title` | From source proposal |
| `version_base` | Current RealForge package version at creation time |
| `candidate_version` | Unique review candidate label |
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

## Workflow

```text
pending proposal → update-bundle create → verify → staff review/mark
  → apply-proposal --confirm (separate trusted apply path)
```

Staff bundle approval and proposal apply remain **separate steps**.

## Safety

- Staff-only and config-gated
- Bundle writes obey workspace boundary
- Patch hash verified at create and verify time
- RealForge does not claim frontier superiority

See also [Staff mode](realforge-staff-mode.md) and [RealForge](realforge.md).
