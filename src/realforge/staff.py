from __future__ import annotations

from realforge.config import RealForgeConfig


class StaffError(Exception):
    pass


STAFF_DISABLED_MESSAGE = (
    "staff mode is disabled; set [staff].enabled = true in .realforge.toml to use this command"
)


def require_staff_enabled(config: RealForgeConfig) -> None:
    if not config.staff.enabled:
        raise StaffError(STAFF_DISABLED_MESSAGE)


def format_staff_status(config: RealForgeConfig) -> str:
    staff = config.staff
    improvement = config.improvement
    model = config.model

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
        "Safety gates:",
        f"  auto_apply: {improvement.auto_apply} (unsupported in v1.4; always refused)",
        f"  auto_commit: {improvement.auto_commit} (unsupported in v1.4; always refused)",
        "",
        "Provider config:",
        f"  provider: {model.provider}",
        f"  model: {model.model or '(default)'}",
        f"  base_url: {model.base_url or '(none)'}",
    ]
    if config.config_path:
        lines.append(f"  config: {config.config_path}")
    else:
        lines.append("  config: (no .realforge.toml; defaults only)")

    lines.extend(
        [
            "",
            "Notes:",
            "  - Staff mode is explicit and config-gated; it is never enabled silently.",
            "  - Normal commands (check, repair, plan, eval) work without staff mode.",
            "  - Provider output remains untrusted.",
            "  - RealForge does not claim to outperform frontier coding tools.",
        ]
    )
    return "\n".join(lines)
