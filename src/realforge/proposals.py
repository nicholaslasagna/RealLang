from __future__ import annotations

import shutil
import uuid
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.experiment import build_validation_commands, run_validation_commands
from realforge.experiment_report import ExperimentReport, load_report_json
from realforge.git_utils import (
    apply_patch_to_directory,
    is_workspace_dirty,
    parse_patch_paths,
    snapshot_working_tree,
    working_tree_changed,
)
from realforge.permissions import PermissionMode, Permissions
from realforge.proposal_report import (
    MergeProposal,
    ProposalStatus,
    format_propose_merge_outcome,
    format_proposal_summary,
    load_proposal_json,
    proposal_path,
    proposals_dir,
    utc_now_iso,
    write_proposal_json,
)
from realforge.runner import CommandResult, run_command
from realforge.workspace import assert_can_write, assert_path_in_workspace, create_backup

COMMIT_AUTHOR = "Imagicast Studios <reallang@users.noreply.github.com>"
CommandRunner = Callable[..., CommandResult]


class ProposalError(Exception):
    pass


@dataclass(frozen=True)
class ApplyProposalOutcome:
    proposal: MergeProposal
    message: str
    ok: bool


def _validation_summary(report: ExperimentReport) -> str:
    if not report.command_results:
        return "no validation command results recorded"
    passed = sum(1 for item in report.command_results if item.passed)
    total = len(report.command_results)
    return f"{passed}/{total} validation commands passed in experiment {report.id}"


def _default_risks(report: ExperimentReport) -> tuple[str, ...]:
    risks = [
        "Patch was validated in isolation; main workspace context may differ.",
        "Model-generated or hand-edited patches remain untrusted until reviewed.",
    ]
    for note in report.notes:
        if note not in risks:
            risks.append(note)
    return tuple(risks)


def _default_rollback_plan() -> str:
    return (
        "If post-apply validation fails, RealForge restores pre-apply file contents from "
        "in-memory backups. Review git status before committing."
    )


def _assert_proposal_write_path(path: Path, workspace_root: Path) -> None:
    assert_path_in_workspace(path, workspace_root)
    proposals_root = proposals_dir(workspace_root).resolve()
    try:
        path.resolve().relative_to(proposals_root)
    except ValueError as err:
        raise ProposalError(f"proposal write refused outside {proposals_root}: {path}") from err


def propose_merge_from_report(
    report_path: Path,
    *,
    workspace_root: Path,
    config: RealForgeConfig | None = None,
) -> MergeProposal:
    workspace_root = workspace_root.resolve()
    report_path = report_path.resolve()
    report = load_report_json(report_path)

    if not report.passed:
        raise ProposalError("experiment report did not pass validation")
    if report.main_workspace_modified:
        raise ProposalError("experiment report indicates the main workspace was modified")
    if not report.patch_file:
        raise ProposalError("experiment report has no patch_file metadata")

    source_patch = Path(report.patch_file).resolve()
    if not source_patch.is_file():
        raise ProposalError(f"patch file not found: {source_patch}")

    proposal_id = uuid.uuid4().hex[:12]
    target_dir = proposals_dir(workspace_root)
    stored_patch = target_dir / f"{proposal_id}.patch"
    proposal_json = proposal_path(workspace_root, proposal_id)
    _assert_proposal_write_path(stored_patch, workspace_root)
    _assert_proposal_write_path(proposal_json, workspace_root)

    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_patch, stored_patch)

    proposal = MergeProposal(
        id=proposal_id,
        created_at=utc_now_iso(),
        title=f"Merge proposal: {report.area} experiment {report.id}",
        source_report=str(report_path),
        patch_file=str(stored_patch.relative_to(workspace_root)),
        validation_summary=_validation_summary(report),
        passed=True,
        risks=_default_risks(report),
        rollback_plan=_default_rollback_plan(),
        status=ProposalStatus.PENDING.value,
    )
    write_proposal_json(proposal, proposal_json)
    return proposal


def list_proposals(workspace_root: Path) -> tuple[MergeProposal, ...]:
    root = proposals_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    proposals: list[MergeProposal] = []
    for path in sorted(root.glob("*.json")):
        proposals.append(load_proposal_json(path))
    return tuple(proposals)


def show_proposal(workspace_root: Path, proposal_id: str) -> MergeProposal:
    path = proposal_path(workspace_root.resolve(), proposal_id)
    if not path.is_file():
        raise ProposalError(f"proposal not found: {proposal_id}")
    return load_proposal_json(path)


def _save_proposal(workspace_root: Path, proposal: MergeProposal) -> None:
    path = proposal_path(workspace_root, proposal.id)
    _assert_proposal_write_path(path, workspace_root)
    write_proposal_json(proposal, path)


def _backup_patch_targets(
    workspace_root: Path,
    patch_file: Path,
) -> dict[Path, str | None]:
    backups: dict[Path, str | None] = {}
    for rel in parse_patch_paths(patch_file):
        path = workspace_root / rel
        backups[path] = path.read_text(encoding="utf-8") if path.is_file() else None
    return backups


def _rollback_patch_targets(backups: dict[Path, str | None]) -> None:
    for path, content in backups.items():
        if content is None:
            if path.exists():
                path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")


def _create_rotated_backups(
    workspace_root: Path,
    patch_file: Path,
    *,
    permissions: Permissions,
    suffix: str,
) -> list[Path]:
    created: list[Path] = []
    for rel in parse_patch_paths(patch_file):
        path = workspace_root / rel
        if path.is_file():
            assert_can_write(path, permissions)
            created.append(create_backup(path, suffix))
    return created


def _git_commit(workspace_root: Path, message: str, *, config: RealForgeConfig) -> str:
    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=workspace_root)
    add_result = run_command(("git", "add", "-A"), config=config, permissions=perms, cwd=workspace_root)
    if add_result.returncode != 0:
        raise ProposalError(add_result.stderr.strip() or add_result.stdout.strip() or "git add failed")

    author_env = {
        "GIT_AUTHOR_NAME": "Imagicast Studios",
        "GIT_AUTHOR_EMAIL": "reallang@users.noreply.github.com",
        "GIT_COMMITTER_NAME": "Imagicast Studios",
        "GIT_COMMITTER_EMAIL": "reallang@users.noreply.github.com",
    }
    commit_result = run_command(
        ("git", "commit", "-m", message),
        config=config,
        permissions=perms,
        cwd=workspace_root,
        env=author_env,
    )
    if commit_result.returncode != 0:
        raise ProposalError(commit_result.stderr.strip() or commit_result.stdout.strip() or "git commit failed")

    rev = run_command(("git", "rev-parse", "HEAD"), config=config, permissions=perms, cwd=workspace_root)
    if rev.returncode != 0:
        raise ProposalError("git rev-parse HEAD failed after commit")
    return rev.stdout.strip()


def apply_proposal(
    proposal_id: str,
    *,
    workspace_root: Path,
    config: RealForgeConfig | None = None,
    confirm: bool = False,
    commit: bool = False,
    command_runner: CommandRunner = run_command,
) -> ApplyProposalOutcome:
    if not confirm:
        raise ProposalError("apply-proposal requires --confirm")

    cfg = config or RealForgeConfig(workspace_root=workspace_root)
    root = (cfg.workspace_root or workspace_root).resolve()
    proposal = show_proposal(root, proposal_id)

    if proposal.status != ProposalStatus.PENDING.value:
        raise ProposalError(f"proposal {proposal_id} is not pending (status={proposal.status})")
    if not proposal.passed:
        raise ProposalError("proposal is not based on a passed experiment")

    patch_path = (root / proposal.patch_file).resolve()
    if not patch_path.is_file():
        raise ProposalError(f"patch file not found: {patch_path}")

    if is_workspace_dirty(root, config=cfg):
        raise ProposalError("main workspace has uncommitted changes; commit or stash before applying")

    perms = Permissions(mode=PermissionMode.WORKSPACE_WRITE, workspace_root=root)
    before_snapshot = snapshot_working_tree(root)
    backups = _backup_patch_targets(root, patch_path)
    validation_commands = build_validation_commands("quick", root, config=cfg)

    apply_result = apply_patch_to_directory(patch_path, root, config=cfg)
    if apply_result.returncode != 0:
        detail = apply_result.stderr.strip() or apply_result.stdout.strip() or "patch apply failed"
        failed = replace(proposal, status=ProposalStatus.FAILED.value, applied_at=utc_now_iso())
        _save_proposal(root, failed)
        return ApplyProposalOutcome(
            proposal=failed,
            message=f"apply failed: {detail}",
            ok=False,
        )

    _create_rotated_backups(root, patch_path, permissions=perms, suffix=cfg.backup_suffix)
    command_results, failures = run_validation_commands(
        validation_commands,
        workspace=root,
        config=cfg,
        command_runner=command_runner,
    )

    if failures:
        _rollback_patch_targets(backups)
        failed = replace(proposal, status=ProposalStatus.FAILED.value, applied_at=utc_now_iso())
        _save_proposal(root, failed)
        lines = ["RealForge apply-proposal failed; changes rolled back", f"Proposal ID: {proposal_id}"]
        for failure in failures:
            lines.append(f"  - {failure}")
        return ApplyProposalOutcome(proposal=failed, message="\n".join(lines), ok=False)

    after_snapshot = snapshot_working_tree(root)
    if working_tree_changed(before_snapshot, after_snapshot) is False:
        pass

    commit_hash: str | None = None
    if commit:
        try:
            commit_hash = _git_commit(root, proposal.title, config=cfg)
        except ProposalError as err:
            _rollback_patch_targets(backups)
            failed = replace(proposal, status=ProposalStatus.FAILED.value, applied_at=utc_now_iso())
            _save_proposal(root, failed)
            return ApplyProposalOutcome(proposal=failed, message=str(err), ok=False)

    applied = replace(
        proposal,
        status=ProposalStatus.APPLIED.value,
        applied_at=utc_now_iso(),
        commit=commit_hash,
    )
    _save_proposal(root, applied)

    lines = [
        "RealForge apply-proposal succeeded",
        f"Proposal ID: {proposal_id}",
        f"Patch applied: {proposal.patch_file}",
        "Post-apply validation passed.",
    ]
    if commit_hash:
        lines.append(f"Commit: {commit_hash}")
    else:
        lines.append("Changes left uncommitted (default). Review with git status before committing.")
    if command_results:
        lines.append("Validation results:")
        for result in command_results:
            status = "PASS" if result.passed else "FAIL"
            lines.append(f"  - [{status}] {result.command}")
    return ApplyProposalOutcome(proposal=applied, message="\n".join(lines), ok=True)


def format_list_proposals(proposals: tuple[MergeProposal, ...]) -> str:
    if not proposals:
        return "No merge proposals found in .realforge/proposals/"
    lines = ["RealForge merge proposals:"]
    for proposal in proposals:
        lines.append(
            f"  - {proposal.id} [{proposal.status}] {proposal.title} patch={proposal.patch_file}"
        )
    return "\n".join(lines)
