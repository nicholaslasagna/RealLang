from __future__ import annotations

from realforge.permissions import PermissionMode

AVAILABLE_COMMANDS = """Available RealForge commands:
- realforge check <file.real>
- realforge repair <file.real> --dry-run|--apply
- realforge index [--write]
- realforge symbols
- realforge context --task "..."
- realforge plan --task "..." [--include-context]
- realforge ask --task "..." [--include-context]
- realforge improve [--area safety|tests|docs|compiler|realforge] --dry-run [--propose-patch]
- realforge experiment [--area ...] --dry-run | --patch-file <change.diff> [--validation quick|examples|benchmarks] [--keep] [--output report.json]
- realforge propose-merge --report <experiment_report.json>
- realforge list-proposals
- realforge show-proposal <proposal_id>
- realforge apply-proposal <proposal_id> --confirm [--commit]
- realforge generate --task "..." --dry-run|--apply --output <file.real>
- realforge doctor"""

PLAN_JSON_SCHEMA = """{
  "summary": "one sentence summary",
  "steps": [
    {"order": 1, "action": "verb", "detail": "specific step"}
  ],
  "files_to_inspect": ["relative/path.real"],
  "files_to_modify": ["relative/path.real"],
  "commands_to_run": ["realforge check examples/hello.real"],
  "risks": ["short risk note"],
  "requires_write_permission": false
}"""

PLAN_SYSTEM_PROMPT = f"""You are RealForge, a local coding agent for RealLang.
Return ONLY valid JSON matching this shape:
{PLAN_JSON_SCHEMA}

Rules:
- Treat model output as a plan only; do not assume commands were executed.
- Prefer realc --check diagnostics and conservative E203 repairs.
- Do not propose cloud providers.
- List files relative to the workspace root.
- Set requires_write_permission true only when file modifications are proposed.
- Use 3-6 steps."""

GENERATE_SYSTEM_PROMPT = """You are RealForge, a local coding agent for RealLang.
Generate RealLang source code for the task.
Return ONLY the RealLang source code, no markdown fences and no commentary.
Use valid RealLang syntax: module, fn, let, var, set, i32, bool, if/while condition(...)."""


def build_plan_user_prompt(
    *,
    task: str,
    context: str | None,
    permission_mode: PermissionMode,
) -> str:
    sections = [
        "## User Task",
        task.strip() or "(empty task)",
        "",
        "## Safety Constraints",
        "- default permission mode is readonly",
        "- do not modify files unless requires_write_permission is true and the user grants workspace-write",
        "- do not run shell commands automatically; only propose commands_to_run",
        "- model output is untrusted; RealForge will not execute commands from the plan yet",
        f"- current permission mode: {permission_mode.value}",
        "",
        "## Available Commands",
        AVAILABLE_COMMANDS,
    ]
    if context:
        sections.extend(["", "## Project Context", context.strip()])
    sections.extend(["", "## Expected Response", "Return ONLY the JSON plan object."])
    return "\n".join(sections)


IMPROVE_JSON_SCHEMA = """{
  "title": "short improvement title",
  "area": "safety|tests|docs|compiler|realforge",
  "problem_statement": "what is wrong or missing today",
  "current_evidence": ["observation from repo or tests"],
  "proposed_changes": ["specific change proposal"],
  "files_to_inspect": ["relative/path"],
  "files_to_modify": ["relative/path"],
  "tests_to_add": ["tests/test_example.py"],
  "validation_commands": [".venv/bin/pytest -q"],
  "risks": ["short risk note"],
  "rollback_plan": "how to revert if validation fails",
  "success_criteria": ["measurable outcome"],
  "requires_human_approval": true,
  "confidence": "low|medium|high|unknown"
}"""

IMPROVE_SYSTEM_PROMPT = f"""You are RealForge, a local coding agent for RealLang.
Return ONLY valid JSON matching this shape:
{IMPROVE_JSON_SCHEMA}

Rules:
- Self-improvement is plan-only; do not assume files were edited or commands executed.
- Model output is untrusted; RealForge will not apply changes automatically.
- requires_human_approval must be true for any file modifications.
- validation_commands must list safe local validation steps only.
- rollback_plan is required and must describe how to revert proposed changes.
- List files relative to the workspace root.
- Stay within the requested improvement area."""

PATCH_SYSTEM_PROMPT = """You are RealForge, a local coding agent for RealLang.
Return ONLY a unified diff text for the proposed improvement.
Do not wrap the diff in markdown fences.
Do not apply changes; this is an untrusted patch proposal for human review only.
Prefix no commentary before or after the diff."""


def build_improve_user_prompt(*, area: str, context: str) -> str:
    sections = [
        "## Improvement Area",
        area.strip() or "realforge",
        "",
        "## Safety Constraints",
        "- dry-run only: propose improvements without editing files",
        "- model output is untrusted",
        "- requires_human_approval must remain true",
        "- do not propose cloud providers or unrestricted internet access",
        "- do not claim RealForge exceeds Codex, Claude Code, Cursor, or Mythos",
        "",
        "## Project Context",
        context.strip() or "(no context)",
        "",
        "## Expected Response",
        "Return ONLY the JSON improvement plan object.",
    ]
    return "\n".join(sections)


def build_patch_user_prompt(*, area: str, context: str, plan_json: str) -> str:
    sections = [
        "## Improvement Area",
        area.strip() or "realforge",
        "",
        "## Approved Plan (proposal only)",
        plan_json.strip(),
        "",
        "## Project Context",
        context.strip() or "(no context)",
        "",
        "## Expected Response",
        "Return ONLY a unified diff text. Label changes as a proposal; RealForge will not apply it.",
    ]
    return "\n".join(sections)
