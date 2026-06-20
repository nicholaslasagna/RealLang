import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.agent_loop import run_agent, AgentMode
from realforge.config import RealForgeConfig
from realforge.permissions import PermissionMode, Permissions
from realforge.planner import parse_plan_response
from realforge.providers.base import PlanRequest
from realforge.errors import ProviderPlanError
from realforge.providers.mock import MockProvider

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _workspace(tmp_path: Path) -> Path:
    (tmp_path / "examples").mkdir()
    (tmp_path / "examples" / "hello.real").write_text(
        "module main;\nfn main() -> i32 { return 0; }\n",
        encoding="utf-8",
    )
    (tmp_path / "README.md").write_text("# Temp RealLang workspace\n", encoding="utf-8")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "project-status.md").write_text("# Status\n", encoding="utf-8")
    return tmp_path


def test_mock_provider_receives_context_when_requested(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    perms = Permissions(mode=PermissionMode.READONLY, workspace_root=root)
    run_agent(
        task="explain hello.real",
        provider=provider,
        config=cfg,
        permissions=perms,
        include_context=True,
        max_context_chars=4000,
    )
    assert provider.last_plan_request is not None
    assert provider.last_plan_request.context is not None
    assert "README.md" in provider.last_plan_request.context
    assert "docs/project-status.md" in provider.last_plan_request.context


def test_plan_output_includes_structured_fields(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_agent(
        task="explain hello.real",
        provider=provider,
        config=cfg,
        permissions=Permissions(mode=PermissionMode.READONLY, workspace_root=root),
        include_context=True,
        max_context_chars=4000,
    )
    assert outcome.plan is not None
    assert outcome.plan.files_to_inspect
    assert outcome.plan.commands_to_run
    assert outcome.plan.risks
    assert "Files to inspect:" in outcome.message
    assert "Requires write permission:" in outcome.message


def test_invalid_provider_json_raises_provider_plan_error():
    with pytest.raises(ProviderPlanError):
        parse_plan_response("task", "not json at all", provider="test")


def test_readonly_planning_never_writes_files(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "examples" / "hello.real"
    original = target.read_text(encoding="utf-8")
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "plan",
            "--provider",
            "mock",
            "--task",
            "modify hello.real aggressively",
            "--include-context",
            "--max-context-chars",
            "2000",
            "--permission",
            "readonly",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert target.read_text(encoding="utf-8") == original
    assert not (root / ".realforge" / "index.json").exists()


def test_files_to_modify_in_plan_does_not_cause_edits(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_agent(
        task="modify hello.real please",
        provider=provider,
        config=cfg,
        permissions=Permissions(mode=PermissionMode.READONLY, workspace_root=root),
        include_context=False,
    )
    assert outcome.plan is not None
    assert outcome.plan.files_to_modify == ("examples/hello.real",)
    assert (root / "examples" / "hello.real").read_text(encoding="utf-8") == (
        "module main;\nfn main() -> i32 { return 0; }\n"
    )


def test_max_context_chars_is_respected(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    run_agent(
        task="explain hello.real",
        provider=provider,
        config=cfg,
        permissions=Permissions(mode=PermissionMode.READONLY, workspace_root=root),
        include_context=True,
        max_context_chars=300,
    )
    assert provider.last_plan_request is not None
    assert provider.last_plan_request.context is not None
    assert len(provider.last_plan_request.context) <= 300


def test_plan_cli_with_include_context(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "plan",
            "--provider",
            "mock",
            "--task",
            "explain hello.real",
            "--include-context",
            "--max-context-chars",
            "4000",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "Context: included" in proc.stdout
    assert "README.md" in proc.stdout or "Files to inspect:" in proc.stdout


def test_ask_cli_with_include_context(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "ask",
            "--provider",
            "mock",
            "--task",
            "summarize project",
            "--include-context",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "RealForge answer" in proc.stdout
