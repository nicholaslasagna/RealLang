import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.experiment import run_experiment_dry_run, run_experiment_patch
from realforge.git_utils import MARKER_FILE, is_known_experiment_root
from realforge.providers.mock import MockProvider
from realforge.runner import run_command

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _git_env():
    env = _env()
    env["GIT_AUTHOR_NAME"] = "RealForge Test"
    env["GIT_AUTHOR_EMAIL"] = "test@example.com"
    env["GIT_COMMITTER_NAME"] = "RealForge Test"
    env["GIT_COMMITTER_EMAIL"] = "test@example.com"
    return env


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    (root / "examples").mkdir()
    (root / "examples" / "hello.real").write_text(
        "module main;\nfn main() -> i32 { return 0; }\n",
        encoding="utf-8",
    )
    (root / "README.md").write_text("# Temp RealLang workspace\n", encoding="utf-8")
    (root / "docs").mkdir()
    (root / "docs" / "project-status.md").write_text("# Status\n", encoding="utf-8")
    (root / "tests").mkdir()
    (root / "tests" / "test_example.py").write_text(
        "def test_ok():\n    assert True\n",
        encoding="utf-8",
    )
    return root


def _experiments_root(tmp_path: Path) -> Path:
    return tmp_path / "experiments"


def _init_git(root: Path) -> None:
    subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
    subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True, env=_git_env())
    subprocess.run(
        ["git", "commit", "-m", "init"],
        cwd=root,
        check=True,
        capture_output=True,
        env=_git_env(),
    )


def _write_patch(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def _harmless_patch() -> str:
    return "\n".join(
        [
            "--- a/tests/test_example.py",
            "+++ b/tests/test_example.py",
            "@@ -1,2 +1,3 @@",
            "+# harmless experiment patch",
            " def test_ok():",
            "     assert True",
            "",
        ]
    )


def _breaking_patch() -> str:
    return "\n".join(
        [
            "--- a/tests/test_example.py",
            "+++ b/tests/test_example.py",
            "@@ -1,2 +1,2 @@",
            " def test_ok():",
            "-    assert True",
            "+    assert False",
            "",
        ]
    )


def _invalid_patch() -> str:
    return "\n".join(
        [
            "--- a/tests/test_example.py",
            "+++ b/tests/test_example.py",
            "@@ -99,1 +99,2 @@",
            "+this hunk cannot apply",
            "",
        ]
    )


def test_experiment_dry_run_does_not_create_workspace(tmp_path: Path):
    root = _workspace(tmp_path)
    temp_root = _experiments_root(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_experiment_dry_run(
        area="tests",
        provider=MockProvider(),
        workspace_root=cfg.workspace_root,
    )
    assert "experiment dry-run" in outcome.message
    assert outcome.plan.area == "tests"
    assert outcome.validation_commands
    assert not temp_root.exists()


def test_experiment_dry_run_cli(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "experiment",
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
    assert "plan generated" in proc.stdout.lower()
    assert "no validation executed" in proc.stdout.lower()


def test_patch_experiment_applies_in_copy_workspace_only(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "harmless.diff", _harmless_patch())
    target = root / "tests" / "test_example.py"
    original = target.read_text(encoding="utf-8")
    temp_root = _experiments_root(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=temp_root,
    )

    assert report.workspace_mode == "copy"
    assert report.passed is True
    assert report.main_workspace_modified is False
    assert target.read_text(encoding="utf-8") == original
    assert report.cleanup_status == "removed"
    assert report.experiment_path is not None
    assert not Path(report.experiment_path).exists()


def test_patch_experiment_uses_git_worktree_when_available(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "harmless.diff", _harmless_patch())
    temp_root = _experiments_root(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=temp_root,
    )

    assert report.workspace_mode == "git_worktree"
    assert report.main_workspace_modified is False


def test_failed_patch_reports_safely(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "bad.diff", _invalid_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    assert report.passed is False
    assert any("patch apply failed" in failure for failure in report.failures)
    assert report.main_workspace_modified is False


def test_validation_failure_is_reported(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "break.diff", _breaking_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    assert report.passed is False
    assert report.command_results
    assert any(not result.passed for result in report.command_results)


def test_validation_success_is_reported(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    assert report.passed is True
    assert all(result.passed for result in report.command_results)


def test_keep_preserves_experiment_workspace(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    temp_root = _experiments_root(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=temp_root,
        keep=True,
    )

    assert report.kept is True
    assert report.cleanup_status == "kept (--keep)"
    assert report.experiment_path is not None
    experiment_root = Path(report.experiment_path).parent
    assert experiment_root.exists()
    assert is_known_experiment_root(experiment_root)
    assert (experiment_root / MARKER_FILE).is_file()


def test_report_json_can_be_written(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    output = tmp_path / "report.json"
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
        output_json=output,
    )

    assert output.is_file()
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["id"] == report.id
    assert payload["area"] == "tests"
    assert payload["main_workspace_modified"] is False


def test_commands_use_runner_abstraction(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    seen: list[tuple[str, ...]] = []

    def tracking_runner(cmd, *, config=None, permissions=None, cwd=None):
        seen.append(cmd)
        return run_command(cmd, config=config, permissions=permissions, cwd=cwd)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
        command_runner=tracking_runner,
    )

    assert report.passed is True
    assert seen
    assert any("pytest" in part or "-m" in cmd for cmd in seen for part in cmd)


def test_main_workspace_file_unchanged_after_experiment(tmp_path: Path):
    root = _workspace(tmp_path)
    marker = root / "README.md"
    before = marker.read_text(encoding="utf-8")
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    assert marker.read_text(encoding="utf-8") == before
    assert report.main_workspace_modified is False
