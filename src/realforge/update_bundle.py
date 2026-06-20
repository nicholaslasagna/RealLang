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
    validate_bundle_status_transition,
    write_update_bundle,
)
from realforge.update_channel import normalized_eval_score
from realforge.workspace import assert_path_in_workspace

EXPORT_KIND = "realforge_update_bundle_metadata"
EXPORT_VERSION = "1.6"


class UpdateBundleError(Exception):
    pass


@dataclass(frozen=True)
class UpdateBundleOutcome:
    bundle: UpdateBundle | None
    message: str
    ok: bool


@dataclass(frozen=True)
class VerifyCheck:
    name: str
    passed: bool
    detail: str


def candidate_version_from_base(
    version_base: str,
    *,
    bundle_id: str,
    created_at: str,
) -> str:
    parts = version_base.split(".")
    prefix = f"{parts[0]}.{parts[1]}-candidate" if len(parts) >= 2 else f"{version_base}-candidate"
    date_token = created_at[:10].replace("-", "") if created_at else "unknown"
    return f"{prefix}.{date_token}-{bundle_id[:8]}"


def _default_safety_notes() -> tuple[str, ...]:
    return (
        "Update bundles are metadata only; they do not apply patches or commit changes.",
        "Update bundles are not a security boundary by themselves.",
        "The trusted apply path remains proposal hash verification plus apply-proposal validation.",
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


def _ensure_unique_bundle_identity(
    workspace_root: Path,
    *,
    bundle_id: str,
    candidate_version: str,
) -> None:
    if update_bundle_path(workspace_root, bundle_id).exists():
        raise UpdateBundleError(f"bundle id collision: {bundle_id}")
    for existing in list_update_bundles(workspace_root):
        if existing.candidate_version == candidate_version:
            raise UpdateBundleError(f"candidate version collision: {candidate_version}")


def _bundle_export_metadata(bundle: UpdateBundle) -> dict:
    return {
        "id": bundle.id,
        "created_at": bundle.created_at,
        "title": bundle.title,
        "version_base": bundle.version_base,
        "candidate_version": bundle.candidate_version,
        "area": bundle.area,
        "source_proposal_id": bundle.source_proposal_id,
        "source_cycle_id": bundle.source_cycle_id,
        "source_eval_id": bundle.source_eval_id,
        "validation_mode": bundle.validation_mode,
        "validation_summary": bundle.validation_summary,
        "eval_summary": bundle.eval_summary,
        "patch_targets": list(bundle.patch_targets),
        "risk_summary": list(bundle.risk_summary),
        "status": bundle.status,
        "next_steps": list(bundle.next_steps),
    }


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
    created_at = utc_now_iso()
    candidate_version = candidate_version_from_base(
        version_base,
        bundle_id=bundle_id,
        created_at=created_at,
    )
    _ensure_unique_bundle_identity(
        root,
        bundle_id=bundle_id,
        candidate_version=candidate_version,
    )

    bundle = UpdateBundle(
        id=bundle_id,
        created_at=created_at,
        title=proposal.title,
        version_base=version_base,
        candidate_version=candidate_version,
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
    try:
        write_update_bundle(bundle, root)
    except FileExistsError as err:
        raise UpdateBundleError(str(err)) from err
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
                "",
                "Run `realforge update-bundle verify {0}` before review.".format(bundle.id),
            ]
        ),
        ok=True,
    )


def verify_update_bundle(
    *,
    bundle_id: str,
    workspace_root: Path,
    config: RealForgeConfig,
) -> UpdateBundleOutcome:
    require_staff_enabled(config)
    root = workspace_root.resolve()
    checks: list[VerifyCheck] = []

    try:
        bundle = load_update_bundle(root, bundle_id)
        checks.append(VerifyCheck("bundle_exists", True, f"loaded bundle {bundle_id}"))
    except FileNotFoundError as err:
        checks.append(VerifyCheck("bundle_exists", False, str(err)))
        return _format_verify_outcome(None, checks)

    proposal = None
    proposal_error: str | None = None
    try:
        proposal = show_proposal(root, bundle.source_proposal_id)
        checks.append(
            VerifyCheck(
                "source_proposal_exists",
                True,
                f"proposal {bundle.source_proposal_id} found",
            )
        )
    except ProposalError as err:
        proposal_error = str(err)
        checks.append(VerifyCheck("source_proposal_exists", False, proposal_error))

    if proposal is not None:
        inactive_bundle = bundle.status in {
            BundleStatus.REJECTED.value,
            BundleStatus.SUPERSEDED.value,
        }
        if inactive_bundle or proposal.status == ProposalStatus.PENDING.value:
            checks.append(
                VerifyCheck(
                    "proposal_status",
                    True,
                    f"proposal status {proposal.status} acceptable for bundle status {bundle.status}",
                )
            )
        else:
            checks.append(
                VerifyCheck(
                    "proposal_status",
                    False,
                    (
                        f"proposal status {proposal.status} is not pending while bundle "
                        f"status is {bundle.status}"
                    ),
                )
            )

        patch_path = stored_patch_path(root, proposal.id)
        if patch_path.is_file():
            checks.append(
                VerifyCheck(
                    "stored_patch_exists",
                    True,
                    f"stored patch found at {proposal.patch_file}",
                )
            )
            try:
                verify_patch_sha256(patch_path, bundle.patch_sha256)
                checks.append(
                    VerifyCheck(
                        "bundle_patch_hash",
                        True,
                        "stored patch matches bundle.patch_sha256",
                    )
                )
            except PatchSafetyError as err:
                checks.append(
                    VerifyCheck(
                        "bundle_patch_hash",
                        False,
                        f"stored patch does not match bundle.patch_sha256: {err}",
                    )
                )
            try:
                verify_patch_sha256(patch_path, proposal.copied_patch_sha256)
                checks.append(
                    VerifyCheck(
                        "proposal_patch_hash",
                        True,
                        "stored patch matches proposal.copied_patch_sha256",
                    )
                )
            except PatchSafetyError as err:
                checks.append(
                    VerifyCheck(
                        "proposal_patch_hash",
                        False,
                        f"stored patch does not match proposal.copied_patch_sha256: {err}",
                    )
                )
        else:
            checks.append(
                VerifyCheck(
                    "stored_patch_exists",
                    False,
                    f"stored patch not found for proposal {proposal.id}",
                )
            )

        if bundle.patch_targets == proposal.patch_targets:
            checks.append(
                VerifyCheck(
                    "patch_targets_match",
                    True,
                    "bundle patch_targets match proposal patch_targets",
                )
            )
        else:
            checks.append(
                VerifyCheck(
                    "patch_targets_match",
                    False,
                    "bundle patch_targets differ from proposal patch_targets",
                )
            )

        if bundle.validation_mode == proposal.validation_mode:
            checks.append(
                VerifyCheck(
                    "validation_mode_match",
                    True,
                    f"validation_mode={bundle.validation_mode}",
                )
            )
        else:
            checks.append(
                VerifyCheck(
                    "validation_mode_match",
                    False,
                    (
                        f"bundle validation_mode {bundle.validation_mode} != "
                        f"proposal validation_mode {proposal.validation_mode}"
                    ),
                )
            )

    return _format_verify_outcome(bundle, checks)


def _format_verify_outcome(bundle: UpdateBundle | None, checks: list[VerifyCheck]) -> UpdateBundleOutcome:
    ok = all(check.passed for check in checks)
    lines = [
        "RealForge update bundle verify (read-only; does not modify files)",
        f"Result: {'PASS' if ok else 'FAIL'}",
    ]
    if bundle is not None:
        lines.append(f"Bundle ID: {bundle.id}")
        lines.append(f"Candidate version: {bundle.candidate_version}")
    lines.append("Checks:")
    for check in checks:
        status = "PASS" if check.passed else "FAIL"
        lines.append(f"  [{status}] {check.name}: {check.detail}")
    if ok:
        lines.append("Bundle metadata matches source proposal integrity checks.")
    else:
        lines.append("Resolve failures before treating this bundle as review-ready.")
    return UpdateBundleOutcome(bundle=bundle, message="\n".join(lines), ok=ok)


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
    force: bool = False,
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

    try:
        validate_bundle_status_transition(bundle.status, status, force=force)
    except ValueError as err:
        raise UpdateBundleError(str(err)) from err

    updated = replace(bundle, status=status)
    write_update_bundle(updated, workspace_root, overwrite=True)
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
                "RealForge update bundle exported",
                f"Bundle ID: {bundle.id}",
                f"Output: {output.name}",
                f"Metadata only: {not include_patch}",
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
    payload: dict = {
        "export_kind": EXPORT_KIND,
        "export_version": EXPORT_VERSION,
        "metadata_only": not include_patch,
        "patch_sha256": bundle.patch_sha256,
        "bundle": _bundle_export_metadata(bundle),
        "safety_notes": [
            "Update bundles are metadata only and not a security boundary by themselves.",
            "The trusted apply path remains proposal hash verification plus apply-proposal validation.",
            "Exported metadata omits absolute local filesystem paths.",
        ],
    }
    if include_patch:
        patch_path = stored_patch_path(workspace_root, bundle.source_proposal_id)
        patch_diff = patch_path.read_text(encoding="utf-8") if patch_path.is_file() else ""
        payload["untrusted_patch"] = {
            "label": "UNTRUSTED external patch content; review before apply",
            "patch_sha256": bundle.patch_sha256,
            "patch_diff": patch_diff,
        }
    return payload
