import json
import os
import subprocess
import sys
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.config_file import ImprovementSettings, SchedulerSettings, StaffSettings
from realforge.settings_surface import (
    OUTPUT_DIRECTORIES,
    build_effective_settings,
    run_settings_doctor,
)

ROOT = Path(__file__).resolve().parents[1]


def _env(*, home: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    env["HOME"] = str(home)
    return env


def _write_gitignore(root: Path) -> None:
    (root / ".gitignore").write_text(".realforge/\n", encoding="utf-8")


def _config(
    root: Path,
    *,
    staff: bool = False,
    scheduler: SchedulerSettings | None = None,
    improvement: ImprovementSettings | None = None,
) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
        staff=StaffSettings(enabled=staff),
        scheduler=scheduler or SchedulerSettings(),
        improvement=improvement or ImprovementSettings(),
    )


def test_effective_settings_are_read_only_and_complete(tmp_path: Path):
    report = build_effective_settings(_config(tmp_path))
    assert report.provider == "mock"
    assert report.staff_enabled is False
    assert report.scheduler_enabled is False
    assert report.permission_mode == "readonly"
    assert report.output_directories == OUTPUT_DIRECTORIES
    assert report.safety_gates["provider_output_untrusted"] is True
    assert report.safety_gates["auto_apply_refused"] is True


def test_settings_doctor_passes_safe_defaults(tmp_path: Path):
    _write_gitignore(tmp_path)
    report = run_settings_doctor(_config(tmp_path))
    assert report.ok is True
    assert all(item.status == "PASS" for item in report.checks)


def test_settings_doctor_warns_but_does_not_fail_reviewed_staff_mode(tmp_path: Path):
    _write_gitignore(tmp_path)
    report = run_settings_doctor(_config(tmp_path, staff=True))
    assert report.ok is True
    assert any(item.name == "staff-default" and item.status == "WARN" for item in report.checks)


def test_settings_doctor_blocks_scheduler_without_staff(tmp_path: Path):
    _write_gitignore(tmp_path)
    report = run_settings_doctor(
        _config(tmp_path, scheduler=SchedulerSettings(enabled=True))
    )
    assert report.ok is False
    assert any(item.name == "scheduler-gate" and item.status == "BLOCKED" for item in report.checks)


def test_settings_doctor_blocks_auto_apply_or_commit(tmp_path: Path):
    _write_gitignore(tmp_path)
    report = run_settings_doctor(
        _config(tmp_path, improvement=ImprovementSettings(auto_apply=True))
    )
    assert report.ok is False
    assert any(item.name == "automatic-apply" and item.status == "BLOCKED" for item in report.checks)


def test_settings_doctor_blocks_missing_gitignore_entries(tmp_path: Path):
    (tmp_path / ".gitignore").write_text(".pytest_cache/\n", encoding="utf-8")
    report = run_settings_doctor(_config(tmp_path))
    assert report.ok is False
    check = next(item for item in report.checks if item.name == "artifact-gitignore")
    assert check.status == "BLOCKED"
    assert ".realforge/creative/" in check.detail


def test_settings_cli_json_reports_effective_values_without_writes(
    tmp_path: Path, isolated_home_env: Path
):
    _write_gitignore(tmp_path)
    source = tmp_path / "source.txt"
    source.write_text("unchanged\n", encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "settings", "--json"],
        capture_output=True,
        text=True,
        env=_env(home=isolated_home_env),
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["provider"] == "mock"
    assert payload["staff_enabled"] is False
    assert source.read_text(encoding="utf-8") == "unchanged\n"
    assert not (tmp_path / ".realforge").exists()


def test_settings_doctor_cli_supports_json_after_subcommand(
    tmp_path: Path, isolated_home_env: Path
):
    _write_gitignore(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "settings", "doctor", "--json"],
        capture_output=True,
        text=True,
        env=_env(home=isolated_home_env),
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["ok"] is True
    assert all(item["status"] == "PASS" for item in payload["checks"])


def test_settings_doctor_cli_returns_blocked_for_unsafe_config(
    tmp_path: Path, isolated_home_env: Path
):
    _write_gitignore(tmp_path)
    (tmp_path / ".realforge.toml").write_text(
        "[improvement]\nauto_apply = true\n",
        encoding="utf-8",
    )
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "settings", "doctor"],
        capture_output=True,
        text=True,
        env=_env(home=isolated_home_env),
        cwd=str(tmp_path),
    )
    assert proc.returncode == 1
    assert "[BLOCKED] automatic-apply" in proc.stdout
