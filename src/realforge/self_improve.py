from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from realforge.index.context_builder import build_context
from realforge.index.file_index import scan_workspace
from realforge.self_improvement_plan import (
    SelfImprovementPlan,
    format_improvement_plan,
)
from realforge.providers.base import ModelProvider, ImproveRequest


AREA_TASKS = {
    "safety": "Improve RealForge safety, permissions, workspace boundaries, and rollback behavior.",
    "tests": "Improve RealForge and RealLang test coverage and validation discipline.",
    "docs": "Improve RealForge and RealLang documentation accuracy and self-improvement guidance.",
    "compiler": "Identify compiler-adjacent improvements without changing RealLang syntax.",
    "realforge": "Improve the RealForge agent layer, CLI, and local provider workflows.",
}


AREA_PATH_HINTS = {
    "safety": ("permissions", "workspace", "patcher", "runner", "rollback", "safety"),
    "tests": ("tests/", "pytest", "test_"),
    "docs": ("docs/", "README.md", "roadmap"),
    "compiler": ("src/reallang/", "realc", "diagnostics"),
    "realforge": ("src/realforge/", "realforge", "provider", "context"),
}


@dataclass(frozen=True)
class ImproveOutcome:
    plan: SelfImprovementPlan
    proposed_patch: str | None
    message: str
    area: str


def _relative(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _path_matches_area(rel: str, area: str) -> bool:
    lowered = rel.lower()
    return any(hint in lowered for hint in AREA_PATH_HINTS.get(area, (area,)))


def build_improvement_context(
    area: str,
    workspace_root: Path,
    *,
    max_chars: int = 12000,
) -> str:
    task = AREA_TASKS.get(area, AREA_TASKS["realforge"])
    index = scan_workspace(workspace_root)
    root = index.workspace_root

    selected_docs = [
        path
        for path in index.docs
        if _path_matches_area(_relative(path, root), area)
        or path.name in {"README.md", "project-status.md", "realforge.md", "realforge-architecture.md", "roadmap.md"}
    ]
    selected_tests = [path for path in index.tests if _path_matches_area(_relative(path, root), area)]

    extra_lines = [
        f"Improvement area: {area}",
        f"Indexed docs: {len(selected_docs)}",
        f"Indexed tests: {len(selected_tests)}",
    ]
    if selected_docs:
        extra_lines.append("Area docs:")
        extra_lines.extend(f"  - {_relative(path, root)}" for path in selected_docs[:10])
    if selected_tests:
        extra_lines.append("Area tests:")
        extra_lines.extend(f"  - {_relative(path, root)}" for path in selected_tests[:10])

    bundle = build_context(task, workspace_root, max_chars=max_chars)
    return bundle.text + "\n\n## Improvement Area Focus\n" + "\n".join(extra_lines)


def run_improve(
    *,
    area: str,
    provider: ModelProvider,
    workspace_root: Path,
    propose_patch: bool = False,
    max_context_chars: int = 12000,
) -> ImproveOutcome:
    context = build_improvement_context(area, workspace_root, max_chars=max_context_chars)
    request = ImproveRequest(area=area, context=context, propose_patch=propose_patch)
    plan = provider.generate_improvement_plan(request)
    proposed_patch: str | None = None
    if propose_patch:
        proposed_patch = provider.generate_patch_proposal(request, plan)

    message = format_improvement_plan(plan)
    if proposed_patch:
        message += (
            "\n\nUNTRUSTED MODEL PATCH PROPOSAL (dry-run only)\n"
            "--- proposed patch ---\n"
            f"{proposed_patch.rstrip()}\n"
            "--- end proposed patch ---"
        )
    return ImproveOutcome(plan=plan, proposed_patch=proposed_patch, message=message, area=area)
