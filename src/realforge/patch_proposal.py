from __future__ import annotations

import json
import re
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

from realforge.errors import ProviderPlanError
from realforge.experiment_report import ExperimentReport, format_experiment_report
from realforge.index.context_builder import build_context
from realforge.patch_proposal_report import (
    PatchProposal,
    patch_proposal_diff_path,
    utc_now_iso,
    write_patch_proposal,
)
from realforge.patch_safety import (
    PatchInspection,
    PatchSafetyError,
    inspect_patch_file,
    parse_patch_targets_from_text,
    sha256_text,
    validate_patch_targets,
)
from realforge.git_utils import is_git_repo
from realforge.providers.base import ModelProvider, PatchProposalRequest
from realforge.self_improvement_plan import _extract_json, _string_list


class PatchProposalError(Exception):
    pass


@dataclass(frozen=True)
class ProposePatchOutcome:
    ok: bool
    message: str
    proposal: PatchProposal | None = None
    inspection: PatchInspection | None = None
    saved_json: Path | None = None
    saved_diff: Path | None = None
    experiment_report: ExperimentReport | None = None


def parse_patch_proposal_payload(
    text: str,
    *,
    provider: str,
    task: str,
    proposal_id: str | None = None,
    created_at: str | None = None,
) -> PatchProposal:
    try:
        payload = _extract_json(text)
    except json.JSONDecodeError as err:
        raise ProviderPlanError(provider, f"invalid JSON patch proposal: {err}", raw=text) from err
    except ValueError as err:
        raise ProviderPlanError(provider, str(err), raw=text) from err

    if not isinstance(payload, dict):
        raise ProviderPlanError(provider, "patch proposal JSON must be an object", raw=text)

    try:
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ValueError("title is required")
        summary = str(payload.get("summary", "")).strip()
        if not summary:
            raise ValueError("summary is required")
        rationale = str(payload.get("rationale", "")).strip()
        if not rationale:
            raise ValueError("rationale is required")
        unified_diff = str(payload.get("unified_diff", "")).strip()
        if not unified_diff:
            raise ValueError("unified_diff is required")
        requires = payload.get("requires_human_approval", True)
        if not isinstance(requires, bool):
            raise ValueError("requires_human_approval must be a boolean")
        if requires is not True:
            raise ValueError("requires_human_approval must be true for patch proposals")

        validation = _string_list(payload.get("validation_commands"), "validation_commands")
        if not validation:
            raise ValueError("validation_commands must contain at least one command")

        return PatchProposal(
            id=proposal_id or uuid.uuid4().hex[:12],
            created_at=created_at or utc_now_iso(),
            provider=provider,
            task=task,
            title=title,
            summary=summary,
            rationale=rationale,
            files_to_modify=_string_list(payload.get("files_to_modify"), "files_to_modify"),
            validation_commands=validation,
            risks=_string_list(payload.get("risks"), "risks"),
            unified_diff=unified_diff,
            patch_sha256="",
            patch_targets=(),
            requires_human_approval=True,
            untrusted=True,
        )
    except ValueError as err:
        raise ProviderPlanError(provider, str(err), raw=text) from err


def _reject_binary_patch(text: str) -> None:
    if "GIT binary patch" in text:
        raise PatchSafetyError("binary patches rejected for v1.9")
    if re.search(r"^Binary files .* differ$", text, re.MULTILINE):
        raise PatchSafetyError("binary patches rejected for v1.9")


def inspect_patch_text(
    text: str,
    workspace_root: Path,
    *,
    config=None,
) -> PatchInspection:
    stripped = text.strip()
    if not stripped:
        raise PatchSafetyError("empty patch diff rejected")
    if "---" not in stripped and "diff --git" not in stripped:
        raise PatchSafetyError("patch must be a unified diff")
    _reject_binary_patch(stripped)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".diff", delete=False, encoding="utf-8") as handle:
        handle.write(stripped.rstrip() + "\n")
        temp_path = Path(handle.name)
    try:
        try:
            return inspect_patch_file(temp_path, workspace_root, config=config)
        except PatchSafetyError as err:
            if not is_git_repo(workspace_root):
                raise
            raw_targets = parse_patch_targets_from_text(stripped)
            patch_targets = validate_patch_targets(raw_targets, workspace_root)
            deleted_raw, new_raw = _parse_deleted_new_from_text(stripped)
            deleted_targets = validate_patch_targets(deleted_raw, workspace_root) if deleted_raw else ()
            new_targets = validate_patch_targets(new_raw, workspace_root) if new_raw else ()
            if "git apply" not in str(err).lower() and "corrupt patch" not in str(err).lower():
                raise
            return PatchInspection(
                patch_sha256=sha256_text(stripped),
                patch_targets=patch_targets,
                deleted_targets=deleted_targets,
                new_targets=new_targets,
            )
    finally:
        temp_path.unlink(missing_ok=True)


def _parse_deleted_new_from_text(text: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    from realforge.patch_safety import _parse_deleted_new_from_text as parse_deleted_new

    return parse_deleted_new(text)


def finalize_patch_proposal(
    proposal: PatchProposal,
    inspection: PatchInspection,
) -> PatchProposal:
    return PatchProposal(
        id=proposal.id,
        created_at=proposal.created_at,
        provider=proposal.provider,
        task=proposal.task,
        title=proposal.title,
        summary=proposal.summary,
        rationale=proposal.rationale,
        files_to_modify=proposal.files_to_modify,
        validation_commands=proposal.validation_commands,
        risks=proposal.risks,
        unified_diff=proposal.unified_diff.rstrip() + "\n",
        patch_sha256=inspection.patch_sha256,
        patch_targets=inspection.patch_targets,
        requires_human_approval=proposal.requires_human_approval,
        untrusted=True,
    )


def format_patch_proposal(proposal: PatchProposal) -> str:
    lines = [
        "UNTRUSTED PROVIDER PATCH PROPOSAL (not verified until RealForge patch safety checks pass)",
        f"ID: {proposal.id}",
        f"Provider: {proposal.provider}",
        f"Task: {proposal.task}",
        f"Title: {proposal.title}",
        f"Summary: {proposal.summary}",
        f"Rationale: {proposal.rationale}",
        f"Requires human approval: {proposal.requires_human_approval}",
        f"Untrusted: {proposal.untrusted}",
    ]
    if proposal.files_to_modify:
        lines.append(f"Files to modify: {', '.join(proposal.files_to_modify)}")
    if proposal.validation_commands:
        lines.append("Suggested validation commands (not executed automatically):")
        for cmd in proposal.validation_commands:
            lines.append(f"  - {cmd}")
    if proposal.risks:
        lines.append("Risks:")
        for risk in proposal.risks:
            lines.append(f"  - {risk}")
    if proposal.patch_sha256:
        lines.append(f"Patch SHA-256: {proposal.patch_sha256}")
    if proposal.patch_targets:
        lines.append(f"Patch targets: {', '.join(proposal.patch_targets)}")
    lines.extend(
        [
            "",
            "--- proposed unified diff ---",
            proposal.unified_diff.rstrip(),
            "--- end proposed unified diff ---",
            "",
            "Note: saving a patch proposal is not approval. Main workspace is not modified.",
        ]
    )
    return "\n".join(lines)


def run_propose_patch(
    *,
    task: str,
    provider: ModelProvider,
    workspace_root: Path,
    config=None,
    max_context_chars: int = 12000,
    save: bool = False,
    run_experiment: bool = False,
    validation_mode: str = "quick",
    temp_root: Path | None = None,
) -> ProposePatchOutcome:
    if not task.strip():
        raise PatchProposalError("task must not be empty")

    bundle = build_context(task, workspace_root, max_chars=max_context_chars)
    request = PatchProposalRequest(task=task.strip(), context=bundle.text)
    raw_proposal = provider.generate_task_patch_proposal(request)

    try:
        inspection = inspect_patch_text(raw_proposal.unified_diff, workspace_root, config=config)
    except PatchSafetyError as err:
        raise PatchProposalError(str(err)) from err

    proposal = finalize_patch_proposal(raw_proposal, inspection)
    message = format_patch_proposal(proposal)
    saved_json: Path | None = None
    saved_diff: Path | None = None
    experiment_report: ExperimentReport | None = None

    if save or run_experiment:
        saved_json, saved_diff = write_patch_proposal(proposal, workspace_root)
        message += f"\nSaved patch proposal: {saved_json.parent}"

    if run_experiment:
        from realforge.experiment import run_experiment_patch

        patch_file = saved_diff or patch_proposal_diff_path(workspace_root, proposal.id)
        experiment_report = run_experiment_patch(
            area="realforge",
            patch_file=patch_file,
            workspace_root=workspace_root,
            config=config,
            validation_mode=validation_mode,
            temp_root=temp_root,
        )
        message += "\n\n" + format_experiment_report(experiment_report)
        if experiment_report.passed:
            message += "\nExperiment passed in isolated workspace. No merge proposal was created."
        message += "\nMain workspace was not modified."

    return ProposePatchOutcome(
        ok=True,
        message=message,
        proposal=proposal,
        inspection=inspection,
        saved_json=saved_json,
        saved_diff=saved_diff,
        experiment_report=experiment_report,
    )
