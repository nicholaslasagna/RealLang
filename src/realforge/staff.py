from __future__ import annotations

from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.eval_report import list_eval_reports
from realforge.proposal_report import ProposalStatus
from realforge.proposals import list_proposals
from realforge.update_bundle_report import BundleStatus, list_update_bundles


class StaffError(Exception):
    pass


STAFF_DISABLED_MESSAGE = (
    "staff mode is disabled; set [staff].enabled = true in .realforge.toml to use this command"
)


def require_staff_enabled(config: RealForgeConfig) -> None:
    if not config.staff.enabled:
        raise StaffError(STAFF_DISABLED_MESSAGE)


def _workspace_root(config: RealForgeConfig) -> Path:
    return (config.workspace_root or Path.cwd()).resolve()


def _staff_model_label(config: RealForgeConfig) -> str:
    if config.model_identity_redacted:
        return "<configured locally>" if config.model.model else "(default)"
    return config.model.model or "(default)"


def _staff_base_url_label(config: RealForgeConfig) -> str:
    if config.model_identity_redacted and config.private_provider_status:
        host = config.private_provider_status.endpoint_host
        if host and config.private_provider_status.endpoint_scheme:
            return f"{config.private_provider_status.endpoint_scheme}://{host}"
        return "(local endpoint configured)"
    return config.model.base_url or "(none)"


def _staff_counts(workspace_root: Path) -> tuple[int, int, int]:
    pending_proposals = sum(
        1 for proposal in list_proposals(workspace_root) if proposal.status == ProposalStatus.PENDING.value
    )
    candidate_bundles = sum(
        1 for bundle in list_update_bundles(workspace_root) if bundle.status == BundleStatus.CANDIDATE.value
    )
    approved_bundles = sum(
        1 for bundle in list_update_bundles(workspace_root) if bundle.status == BundleStatus.APPROVED.value
    )
    return pending_proposals, candidate_bundles, approved_bundles


def _latest_eval_line(workspace_root: Path) -> str:
    from realforge.update_channel import normalized_eval_score

    reports = list_eval_reports(workspace_root)
    if not reports:
        return "Latest eval: (none saved in .realforge/evals/)"
    latest = max(reports, key=lambda report: report.started_at)
    normalized = normalized_eval_score(latest)
    return (
        f"Latest eval: id={latest.id} suite={latest.suite} passed={latest.passed} "
        f"normalized_score={normalized:.2f}"
    )


def format_staff_status(config: RealForgeConfig) -> str:
    staff = config.staff
    improvement = config.improvement
    model = config.model
    workspace_root = _workspace_root(config)
    pending_proposals, candidate_bundles, approved_bundles = _staff_counts(workspace_root)

    auto_apply_status = (
        "configured true; unsupported/refused in RealForge 1.6"
        if improvement.auto_apply
        else "false; unsupported/refused in RealForge 1.6"
    )
    auto_commit_status = (
        "configured true; unsupported/refused in RealForge 1.6"
        if improvement.auto_commit
        else "false; unsupported/refused in RealForge 1.6"
    )

    lines = [
        "RealForge staff status (advanced; disabled by default)",
        f"Staff mode enabled: {staff.enabled}",
        "",
        "Improvement channel:",
        f"  channel: {improvement.channel}",
        f"  max_budget: {improvement.max_budget}",
        f"  require_eval_pass: {improvement.require_eval_pass}",
        f"  minimum_eval_score: {improvement.minimum_eval_score:.2f}",
        f"  allow_research: {improvement.allow_research}",
        f"  allow_patch_proposals: {improvement.allow_patch_proposals}",
        "",
        "Staff update flow:",
        f"  pending proposals: {pending_proposals}",
        f"  candidate bundles: {candidate_bundles}",
        f"  approved bundles: {approved_bundles}",
        _latest_eval_line(workspace_root),
        "",
        "Safety gates:",
        f"  auto_apply: {auto_apply_status}",
        f"  auto_commit: {auto_commit_status}",
        "",
        "Provider config:",
        f"  provider: {model.provider}",
        f"  model: {_staff_model_label(config)}",
        f"  base_url: {_staff_base_url_label(config)}",
    ]
    if config.config_path:
        lines.append(f"  config: {config.config_path.name} (local workspace config)")
    else:
        lines.append("  config: (no .realforge.toml; defaults only)")

    lines.extend(
        [
            "",
            "Notes:",
            "  - Staff mode is explicit and config-gated; it is never enabled silently.",
            "  - Normal commands (check, repair, plan, eval) work without staff mode.",
            "  - Update bundles are metadata only and not a security boundary by themselves.",
            "  - Provider output remains untrusted.",
            "  - RealForge does not claim to outperform frontier coding tools.",
        ]
    )
    return "\n".join(lines)
