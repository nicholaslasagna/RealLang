# RealForge

RealForge is a **local-first coding agent platform built for RealLang**: compiler-guided,
benchmark-aware, repair-loop native, and designed to run with local LLMs instead of
cloud APIs.

It sits beside the RealLang compiler and uses **`realc` diagnostics as the primary
feedback loop** for conservative repairs. Benchmark and test feedback loops are part
of the architecture and are integrated incrementally.

RealForge does **not** require OpenAI, Anthropic, Gemini, Claude, Codex, Cursor, or
any cloud provider. Local models are configured through `.realforge.toml` (Ollama or
OpenAI-compatible local servers). The default `mock` provider is deterministic and
requires no external services.

## What RealForge 1.3 adds

RealForge 1.3 adds a **local provider quality evaluation harness**:

- **`realforge eval`** — run deterministic, read-only eval suites against a selected provider (default: `mock`)
- **Suites:** `smoke`, `planning`, `safety`, `generation`, and `all`
- **Rule-based scoring** — transparent checks for plan schema, relevant files, validation mentions, unsafe command suggestions, and `realc --check` on generated RealLang in temp workspaces
- **`eval-list` / `eval-show`** — inspect saved reports under `.realforge/evals/` (written only with `--write`)
- Eval tasks **do not edit** the main workspace and **do not execute** provider-suggested shell commands

This is an **early quality harness** for comparing local model behavior safely. It is **not** a scientific benchmark and does **not** prove superiority over Codex, Claude Code, Cursor, Mythos, or other frontier tools. Provider output remains **untrusted**.

See [RealForge evals](realforge-evals.md).

## What RealForge 1.2 adds

RealForge 1.2 hardens **command execution and permission boundaries**:

- **`manual` permission mode** replaces misleading `ask` (alias retained); manual mode does not prompt interactively—it blocks shell execution like readonly
- **Validation command allowlist** — RealForge executes only allowlisted validation commands by default (pytest, `git diff --check`, `realc --check`, benchmark smoke runner in benchmarks mode); arbitrary shell is blocked even in `workspace-write`
- **Provider commands are suggestions only** — plan/improvement `commands_to_run` / `validation_commands` are never executed automatically
- **Untrusted input labeling** — provider plans, patches, and research summaries include explicit untrusted-content boundaries in CLI/prompt context
- **Validation environment** — validation subprocesses strip sensitive env vars (`*_TOKEN`, `*_SECRET`, `*_KEY`, `AWS_*`, etc.); validation still executes project code and is **not** a security sandbox
- **Future work:** network sandboxing for validation (TODO; not implemented in 1.2)

RealForge still requires human `--confirm` before applying proposals. RealForge still does not auto-merge.

## What RealForge 1.1 adds

RealForge 1.1 **hardens proposal integrity** before adding more autonomy:

- **Patch hash chain** — `patch_sha256` in experiment reports binds to `copied_patch_sha256` in proposals; apply verifies the stored patch has not changed
- **Validation mode parity** — apply reruns the same `quick|examples|benchmarks` mode that passed in the experiment (legacy reports without `validation_mode` are rejected)
- **Path-safe patches** — rejects absolute paths, `..` traversal, `.git/`, and `.realforge/` targets before copy/apply
- **Patch target detection** — uses `git apply --numstat` / `--check` when git is available; improved unified-diff parsing otherwise; targets stored in reports and proposals
- **Commit scope** — `git add -- <patch_targets>` instead of `git add -A`
- **Dirty workspace** — git repos block on uncommitted source changes (`.realforge/` metadata ignored); non-git repos compare workspace content digests from experiment time
- **Rollback hardening** — backups/rollback use full `patch_targets` (modified, new, deleted text files); incomplete rollback is reported loudly
- **Clearer UX** — cycles report `proposal_created`; dry-run output says **plan generated**, not validated; `show-proposal` displays hash, mode, and targets

Important distinctions (unchanged, now documented more clearly):

- **Experiment pass ≠ merge**
- **Proposal created ≠ applied**
- **Apply passed ≠ committed** unless `--commit`
- **Model output remains untrusted**
- **Proposal JSON and stored patch files are security-sensitive**

RealForge still does **not** auto-merge.

## What RealForge 1.0 adds

RealForge 1.0 adds a **controlled recursive improvement cycle** that composes existing
safety gates without removing them:

- `realforge cycle --area tests --budget 1 --dry-run` — plan + validation preview only
- `realforge cycle --area tests --budget 1 --patch-file change.diff` — experiment + pending proposal
- `realforge cycle --research-id <id> ...` — attach saved research snapshots (no new fetch)
- `realforge cycle-list` / `realforge cycle-show <id>` — review cycle reports
- Bounded budget (1–3 attempts); no auto-merge, no auto-apply, no commits

See [Cycle (1.0)](realforge-cycle.md).

## What RealForge 0.9 adds

RealForge remains **experimental** and does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.9 adds **permissioned internet research**:

- `realforge research --url https://... --allow-domain example.com` — explicit HTTPS fetch with domain allowlist
- `realforge research-list` / `realforge research-show <id>` — review saved snapshots
- `realforge plan --task "..." --include-research <id>` — attach citation + summary to planning context
- Snapshots stored under `.realforge/research/` with metadata and content hash
- Network access is off by default; research cannot edit files or auto-merge changes

See [Research (0.9)](realforge-research.md).

## What RealForge 0.8 adds

RealForge remains **experimental** and does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.8 adds **approval-gated merge proposals**:

- `realforge propose-merge --report experiment_report.json` — create a pending proposal from a passed experiment
- `realforge list-proposals` / `realforge show-proposal <id>` — review proposals (read-only)
- `realforge apply-proposal <id> --confirm` — apply patch to main workspace after explicit approval
- Post-apply validation runs in the main workspace; failed validation rolls back automatically
- `--commit` commits only after validation passes (default: changes left uncommitted)
- No auto-merge; model output remains untrusted

Proposal metadata is stored under `.realforge/proposals/` (gitignored by default).

## What RealForge 0.7 adds

RealForge remains **experimental** and does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.7 adds **isolated experiment workspaces**:

- `realforge experiment --area tests --dry-run` — print plan and validation steps without creating a workspace
- `realforge experiment --area tests --patch-file change.diff` — apply patch only in an isolated git worktree or copied workspace
- Validation runs inside the experiment workspace through `runner.py` (pytest, optional examples/benchmark checks)
- `ExperimentReport` records pass/fail, command results, cleanup status, and `main_workspace_modified`
- No auto-merge; human approval is still required

See [Self-improvement](realforge-self-improvement.md) for the full safety model.

## What RealForge 0.6 adds

RealForge remains **experimental** and does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.6 adds a **dry-run self-improvement proposal loop**:

- `realforge improve --dry-run` — structured self-improvement plan from workspace context
- `realforge improve --area safety|tests|docs|compiler|realforge --dry-run` — area-focused proposals
- `realforge improve --area ... --propose-patch --dry-run` — print untrusted unified diff only
- `SelfImprovementPlan` includes validation commands, rollback plan, and human-approval flags
- Invalid provider JSON raises `ProviderPlanError` and stops safely
- No file writes, no automatic patch apply, no automatic commits

See [Self-improvement (0.6)](realforge-self-improvement.md) for safety boundaries and future milestones.

## What RealForge 0.5 adds

RealForge remains **experimental** and does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.5 adds **context-aware planning**:

- `realforge plan --task "..." --include-context` — bounded workspace context + structured plan
- `realforge ask --task "..." --include-context` — lighter user-facing planning output
- Provider prompt contract with safety constraints, available commands, and JSON plan shape
- Structured plans include `files_to_inspect`, `files_to_modify`, `commands_to_run`, `risks`, and `requires_write_permission`
- Model output is **untrusted**; planning does not edit files or run commands
- `--max-context-chars`, `--permission`, and `--provider mock` (CI-safe default)

## What RealForge 0.4 adds

RealForge remains **experimental** and does not add autonomous editing in 0.4.
Version 0.4 adds deterministic **workspace awareness** and **context construction**:

- `realforge index` — scan workspace for `.real` files, docs, tests, and benchmarks
- `realforge symbols` — conservative text-based symbol tables (modules, functions, bindings)
- `realforge context --task "..."` — bounded, deterministic context bundles for local providers
- Optional index cache at `.realforge/index.json` with explicit `--write` only

Symbol scanning is text-based, not a full parser import. Treat extracted symbols as hints,
not compiler facts.

## What RealForge 0.3 adds

RealForge remains **experimental**. It does not claim to outperform Codex, Claude Code,
or Cursor yet. Version 0.3 hardens workspace safety before expanding agent power:

- **Workspace boundary enforcement** — all writes must stay inside the configured workspace root, including explicit `--apply`
- **Backup rotation** — numbered backups (`file.real.bak`, `file.real.bak.1`, …) preserve prior backups
- **Post-apply rollback** — failed recheck after `repair --apply` restores the backup by default; use `--keep-failed-repair` to retain the modified file
- **Live diagnostic roundtrip tests** against real `realc --check` stderr
- **Runner permission tests** for destructive-command blocking and readonly vs workspace-write behavior

## What RealForge 0.2 adds

- `.realforge.toml` model configuration
- Local generation through **Ollama** or **OpenAI-compatible local** HTTP endpoints
- `realforge ask`, `realforge plan`, and `realforge generate --dry-run`
- Explicit `--apply` for generated file writes (permission-gated)

## What RealForge 0.1 does

```text
task or source file
  → model provider (plan-only) OR repair loop
  → realc --check (subprocess via runner.py)
  → parse structured REAL_*_ERROR[Exxx] diagnostics
  → apply safe rule-based repairs (optional, permission-gated)
  → rerun realc --check
  → report pass/fail, diff, backup path
```

### CLI

```bash
# Typecheck via realc and summarize diagnostics
realforge check examples/hello.real

# Show proposed repairs without writing
realforge repair path/to/bad.real --dry-run

# Apply proven-safe repairs with backup (rollback on failed recheck by default)
realforge repair path/to/bad.real --apply
realforge repair path/to/bad.real --apply --keep-failed-repair

# Context-aware planning (read-only; does not edit files)
realforge plan --task "explain hello.real" --include-context --provider mock
realforge ask --task "summarize project" --include-context --provider mock
realforge plan --task "..." --include-context --max-context-chars 8000 --permission readonly

# Self-improvement proposals (dry-run only in 0.6)
realforge improve --dry-run
realforge improve --area tests --dry-run
realforge improve --area realforge --propose-patch --dry-run

# Isolated experiments (0.7)
realforge experiment --area tests --dry-run
realforge experiment --area tests --patch-file /path/to/change.diff --validation quick
realforge experiment --area tests --patch-file change.diff --keep --output report.json

# Approval-gated merge proposals (0.8)
realforge propose-merge --report /path/to/experiment_report.json
realforge list-proposals
realforge show-proposal <proposal_id>
realforge apply-proposal <proposal_id> --confirm
realforge apply-proposal <proposal_id> --confirm --commit

# Permissioned research (0.9)
realforge research --url https://example.com/page --allow-domain example.com
realforge research-list
realforge research-show <research_id>
realforge plan --task "..." --include-research <research_id> --provider mock

# Controlled improvement cycles (1.0)
realforge cycle --area tests --budget 1 --dry-run
realforge cycle --area tests --budget 1 --patch-file change.diff
realforge cycle-list
realforge cycle-show <cycle_id>

# Generate RealLang source without writing files
realforge generate --task "hello world program" --dry-run

# Workspace awareness (read-only by default)
realforge index
realforge symbols
realforge context --task "explain hello.real" --max-chars 4000
realforge index --write

# Environment health check
realforge doctor
```

Example `.realforge.toml`:

```toml
[model]
provider = "ollama"
model = "qwen2.5-coder:32b"
base_url = "http://localhost:11434"
```

### Supported automatic repairs (v0.1)

| Code | Behavior |
|------|----------|
| **E203** | If `let x` is later mutated with `set x`, safe repair may change that binding to `var x`. |
| **E217** | Manual repair required (`main` must take no parameters). |
| **E218** | Manual repair required (duplicate parameters). |
| **E220** | Manual repair required (missing guaranteed return path). |
| **E221** | Manual repair required (`i32` literal out of range). |
| Other codes | Reported as manual repair required. |

## Safety rules

RealForge is still experimental. Autonomous editing remains permission-gated; local
model support does not bypass safety checks.

- Default permission mode is **`readonly`** (no implicit file writes or shell commands).
- **`--dry-run` never modifies files.**
- **`--apply` refuses paths outside the workspace root**, even when explicitly requested.
- **`--apply` creates rotated backups** (`file.real.bak`, `file.real.bak.1`, …) before writing.
- **Failed recheck after repair rolls back by default**; pass `--keep-failed-repair` to keep the modified file.
- Only explicitly safe repairs are applied automatically.
- Destructive shell commands are blocked in `runner.py`.
- If a repair cannot be proven safe, RealForge reports **manual repair required**.
- RealForge does **not** claim to outperform Codex, Claude Code, or Cursor yet.

## Package layout

```
src/realforge/
  cli.py                 realforge command
  config.py              paths, provider URLs, permission defaults
  agent_loop.py          plan-only and repair-loop orchestration
  planner.py             structured agent plans
  runner.py              subprocess wrapper (all shell execution)
  diagnostics_parser.py  parse structured compiler output
  repair_rules.py        conservative repair planning
  patcher.py             backup + apply guards
  diffing.py             unified diff for dry-run
  permissions.py         readonly / manual / workspace-write gates
  command_policy.py      validation command allowlist and shell policy
  memory.py              in-process session notes
  report.py              human-readable summaries
  doctor.py              environment checks
  providers/             local model adapters (mock implemented)
  index/                 workspace scan, symbols, context builder
  self_improve.py        dry-run self-improvement orchestration (0.6)
  self_improvement_plan.py structured improvement plans and parsing
  experiment.py          isolated patch experiments and validation (0.7)
  experiment_report.py   ExperimentReport JSON and formatting
  git_utils.py           git worktree / copy workspace helpers
  proposals.py           approval-gated merge proposal workflow (0.8)
  proposal_report.py     MergeProposal JSON and formatting
  research/              permissioned HTTPS research snapshots (0.9)
  cycle.py               bounded recursive improvement orchestration (1.0)
  cycle_report.py        CycleReport JSON and formatting
```

RealForge intentionally calls **`realc` through subprocess** rather than importing
compiler internals. That proves RealLang diagnostics are machine-readable for agent
loops.

## Related documents

- [Architecture](realforge-architecture.md)
- [Self-improvement (0.6)](realforge-self-improvement.md)
- [Research (0.9)](realforge-research.md)
- [Cycle (1.0)](realforge-cycle.md)
- [Local models](realforge-local-models.md)
- [Language semantics](language-semantics.md)
- [LLM study framework](../llm_study/README.md)
