# RealForge patch proposals (1.9)

RealForge 1.9 adds **untrusted provider-generated patch proposals** through `realforge propose-patch`. This is the first bridge toward model-generated code changes without applying anything to the main workspace.

Patch proposals are **dry-run by default**. Saving a proposal is **not approval**. Human approval remains required for any apply path through existing merge proposals.

This is a step toward staff-approved self-improvement — **not autonomous self-editing**. RealForge does not claim superiority over Codex, Claude Code, Cursor, Mythos, or other frontier tools.

## Commands

```bash
realforge propose-patch --task "add a comment to README" --provider mock --dry-run
realforge propose-patch --task "improve RealForge docs" --provider mock --dry-run --save
realforge propose-patch --task "add improve test comment" --provider mock --dry-run --experiment
```

- `--dry-run` is **required** in 1.9
- `--save` writes under `.realforge/patch_proposals/<id>/` (gitignored)
- `--experiment` saves the proposal and evaluates the patch in an **isolated experiment workspace**
- `--experiment` does **not** create a merge proposal automatically

## PatchProposal fields

Saved proposals include:

| Field | Purpose |
|-------|---------|
| `id`, `created_at`, `provider`, `task` | Identity and provenance |
| `title`, `summary`, `rationale` | Human-readable proposal metadata |
| `files_to_modify` | Intended targets (untrusted until validated) |
| `validation_commands` | **Suggestions only** — not executed automatically |
| `risks` | Provider-stated risks |
| `unified_diff` | Untrusted unified diff text |
| `patch_sha256`, `patch_targets` | RealForge-computed integrity metadata |
| `requires_human_approval` | Must remain true |
| `untrusted` | Always true for provider output |

Storage layout:

```text
.realforge/patch_proposals/<id>/proposal.json
.realforge/patch_proposals/<id>/patch.diff
```

## Safety

RealForge validates provider patches before display, save, or experiment:

- Unified diff must be syntactically recognizable
- Empty diffs rejected
- Binary patches rejected (v1.9)
- Patch targets validated through `patch_safety.py`
- Rejects absolute paths, `..`, `.git/`, `.realforge/`, and out-of-workspace targets
- **Main workspace is not modified** by propose-patch
- Provider-suggested validation commands are **never executed** unless you separately run an isolated experiment

## Workflow

```text
propose-patch --dry-run [--save]
  → optional experiment --patch-file (via --experiment)
  → manual review
  → propose-merge / apply-proposal --confirm (existing approval-gated path)
```

Experiments run only in isolated workspaces. A passing experiment does not apply changes to the main repo.

## Relationship to improve and experiment

| Command | Role |
|---------|------|
| `improve --propose-patch --dry-run` | Area-focused improvement plan + optional diff (0.6) |
| `propose-patch --dry-run` | Task-focused RealLang/RealForge patch proposal (1.9) |
| `experiment --patch-file` | Evaluate a saved patch in isolation (0.7+) |

Use **propose-patch** when asking a local provider for a task-specific unified diff with structured metadata. Use **experiment** when you already have a saved patch file to validate.

See also [Self-improvement](realforge-self-improvement.md), [RealForge architecture](realforge-architecture.md), and [RealForge](realforge.md).
