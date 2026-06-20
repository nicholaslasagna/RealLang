from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.providers import normalize_provider_name


OUTPUT_DIRECTORIES = (
    ".realforge/proposals/",
    ".realforge/research/",
    ".realforge/cycles/",
    ".realforge/evals/",
    ".realforge/task_benchmarks/",
    ".realforge/patch_proposals/",
    ".realforge/scheduler_runs/",
    ".realforge/updates/",
    ".realforge/creative/",
    ".realforge/engines/",
    ".realforge/multimodal/",
)


@dataclass(frozen=True)
class EffectiveSettings:
    provider: str
    configured_model: str | None
    staff_enabled: bool
    scheduler_enabled: bool
    research_network_behavior: str
    workspace_root: str
    permission_mode: str
    safety_gates: dict[str, object]
    output_directories: tuple[str, ...]
    benchmark_gate: dict[str, object]


@dataclass(frozen=True)
class SettingsCheck:
    status: str
    name: str
    detail: str
    next_command: str | None = None


@dataclass(frozen=True)
class SettingsDoctorReport:
    ok: bool
    checks: tuple[SettingsCheck, ...]


def build_effective_settings(config: RealForgeConfig) -> EffectiveSettings:
    workspace = (config.workspace_root or Path.cwd()).resolve()
    return EffectiveSettings(
        provider=config.model.provider,
        configured_model=config.model.model,
        staff_enabled=config.staff.enabled,
        scheduler_enabled=config.scheduler.enabled,
        research_network_behavior=(
            "off by default; each fetch requires HTTPS plus an explicit --allow-domain"
        ),
        workspace_root=str(workspace),
        permission_mode=config.permission_mode.value,
        safety_gates={
            "provider_output_untrusted": True,
            "no_silent_writes": True,
            "auto_apply_refused": True,
            "auto_commit_refused": True,
            "human_approval_for_destructive_actions": True,
            "staff_controls_config_gated": True,
        },
        output_directories=OUTPUT_DIRECTORIES,
        benchmark_gate={
            "required_for_scheduler": config.scheduler.require_leaderboard_pass,
            "minimum_score": config.scheduler.minimum_benchmark_score,
            "scheduler_active": config.scheduler.enabled,
        },
    )


def effective_settings_to_dict(settings: EffectiveSettings) -> dict[str, object]:
    return asdict(settings)


def format_settings_json(settings: EffectiveSettings) -> str:
    return json.dumps(effective_settings_to_dict(settings), indent=2, sort_keys=True)


def format_settings(settings: EffectiveSettings) -> str:
    lines = [
        "REALFORGE SETTINGS",
        "Mode: READ ONLY",
        "",
        "Provider",
        f"  Provider: {settings.provider}",
        f"  Model: {settings.configured_model or '(mock/default or not configured)'}",
        "",
        "Workspace",
        f"  Root: {settings.workspace_root}",
        f"  Permission: {settings.permission_mode}",
        f"  Research network: {settings.research_network_behavior}",
        "",
        "Advanced controls",
        f"  Staff: {'ENABLED' if settings.staff_enabled else 'DISABLED'}",
        f"  Scheduler: {'ENABLED' if settings.scheduler_enabled else 'DISABLED'}",
        "  Auto-apply: BLOCKED",
        "  Auto-commit: BLOCKED",
        "",
        "Benchmark gate",
        f"  Required for scheduler: {settings.benchmark_gate['required_for_scheduler']}",
        f"  Minimum score: {settings.benchmark_gate['minimum_score']}",
        "",
        "Output directories (explicit writes only)",
    ]
    lines.extend(f"  {path}" for path in settings.output_directories)
    lines.extend(("", "Next: realforge settings doctor"))
    return "\n".join(lines)


def _check(
    status: str,
    name: str,
    detail: str,
    next_command: str | None = None,
) -> SettingsCheck:
    return SettingsCheck(status=status, name=name, detail=detail, next_command=next_command)


def _gitignored_outputs(workspace: Path) -> tuple[bool, tuple[str, ...]]:
    gitignore = workspace / ".gitignore"
    if not gitignore.is_file():
        return False, OUTPUT_DIRECTORIES
    lines = {
        line.strip()
        for line in gitignore.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    if ".realforge/" in lines:
        return True, ()
    missing = tuple(path for path in OUTPUT_DIRECTORIES if path not in lines)
    return not missing, missing


def run_settings_doctor(config: RealForgeConfig) -> SettingsDoctorReport:
    workspace = (config.workspace_root or Path.cwd()).resolve()
    checks: list[SettingsCheck] = []

    if workspace.is_dir():
        checks.append(_check("PASS", "workspace-boundary", f"workspace root exists: {workspace}"))
    else:
        checks.append(_check("BLOCKED", "workspace-boundary", f"workspace root is invalid: {workspace}"))

    if config.staff.enabled:
        checks.append(
            _check(
                "WARN",
                "staff-default",
                "staff mode is enabled; advanced controls are available",
                "realforge staff-status",
            )
        )
    else:
        checks.append(_check("PASS", "staff-default", "staff mode is disabled"))

    if config.scheduler.enabled and not config.staff.enabled:
        checks.append(
            _check(
                "BLOCKED",
                "scheduler-gate",
                "scheduler is enabled while staff mode is disabled",
                "disable [scheduler].enabled or explicitly enable reviewed staff mode",
            )
        )
    elif config.scheduler.enabled:
        checks.append(
            _check(
                "WARN",
                "scheduler-gate",
                "scheduler is explicitly enabled and remains staff-only",
                "realforge scheduler-status",
            )
        )
    else:
        checks.append(_check("PASS", "scheduler-gate", "scheduler is disabled"))

    unsafe_auto = (
        config.improvement.auto_apply
        or config.improvement.auto_commit
        or config.scheduler.auto_apply
        or config.scheduler.auto_commit
    )
    checks.append(
        _check(
            "BLOCKED" if unsafe_auto else "PASS",
            "automatic-apply",
            (
                "auto_apply or auto_commit is configured true; RealForge refuses this mode"
                if unsafe_auto
                else "auto_apply and auto_commit are disabled/refused"
            ),
        )
    )

    try:
        provider = normalize_provider_name(config.model.provider)
    except ValueError as err:
        checks.append(_check("BLOCKED", "model-provider", str(err)))
    else:
        if provider == "mock":
            checks.append(_check("PASS", "model-provider", "mock fallback is configured"))
        elif not config.model.model:
            checks.append(_check("BLOCKED", "model-provider", f"{provider} requires [model].model"))
        elif not config.model.base_url:
            checks.append(_check("BLOCKED", "model-provider", f"{provider} requires [model].base_url"))
        else:
            checks.append(_check("PASS", "model-provider", f"local provider configured: {provider}"))

    checks.append(
        _check(
            "PASS",
            "research-network",
            "research fetches require HTTPS and an explicit --allow-domain",
        )
    )

    ignored, missing = _gitignored_outputs(workspace)
    checks.append(
        _check(
            "PASS" if ignored else "BLOCKED",
            "artifact-gitignore",
            (
                "all .realforge output directories are gitignored"
                if ignored
                else "missing gitignore entries: " + ", ".join(missing)
            ),
        )
    )

    output_paths_valid = all(
        (workspace / path).resolve().is_relative_to(workspace) for path in OUTPUT_DIRECTORIES
    )
    checks.append(
        _check(
            "PASS" if output_paths_valid else "BLOCKED",
            "output-boundary",
            "all configured output directories resolve inside the workspace",
        )
    )

    if config.scheduler.enabled and not config.scheduler.require_leaderboard_pass:
        checks.append(
            _check(
                "WARN",
                "benchmark-gate",
                "scheduler benchmark gate is disabled",
                "set [scheduler].require_leaderboard_pass = true",
            )
        )
    else:
        checks.append(
            _check(
                "PASS",
                "benchmark-gate",
                "benchmark gate is configured or scheduler is inactive",
            )
        )

    return SettingsDoctorReport(
        ok=not any(check.status == "BLOCKED" for check in checks),
        checks=tuple(checks),
    )


def settings_doctor_to_dict(report: SettingsDoctorReport) -> dict[str, object]:
    return {"schema_version": "1.0", "ok": report.ok, "checks": [asdict(item) for item in report.checks]}


def format_settings_doctor_json(report: SettingsDoctorReport) -> str:
    return json.dumps(settings_doctor_to_dict(report), indent=2, sort_keys=True)


def format_settings_doctor(report: SettingsDoctorReport) -> str:
    lines = ["REALFORGE SETTINGS DOCTOR", f"Overall: {'PASS' if report.ok else 'BLOCKED'}", ""]
    for check in report.checks:
        lines.append(f"[{check.status}] {check.name}: {check.detail}")
        if check.next_command:
            lines.append(f"  Next: {check.next_command}")
    lines.extend(("", "This command is read-only and changes no settings or files."))
    return "\n".join(lines)
