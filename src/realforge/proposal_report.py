from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from realforge.experiment_report import VALIDATION_MODES


class ProposalStatus(str, Enum):
    PENDING = "pending"
    APPLIED = "applied"
    FAILED = "failed"
    REJECTED = "rejected"


@dataclass(frozen=True)
class MergeProposal:
    id: str
    created_at: str
    title: str
    source_report: str
    patch_file: str
    copied_patch_sha256: str
    patch_targets: tuple[str, ...]
    validation_mode: str
    workspace_content_digest: str | None
    validation_summary: str
    passed: bool
    risks: tuple[str, ...]
    rollback_plan: str
    status: str
    applied_at: str | None = None
    commit: str | None = None


class LegacyProposalError(ValueError):
    pass


def proposals_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "proposals"


def proposal_dir(workspace_root: Path, proposal_id: str) -> Path:
    return proposals_dir(workspace_root) / proposal_id


def proposal_path(workspace_root: Path, proposal_id: str) -> Path:
    return proposals_dir(workspace_root) / f"{proposal_id}.json"


def stored_patch_path(workspace_root: Path, proposal_id: str) -> Path:
    return proposal_dir(workspace_root, proposal_id) / "patch.diff"


def proposal_to_dict(proposal: MergeProposal) -> dict:
    return asdict(proposal)


def write_proposal_json(proposal: MergeProposal, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(proposal_to_dict(proposal), indent=2) + "\n", encoding="utf-8")
    return path


def load_proposal_json(path: Path) -> MergeProposal:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("proposal JSON must be an object")

    validation_mode = str(data.get("validation_mode", "")).strip()
    if not validation_mode:
        raise LegacyProposalError("proposal missing validation_mode (RealForge 1.1+ required)")
    if validation_mode not in VALIDATION_MODES:
        raise ValueError(f"unknown validation mode in proposal: {validation_mode}")

    copied_patch_sha256 = str(data.get("copied_patch_sha256", "")).strip()
    if not copied_patch_sha256:
        raise LegacyProposalError("proposal missing copied_patch_sha256 (RealForge 1.1+ required)")

    patch_targets = tuple(str(item) for item in data.get("patch_targets", []))
    if not patch_targets:
        raise LegacyProposalError("proposal missing patch_targets (RealForge 1.1+ required)")

    return MergeProposal(
        id=str(data.get("id", "")).strip(),
        created_at=str(data.get("created_at", "")).strip(),
        title=str(data.get("title", "")).strip(),
        source_report=str(data.get("source_report", "")).strip(),
        patch_file=str(data.get("patch_file", "")).strip(),
        copied_patch_sha256=copied_patch_sha256,
        patch_targets=patch_targets,
        validation_mode=validation_mode,
        workspace_content_digest=data.get("workspace_content_digest"),
        validation_summary=str(data.get("validation_summary", "")).strip(),
        passed=bool(data.get("passed", False)),
        risks=tuple(str(item) for item in data.get("risks", [])),
        rollback_plan=str(data.get("rollback_plan", "")).strip(),
        status=str(data.get("status", ProposalStatus.PENDING.value)).strip(),
        applied_at=data.get("applied_at"),
        commit=data.get("commit"),
    )


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def format_proposal_summary(proposal: MergeProposal) -> str:
    lines = [
        "RealForge merge proposal",
        f"ID: {proposal.id}",
        f"Status: {proposal.status}",
        f"Title: {proposal.title}",
        f"Created: {proposal.created_at}",
        f"Source report: {proposal.source_report}",
        f"Patch file: {proposal.patch_file}",
        f"Patch SHA-256: {proposal.copied_patch_sha256}",
        f"Validation mode: {proposal.validation_mode}",
        f"Experiment passed: {proposal.passed}",
        f"Validation summary: {proposal.validation_summary}",
    ]
    if proposal.patch_targets:
        lines.append("Patch targets:")
        for target in proposal.patch_targets:
            lines.append(f"  - {target}")
    if proposal.workspace_content_digest:
        lines.append(f"Workspace content digest: {proposal.workspace_content_digest}")
    if proposal.risks:
        lines.append("Risks:")
        for risk in proposal.risks:
            lines.append(f"  - {risk}")
    lines.append(f"Rollback plan: {proposal.rollback_plan}")
    if proposal.applied_at:
        lines.append(f"Applied at: {proposal.applied_at}")
    if proposal.commit:
        lines.append(f"Commit: {proposal.commit}")
    lines.extend(
        [
            "",
            "Next step:",
            f"  realforge apply-proposal {proposal.id} --confirm",
            "",
            "Note: proposal created ≠ applied. apply passed ≠ committed unless --commit.",
            "Model output remains untrusted; review the stored patch before applying.",
        ]
    )
    return "\n".join(lines)


def format_propose_merge_outcome(proposal: MergeProposal) -> str:
    lines = [
        "RealForge merge proposal created (approval required)",
        f"Proposal ID: {proposal.id}",
        f"Title: {proposal.title}",
        f"Patch file: {proposal.patch_file}",
        f"Patch SHA-256: {proposal.copied_patch_sha256}",
        f"Validation mode: {proposal.validation_mode}",
        f"Status: {proposal.status}",
        "",
        "Next step:",
        f"  realforge show-proposal {proposal.id}",
        f"  realforge apply-proposal {proposal.id} --confirm",
    ]
    return "\n".join(lines)
