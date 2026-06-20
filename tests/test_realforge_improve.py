import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.errors import ProviderPlanError
from realforge.providers.base import ImproveRequest
from realforge.providers.mock import MockProvider
from realforge.self_improve import run_improve
from realforge.self_improvement_plan import parse_improvement_plan

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
    (tmp_path / "docs" / "realforge.md").write_text("# RealForge\n", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_example.py").write_text("def test_ok():\n    assert True\n", encoding="utf-8")
    return tmp_path


class InvalidImproveProvider(MockProvider):
    def generate_improvement_plan(self, request: ImproveRequest):
        raise ProviderPlanError("invalid", "invalid JSON improvement plan", raw="not json")


def test_improve_dry_run_produces_structured_plan(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_improve(
        area="realforge",
        provider=provider,
        workspace_root=cfg.workspace_root,
        propose_patch=False,
    )
    assert outcome.plan.title
    assert outcome.plan.area == "realforge"
    assert outcome.plan.validation_commands
    assert outcome.plan.rollback_plan
    assert "Validation commands:" in outcome.message
    assert "Rollback plan:" in outcome.message
    assert provider.last_improve_request is not None
    assert "Improvement Area Focus" in provider.last_improve_request.context


def test_area_filtering_changes_plan_area(tmp_path: Path):
    root = _workspace(tmp_path)
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    tests_outcome = run_improve(area="tests", provider=provider, workspace_root=cfg.workspace_root)
    safety_outcome = run_improve(area="safety", provider=provider, workspace_root=cfg.workspace_root)
    assert tests_outcome.plan.area == "tests"
    assert safety_outcome.plan.area == "safety"
    assert tests_outcome.plan.title != safety_outcome.plan.title


def test_invalid_provider_json_stops_safely(tmp_path: Path):
    root = _workspace(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    with pytest.raises(ProviderPlanError):
        run_improve(area="tests", provider=InvalidImproveProvider(), workspace_root=cfg.workspace_root)
    with pytest.raises(ProviderPlanError):
        parse_improvement_plan("not json", provider="test", area="tests")


def test_propose_patch_prints_patch_without_modifying_files(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "tests" / "test_example.py"
    original = target.read_text(encoding="utf-8")
    provider = MockProvider()
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_improve(
        area="realforge",
        provider=provider,
        workspace_root=cfg.workspace_root,
        propose_patch=True,
    )
    assert outcome.proposed_patch is not None
    assert "UNTRUSTED MODEL PATCH PROPOSAL" in outcome.message
    assert "--- proposed patch ---" in outcome.message
    assert target.read_text(encoding="utf-8") == original


def test_improve_does_not_write_files(tmp_path: Path):
    root = _workspace(tmp_path)
    before = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "improve",
            "--dry-run",
            "--provider",
            "mock",
            "--area",
            "tests",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    after = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}
    assert before == after
    assert not (root / ".realforge" / "index.json").exists()


def test_improve_cli_with_propose_patch(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "improve",
            "--dry-run",
            "--provider",
            "mock",
            "--area",
            "realforge",
            "--propose-patch",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "RealForge self-improvement proposal" in proc.stdout
    assert "UNTRUSTED MODEL PATCH PROPOSAL" in proc.stdout


def test_improve_requires_dry_run_flag(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "improve",
            "--provider",
            "mock",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 1
    assert "requires --dry-run" in proc.stderr
