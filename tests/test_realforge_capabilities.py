import json
import os
import subprocess
import sys
from pathlib import Path

from realforge.capabilities import CAPABILITY_STATUSES, build_capability_registry
from realforge.config import RealForgeConfig
from realforge.config_file import SchedulerSettings, StaffSettings
from realforge.interaction import build_slash_registry

ROOT = Path(__file__).resolve().parents[1]


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _config(
    root: Path,
    *,
    staff_enabled: bool = False,
    scheduler_enabled: bool = False,
) -> RealForgeConfig:
    return RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=root,
        staff=StaffSettings(enabled=staff_enabled),
        scheduler=SchedulerSettings(enabled=scheduler_enabled),
    )


def test_capability_registry_contains_general_platform_domains(tmp_path: Path):
    registry = build_capability_registry(_config(tmp_path))
    domains = tuple(capability.domain for capability in registry.capabilities)
    assert domains == (
        "code",
        "docs",
        "research",
        "creative",
        "image",
        "vision",
        "engine",
        "assets",
        "eval",
        "self-improvement",
        "scheduler",
    )
    assert registry.platform == "local-first AI engineering environment"
    assert all(item.status in CAPABILITY_STATUSES for item in registry.capabilities)
    assert all(item.description and item.safety_level for item in registry.capabilities)
    assert all(item.next_suggested_command for item in registry.capabilities)


def test_capabilities_include_required_safety_metadata(tmp_path: Path):
    registry = build_capability_registry(_config(tmp_path))
    research = next(item for item in registry.capabilities if item.domain == "research")
    scheduler = next(item for item in registry.capabilities if item.domain == "scheduler")
    assert research.requires_network is True
    assert research.requires_staff is False
    assert scheduler.requires_staff is True
    assert scheduler.status == "staff-only"
    assert scheduler.commands == ()


def test_staff_capability_commands_are_exposed_only_when_staff_enabled(tmp_path: Path):
    disabled = build_capability_registry(_config(tmp_path, staff_enabled=False))
    enabled = build_capability_registry(_config(tmp_path, staff_enabled=True))
    disabled_scheduler = next(item for item in disabled.capabilities if item.domain == "scheduler")
    enabled_scheduler = next(item for item in enabled.capabilities if item.domain == "scheduler")
    assert disabled_scheduler.commands == ()
    assert enabled_scheduler.commands == ("realforge scheduler-status",)

    runnable = build_capability_registry(
        _config(tmp_path, staff_enabled=True, scheduler_enabled=True)
    )
    runnable_scheduler = next(item for item in runnable.capabilities if item.domain == "scheduler")
    assert "realforge scheduler-run --dry-run" in runnable_scheduler.commands


def test_slash_registry_defines_safe_grammar_without_interactive_shell():
    registry = build_slash_registry(staff_mode_enabled=False)
    shortcuts = {item.shortcut for item in registry.commands}
    assert registry.interactive_shell_implemented is False
    assert {"/plan", "/ask", "/check", "/repair", "/creative", "/engine", "/help"} <= shortcuts
    assert "/scheduler" not in shortcuts
    assert "/update" not in shortcuts
    repair = next(item for item in registry.commands if item.shortcut == "/repair")
    assert "--dry-run" in repair.maps_to


def test_staff_slash_commands_require_enabled_staff_mode():
    registry = build_slash_registry(staff_mode_enabled=True)
    staff_commands = {item.shortcut: item for item in registry.commands if item.requires_staff}
    assert set(staff_commands) == {"/scheduler", "/update"}
    assert all(item.safety_label == "STAFF ONLY" for item in staff_commands.values())


def test_capabilities_cli_json_is_machine_readable_and_read_only(tmp_path: Path):
    source = tmp_path / "source.txt"
    source.write_text("unchanged\n", encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "capabilities", "--json"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["platform"] == "local-first AI engineering environment"
    assert len(payload["capabilities"]) == 11
    assert source.read_text(encoding="utf-8") == "unchanged\n"
    assert not (tmp_path / ".realforge").exists()


def test_slash_cli_hides_staff_shortcuts_by_default(tmp_path: Path):
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "slash", "--json"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    shortcuts = {item["shortcut"] for item in payload["commands"]}
    assert payload["staff_shortcuts_hidden"] is True
    assert "/scheduler" not in shortcuts


def test_slash_cli_includes_staff_shortcuts_when_explicitly_enabled(tmp_path: Path):
    (tmp_path / ".realforge.toml").write_text("[staff]\nenabled = true\n", encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "slash", "--json"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    shortcuts = {item["shortcut"] for item in payload["commands"]}
    assert payload["staff_shortcuts_hidden"] is False
    assert {"/scheduler", "/update"} <= shortcuts
