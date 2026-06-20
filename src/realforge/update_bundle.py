from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, replace

from pathlib import Path

from realforge import __version__
from realforge.config import RealForgeConfig
from realforge.cycle_report import list_cycle_reports
from realforge.eval_report import list_eval_reports
from realforge.experiment_report import LegacyExperimentReportError, load_report_json
from realforge.patch_safety import PatchSafetyError, verify_patch_sha256
from realforge.proposal_report import ProposalStatus, stored_patch_path
from realforge.proposals import ProposalError, show_proposal
from realforge.staff import require_staff_enabled
from realforge.update_bundle_report import (
    MARKABLE_BUNDLE_STATUSES,
    BundleStatus,
    UpdateBundle,
    format_update_bundle,
    format_update_bundle_list,
    list_update_bundles,
    load_update_bundle,
    update_bundle_path,
    utc_now_iso,
    write_update_bundle,
)
from realforge.update_channel import normalized_eval_score
from realforge.workspace import assert_path_in_workspace


class UpdateBundleError(Exception):
    pass


@dataclass(frozen=True)
class UpdateBundleOutcome:
    bundle: UpdateBundle | None
    message: str
    ok: bool


def candidate_version_from_base(version_base: str) -> str:
    parts = version_base.split(".")
    if len(parts) >= 2:
        return f"{parts[0]}.{parts[1]}-candidate"
    return f"{version_base}-candidate"


def _default_safety_notes() -> tuple[str, ...]:
    return (
        "Update bundles are metadata only; they do not apply patches or commit changes.",
        "Human approval and apply-proposal --confirm remain required.",
        "RealForge does not claim superiority over frontier coding tools.",
        "Provider output remains untrusted.",
    )


def _default_next_steps(proposal_id: str) -> tuple[str, ...]:
    return (
        f"realforge show-proposal {proposal_id}",
        f"realforge apply-proposal {proposal_id} --confirm",
    )


def _resolve_experiment_report_path(workspace_root: Path, source_report: str) -> Path:
    report_path = Path(source_report)
    if not report_path.is_absolute():
        report_path = workspace_root / source_report
    return report_path.resolve()


def _area_from_proposal(workspace_root: Path, proposal) -> str:
    report_path = _resolve_experiment_report_path(workspace_root, proposal.source_report)
    if report_path.is_file():
        try:
            report = load_report_json(report_path)
            return report.area
        except (LegacyExperimentReportError, ValueError):
            pass
    prefix = "Merge proposal: "
    suffix = " experiment"
    title = proposal.title
    if title.startswith(prefix) and suffix in title:
        middle = title[len(prefix) : title.index(suffix)]
        if middle:
            return middle
    return "realforge"


def _find_source_cycle_id(workspace_root: Path, proposal_id: str) -> str | None:
    for report in list_cycle_reports(workspace_root):
        if proposal_id in report.proposal_ids:
            return report.id
    return None


def _latest_eval_metadata(workspace_root: Path) -> tuple[str | None, str | None]:
    reports = list_eval_reports(workspace_root)
    if not reports:
        return None, None
    latest = max(reports, key=lambda report: report.started_at)
    normalized = normalized_eval_score(latest)
    summary = (
        f"provider={latest.provider} suite={latest.suite} passed={latest.passed} "
        f"normalized_score={normalized:.2f} total_score={latest.total_score}"
    )
    return latest.id, summary


def create_update_bundle(
    *,
    proposal_id: str,
    workspace_root: Path,
    config: RealForgeConfig,
) -> UpdateBundleOutcome:
    require_staff_enabled(config)
    root = workspace_root.resolve()

    try:
        proposal = show_proposal(root, proposal_id)
    except ProposalError as err:
        raise UpdateBundleError(str(err)) from err

    if proposal.status != ProposalStatus.PENDING.value:
        raise UpdateBundleError(
            f"proposal {proposal_id} is not pending (status={proposal.status})"
        )
    if not proposal.passed:
        raise UpdateBundleError("proposal is not based on a passed experiment")
    if not proposal.validation_mode or not proposal.validation_summary.strip():
        raise UpdateBundleError("proposal missing validation metadata")

    patch_path = stored_patch_path(root, proposal_id)
    if not patch_path.is_file():
        raise UpdateBundleError(f"stored patch not found for proposal {proposal_id}")

    try:
        verify_patch_sha256(patch_path, proposal.copied_patch_sha256)
    except PatchSafetyError as err:
        raise UpdateBundleError(f"patch hash verification failed: {err}") from err

    version_base = __version__
    cycle_id = _find_source_cycle_id(root, proposal_id)
    eval_id, eval_summary = _latest_eval_metadata(root)
    bundle_id = uuid.uuid4().hex[:12]

    bundle = UpdateBundle(
        id=bundle_id,
        created_at=utc_now_iso(),
        title=proposal.title,
        version_base=version_base,
        candidate_version=candidate_version_from_base(version_base),
        area=_area_from_proposal(root, proposal),
        source_proposal_id=proposal.id,
        source_cycle_id=cycle_id,
        source_eval_id=eval_id,
        patch_sha256=proposal.copied_patch_sha256,
        validation_mode=proposal.validation_mode,
        validation_summary=proposal.validation_summary,
        eval_summary=eval_summary,
        patch_targets=proposal.patch_targets,
        risk_summary=proposal.risks,
        status=BundleStatus.CANDIDATE.value,
        next_steps=_default_next_steps(proposal.id),
        safety_notes=_default_safety_notes(),
    )
    write_update_bundle(bundle, root)
    return UpdateBundleOutcome(
        bundle=bundle,
        message="\n".join(
            [
                "RealForge update bundle created (metadata only; nothing applied)",
                f"Bundle ID: {bundle.id}",
                f"Candidate version: {bundle.candidate_version}",
                f"Source proposal: {proposal.id}",
                f"Status: {bundle.status}",
                "",
                "Next manual steps:",
                *[f"  {step}" for step in bundle.next_steps],
            ]
        ),
        ok=True,
    )


def list_update_bundle_records(
    *,
    workspace_root: Path,
    config: RealForgeConfig,
) -> str:
    require_staff_enabled(config)
    return format_update_bundle_list(list_update_bundles(workspace_root))


def show_update_bundle_record(
    *,
    bundle_id: str,
    workspace_root: Path,
    config: RealForgeConfig,
) -> str:
    require_staff_enabled(config)
    try:
        bundle = load_update_bundle(workspace_root, bundle_id)
    except FileNotFoundError as err:
        raise UpdateBundleError(str(err)) from err
    return format_update_bundle(bundle)


def mark_update_bundle(
    *,
    bundle_id: str,
    status: str,
    workspace_root: Path,
    config: RealForgeConfig,
) -> UpdateBundleOutcome:
    require_staff_enabled(config)
    if status not in MARKABLE_BUNDLE_STATUSES:
        raise UpdateBundleError(
            f"status must be one of: {', '.join(sorted(MARKABLE_BUNDLE_STATUSES))}"
        )

    try:
        bundle = load_update_bundle(workspace_root, bundle_id)
    except FileNotFoundError as err:
        raise UpdateBundleError(str(err)) from err

    updated = replace(bundle, status=status)
    write_update_bundle(updated, workspace_root)
    return UpdateBundleOutcome(
        bundle=updated,
        message="\n".join(
            [
                "RealForge update bundle status updated (metadata only)",
                f"Bundle ID: {updated.id}",
                f"Status: {updated.status}",
                "No source files modified. No commit performed.",
            ]
        ),
        ok=True,
    )


def export_update_bundle(
    *,
    bundle_id: str,
    output: Path,
    workspace_root: Path,
    config: RealForgeConfig,
    include_patch: bool = False,
) -> UpdateBundleOutcome:
    require_staff_enabled(config)
    root = workspace_root.resolve()
    try:
        bundle = load_update_bundle(root, bundle_id)
    except FileNotFoundError as err:
        raise UpdateBundleError(str(err)) from err

    output = output.resolve()
    assert_path_in_workspace(output, root)
    payload = bundle_to_dict_export(bundle, root, include_patch=include_patch)
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return UpdateBundleOutcome(
        bundle=bundle,
        message="\n".join(
            [
                "RealForge update bundle exported (metadata only by default)",
                f"Bundle ID: {bundle.id}",
                f"Output: {output}",
                f"Include patch: {include_patch}",
            ]
        ),
        ok=True,
    )


def bundle_to_dict_export(
    bundle: UpdateBundle,
    workspace_root: Path,
    *,
    include_patch: bool = False,
) -> dict:
    from realforge.update_bundle_report import bundle_to_dict

    payload = bundle_to_dict(bundle)
    if include_patch:
        patch_path = stored_patch_path(workspace_root, bundle.source_proposal_id)
        if patch_path.is_file():
            payload["patch_diff"] = patch_path.read_text(encoding="utf-8")
    return payload
