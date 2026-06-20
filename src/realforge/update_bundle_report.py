from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


class BundleStatus(str, Enum):
    CANDIDATE = "candidate"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"
    APPLIED = "applied"


BUNDLE_STATUSES = frozenset(status.value for status in BundleStatus)
MARKABLE_BUNDLE_STATUSES = frozenset(
    {BundleStatus.APPROVED.value, BundleStatus.REJECTED.value, BundleStatus.SUPERSEDED.value}
)
TERMINAL_BUNDLE_STATUSES = frozenset(
    {BundleStatus.SUPERSEDED.value, BundleStatus.APPLIED.value}
)
ALLOWED_BUNDLE_TRANSITIONS: dict[str, frozenset[str]] = {
    BundleStatus.CANDIDATE.value: frozenset(
        {
            BundleStatus.APPROVED.value,
            BundleStatus.REJECTED.value,
            BundleStatus.SUPERSEDED.value,
        }
    ),
    BundleStatus.APPROVED.value: frozenset({BundleStatus.SUPERSEDED.value}),
    BundleStatus.REJECTED.value: frozenset(),
    BundleStatus.SUPERSEDED.value: frozenset(),
    BundleStatus.APPLIED.value: frozenset(),
}


def validate_bundle_status_transition(current: str, new: str, *, force: bool = False) -> None:
    if current == new:
        raise ValueError(f"bundle already has status {current}")
    if current in TERMINAL_BUNDLE_STATUSES:
        raise ValueError(f"cannot transition from terminal status {current}")
    if current == BundleStatus.REJECTED.value and new == BundleStatus.APPROVED.value:
        raise ValueError("rejected bundles cannot become approved in RealForge 1.6")
    if current == BundleStatus.APPROVED.value and new == BundleStatus.REJECTED.value:
        if force:
            raise ValueError("approved -> rejected with --force is unsupported in RealForge 1.6")
        raise ValueError(
            "approved bundles cannot become rejected without --force (unsupported in RealForge 1.6)"
        )
    allowed = ALLOWED_BUNDLE_TRANSITIONS.get(current, frozenset())
    if new not in allowed:
        raise ValueError(f"invalid bundle status transition: {current} -> {new}")


@dataclass(frozen=True)
class UpdateBundle:
    id: str
    created_at: str
    title: str
    version_base: str
    candidate_version: str
    area: str
    source_proposal_id: str
    source_cycle_id: str | None
    source_eval_id: str | None
    patch_sha256: str
    validation_mode: str
    validation_summary: str
    eval_summary: str | None
    patch_targets: tuple[str, ...]
    risk_summary: tuple[str, ...]
    status: str
    next_steps: tuple[str, ...]
    safety_notes: tuple[str, ...]


def updates_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "updates"


def update_bundle_path(workspace_root: Path, bundle_id: str) -> Path:
    return updates_dir(workspace_root) / f"{bundle_id}.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def bundle_to_dict(bundle: UpdateBundle) -> dict:
    return asdict(bundle)


def write_update_bundle(bundle: UpdateBundle, workspace_root: Path, *, overwrite: bool = False) -> Path:
    root = workspace_root.resolve()
    path = update_bundle_path(root, bundle.id)
    assert_path_in_workspace(path, root)
    updates_root = updates_dir(root).resolve()
    try:
        path.resolve().relative_to(updates_root)
    except ValueError as err:
        raise ValueError(f"update bundle write refused outside {updates_root}: {path}") from err
    if path.exists() and not overwrite:
        raise FileExistsError(f"update bundle file already exists: {bundle.id}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle_to_dict(bundle), indent=2) + "\n", encoding="utf-8")
    return path


def load_update_bundle(workspace_root: Path, bundle_id: str) -> UpdateBundle:
    path = update_bundle_path(workspace_root.resolve(), bundle_id)
    if not path.is_file():
        raise FileNotFoundError(f"update bundle not found: {bundle_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("update bundle JSON must be an object")
    return UpdateBundle(
        id=str(data["id"]),
        created_at=str(data.get("created_at", "")),
        title=str(data.get("title", "")),
        version_base=str(data.get("version_base", "")),
        candidate_version=str(data.get("candidate_version", "")),
        area=str(data.get("area", "")),
        source_proposal_id=str(data.get("source_proposal_id", "")),
        source_cycle_id=data.get("source_cycle_id"),
        source_eval_id=data.get("source_eval_id"),
        patch_sha256=str(data.get("patch_sha256", "")),
        validation_mode=str(data.get("validation_mode", "")),
        validation_summary=str(data.get("validation_summary", "")),
        eval_summary=data.get("eval_summary"),
        patch_targets=tuple(str(item) for item in data.get("patch_targets", [])),
        risk_summary=tuple(str(item) for item in data.get("risk_summary", [])),
        status=str(data.get("status", BundleStatus.CANDIDATE.value)),
        next_steps=tuple(str(item) for item in data.get("next_steps", [])),
        safety_notes=tuple(str(item) for item in data.get("safety_notes", [])),
    )


def list_update_bundles(workspace_root: Path) -> tuple[UpdateBundle, ...]:
    root = updates_dir(workspace_root.resolve())
    if not root.is_dir():
        return ()
    bundles: list[UpdateBundle] = []
    for path in sorted(root.glob("*.json")):
        bundles.append(load_update_bundle(workspace_root, path.stem))
    return tuple(bundles)


def format_update_bundle(bundle: UpdateBundle) -> str:
    lines = [
        "RealForge update bundle (metadata only; does not apply patches)",
        f"ID: {bundle.id}",
        f"Status: {bundle.status}",
        f"Created: {bundle.created_at}",
        f"Title: {bundle.title}",
        f"Version base: {bundle.version_base}",
        f"Candidate version: {bundle.candidate_version}",
        f"Area: {bundle.area}",
        f"Source proposal: {bundle.source_proposal_id}",
    ]
    if bundle.source_cycle_id:
        lines.append(f"Source cycle: {bundle.source_cycle_id}")
    if bundle.source_eval_id:
        lines.append(f"Source eval: {bundle.source_eval_id}")
    lines.extend(
        [
            f"Patch SHA-256: {bundle.patch_sha256}",
            f"Validation mode: {bundle.validation_mode}",
            f"Validation summary: {bundle.validation_summary}",
        ]
    )
    if bundle.eval_summary:
        lines.append(f"Eval summary: {bundle.eval_summary}")
    if bundle.patch_targets:
        lines.append("Files changed:")
        for target in bundle.patch_targets:
            lines.append(f"  - {target}")
    if bundle.risk_summary:
        lines.append("Risk summary:")
        for risk in bundle.risk_summary:
            lines.append(f"  - {risk}")
    if bundle.next_steps:
        lines.append("Next manual steps:")
        for step in bundle.next_steps:
            lines.append(f"  {step}")
    if bundle.safety_notes:
        lines.append("Safety notes:")
        for note in bundle.safety_notes:
            lines.append(f"  - {note}")
    lines.append("Note: update bundles do not apply changes; use apply-proposal --confirm after review.")
    return "\n".join(lines)


def format_update_bundle_list(bundles: tuple[UpdateBundle, ...]) -> str:
    if not bundles:
        return "No update bundles found in .realforge/updates/"
    lines = ["RealForge update bundles:"]
    for bundle in bundles:
        lines.append(
            f"  - {bundle.id} [{bundle.status}] {bundle.candidate_version} "
            f"proposal={bundle.source_proposal_id} area={bundle.area}"
        )
    return "\n".join(lines)
