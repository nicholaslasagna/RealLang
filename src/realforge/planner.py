from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlanStep:
    order: int
    action: str
    detail: str


@dataclass(frozen=True)
class AgentPlan:
    task: str
    summary: str
    steps: list[PlanStep]


def format_plan(plan: AgentPlan) -> str:
    lines = [f"Task: {plan.task}", f"Summary: {plan.summary}", "Steps:"]
    for step in plan.steps:
        lines.append(f"  {step.order}. [{step.action}] {step.detail}")
    return "\n".join(lines)


def mock_plan_for_task(task: str) -> AgentPlan:
    """Deterministic plan template used by MockProvider and tests."""
    normalized = task.strip() or "(empty task)"
    return AgentPlan(
        task=normalized,
        summary="Inspect RealLang sources with realc, apply only safe rule-based repairs.",
        steps=[
            PlanStep(1, "index", "Scan workspace for .real files relevant to the task."),
            PlanStep(2, "check", f"Run realc --check on files related to: {normalized}"),
            PlanStep(3, "diagnose", "Parse structured REAL_*_ERROR diagnostics from stderr."),
            PlanStep(
                4,
                "repair",
                "Apply conservative E203 let→var repairs only when proven safe.",
            ),
            PlanStep(5, "verify", "Rerun realc --check and report pass/fail."),
        ],
    )
