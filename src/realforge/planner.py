from __future__ import annotations

import json
import re
from dataclasses import dataclass

from realforge.errors import ProviderPlanError


@dataclass(frozen=True)
class PlanStep:
    order: int
    action: str
    detail: str


@dataclass(frozen=True)
class AgentPlan:
    task: str
    summary: str
    steps: tuple[PlanStep, ...]
    files_to_inspect: tuple[str, ...] = ()
    files_to_modify: tuple[str, ...] = ()
    commands_to_run: tuple[str, ...] = ()
    risks: tuple[str, ...] = ()
    requires_write_permission: bool = False
    used_context: bool = False


def format_plan(plan: AgentPlan, *, brief: bool = False) -> str:
    title = "RealForge plan" if not brief else "RealForge answer"
    lines = [
        "UNTRUSTED PROVIDER OUTPUT (not verified by RealForge)",
        title,
        f"Task: {plan.task}",
        f"Summary: {plan.summary}",
    ]
    if plan.used_context:
        lines.append("Context: included")
    lines.append("Steps:")
    for step in plan.steps:
        lines.append(f"  {step.order}. [{step.action}] {step.detail}")
    if not brief:
        lines.extend(_format_plan_fields(plan))
    elif plan.files_to_inspect:
        lines.append(f"Inspect: {', '.join(plan.files_to_inspect)}")
    return "\n".join(lines)


def _format_plan_fields(plan: AgentPlan) -> list[str]:
    lines: list[str] = []
    if plan.files_to_inspect:
        lines.append(f"Files to inspect: {', '.join(plan.files_to_inspect)}")
    if plan.files_to_modify:
        lines.append(f"Files to modify: {', '.join(plan.files_to_modify)}")
    if plan.commands_to_run:
        lines.append("Suggested commands (not executed automatically):")
        for cmd in plan.commands_to_run:
            lines.append(f"  - {cmd}")
    if plan.risks:
        lines.append("Risks:")
        for risk in plan.risks:
            lines.append(f"  - {risk}")
    lines.append(f"Requires write permission: {plan.requires_write_permission}")
    lines.append("Note: provider output is untrusted; RealForge does not verify or run suggested commands.")
    return lines


def _string_list(value: object, field: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list of strings")
    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{field} must contain non-empty strings")
        items.append(item.strip())
    return tuple(items)


def mock_plan_for_task(task: str, *, context: str | None = None) -> AgentPlan:
    """Deterministic plan template used by MockProvider and tests."""
    normalized = task.strip() or "(empty task)"
    files_to_inspect: list[str] = []
    if "hello.real" in normalized.lower() or "hello" in normalized.lower():
        files_to_inspect.append("examples/hello.real")
    if context and "README.md" in context:
        files_to_inspect.append("README.md")
    if context and "docs/project-status.md" in context:
        files_to_inspect.append("docs/project-status.md")

    files_to_modify = ("examples/hello.real",) if "modify hello.real" in normalized.lower() else ()
    commands = (
        "realforge check examples/hello.real",
        "realforge context --task \"explain hello.real\"",
    )
    if context:
        commands = commands + ("realforge plan --task \"explain hello.real\" --include-context",)

    return AgentPlan(
        task=normalized,
        summary="Inspect RealLang sources with realc, apply only safe rule-based repairs.",
        steps=(
            PlanStep(1, "index", "Scan workspace for .real files relevant to the task."),
            PlanStep(2, "check", f"Run realc --check on files related to: {normalized}"),
            PlanStep(3, "diagnose", "Parse structured REAL_*_ERROR diagnostics from stderr."),
            PlanStep(
                4,
                "repair",
                "Apply conservative E203 let→var repairs only when proven safe.",
            ),
            PlanStep(5, "verify", "Rerun realc --check and report pass/fail."),
        ),
        files_to_inspect=tuple(dict.fromkeys(files_to_inspect)),
        files_to_modify=files_to_modify,
        commands_to_run=commands,
        risks=("Model plans are untrusted until verified with realc --check.",),
        requires_write_permission=bool(files_to_modify),
        used_context=context is not None,
    )


def parse_plan_response(
    task: str,
    text: str,
    *,
    provider: str = "provider",
    used_context: bool = False,
) -> AgentPlan:
    normalized = task.strip() or "(empty task)"
    try:
        payload = json.loads(text) if text.strip().startswith("{") else _extract_json(text)
    except (json.JSONDecodeError, ValueError) as err:
        raise ProviderPlanError(provider, f"invalid JSON plan response: {err}", raw=text) from err

    if not isinstance(payload, dict):
        raise ProviderPlanError(provider, "plan JSON must be an object", raw=text)

    try:
        summary = str(payload.get("summary", "")).strip() or "Plan generated by local model."
        raw_steps = payload.get("steps", [])
        steps: list[PlanStep] = []
        if not isinstance(raw_steps, list):
            raise ValueError("steps must be a list")
        for index, item in enumerate(raw_steps, start=1):
            if not isinstance(item, dict):
                continue
            order = int(item.get("order", index))
            action = str(item.get("action", "step")).strip() or "step"
            detail = str(item.get("detail", "")).strip() or action
            steps.append(PlanStep(order=order, action=action, detail=detail))
        if not steps:
            raise ValueError("plan JSON contained no usable steps")

        requires_write = payload.get("requires_write_permission", False)
        if not isinstance(requires_write, bool):
            raise ValueError("requires_write_permission must be a boolean")

        return AgentPlan(
            task=normalized,
            summary=summary,
            steps=tuple(steps),
            files_to_inspect=_string_list(payload.get("files_to_inspect"), "files_to_inspect"),
            files_to_modify=_string_list(payload.get("files_to_modify"), "files_to_modify"),
            commands_to_run=_string_list(payload.get("commands_to_run"), "commands_to_run"),
            risks=_string_list(payload.get("risks"), "risks"),
            requires_write_permission=requires_write,
            used_context=used_context,
        )
    except ValueError as err:
        raise ProviderPlanError(provider, str(err), raw=text) from err


def _extract_json(text: str) -> dict:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(stripped[start : end + 1])
    raise ValueError("no JSON object found in model response")
