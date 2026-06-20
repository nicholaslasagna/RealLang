import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import load_config
from realforge.eval_report import eval_report_path
from realforge.eval_runner import run_eval
from realforge.providers.mock import MockProvider
from realforge.staff import StaffError, format_staff_status, require_staff_enabled
from realforge.update_channel import (
    UpdateChannelError,
    run_improve_channel_dry_run,
    run_improve_channel_patch,
    run_update_check,
)
from realforge.update_history import build_update_history, list_update_history

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
    (root / "tests").mkdir()
    (root / "tests" / "test_example.py").write_text(
        "def test_ok():\n    assert True\n",
        encoding="utf-8",
    )
    (root / "examples").mkdir()
    (root / "examples" / "hello.real").write_text(
        "module main;\nfn main() -> i32 { return 0; }\n",
        encoding="utf-8",
    )
    return root


def _write_staff_config(root: Path, *, enabled: bool = True, **overrides) -> None:
    defaults = {
        "channel": "stable",
        "max_budget": 1,
        "require_eval_pass": True,
        "minimum_eval_score": 0.75,
        "allow_research": False,
        "allow_patch_proposals": True,
        "auto_apply": False,
        "auto_commit": False,
    }
    defaults.update(overrides)
    lines = ["[staff]", f"enabled = {str(enabled).lower()}", "", "[improvement]"]
    for key, value in defaults.items():
        if isinstance(value, bool):
            lines.append(f"{key} = {str(value).lower()}")
        elif isinstance(value, str):
            lines.append(f'{key} = "{value}"')
        else:
            lines.append(f"{key} = {value}")
    lines.extend(["", "[model]", "provider = \"mock\"", "model = \"mock\""])
    (root / ".realforge.toml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _config(root: Path):
    return load_config(root)


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


def _harmless_patch() -> str:
    return "\n".join(
        [
            "--- a/tests/test_example.py",
            "+++ b/tests/test_example.py",
            "@@ -1,2 +1,3 @@",
            "+# harmless staff patch",
            " def test_ok():",
            "     assert True",
            "",
        ]
    )


def _experiments_root(tmp_path: Path) -> Path:
    return tmp_path / "experiments"


def test_staff_commands_refuse_when_disabled(tmp_path: Path):
    root = _workspace(tmp_path)
    cfg = _config(root)
    with pytest.raises(StaffError):
        require_staff_enabled(cfg)
    with pytest.raises(StaffError):
        run_update_check(workspace_root=root, config=cfg)
    with pytest.raises(StaffError):
        run_improve_channel_dry_run(
            area="tests",
            workspace_root=root,
            config=cfg,
            provider=MockProvider(cfg),
        )


def test_staff_status_disabled_and_enabled(tmp_path: Path):
    root = _workspace(tmp_path)
    disabled = format_staff_status(_config(root))
    assert "Staff mode enabled: False" in disabled
    assert "auto_apply: False (unsupported in v1.4; always refused)" in disabled

    _write_staff_config(root, enabled=True, max_budget=2)
    enabled = format_staff_status(_config(root))
    assert "Staff mode enabled: True" in enabled
    assert "max_budget: 2" in enabled


def test_update_check_is_read_only(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    target = root / "tests" / "test_example.py"
    before = target.read_text(encoding="utf-8")

    outcome = run_update_check(workspace_root=root, config=cfg)
    assert outcome.ok is True
    assert "Candidate improvement areas:" in outcome.message
    assert "safety" in outcome.message
    assert "No files edited" in outcome.message
    assert target.read_text(encoding="utf-8") == before


def test_improve_channel_dry_run_does_not_write_source_files(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    before_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}

    outcome = run_improve_channel_dry_run(
        area="tests",
        workspace_root=root,
        config=cfg,
        provider=MockProvider(cfg),
    )
    assert outcome.ok is True
    assert "Dry-run only" in outcome.message

    after_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}
    for path, mtime in before_mtimes.items():
        if ".realforge" in path.as_posix():
            continue
        assert after_mtimes.get(path) == mtime


def test_improve_channel_enforces_max_budget(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root, max_budget=1)
    cfg = _config(root)
    with pytest.raises(UpdateChannelError, match="max_budget"):
        run_improve_channel_dry_run(
            area="tests",
            workspace_root=root,
            config=cfg,
            provider=MockProvider(cfg),
            budget=2,
        )


def test_improve_channel_requires_eval_pass_when_configured(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root, minimum_eval_score=0.99)
    cfg = _config(root)
    outcome = run_improve_channel_dry_run(
        area="tests",
        workspace_root=root,
        config=cfg,
        provider=MockProvider(cfg),
    )
    assert outcome.ok is False
    assert "Provider eval blocked flow" in outcome.message


def test_improve_channel_refuses_auto_apply_and_auto_commit(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root, auto_apply=True)
    cfg = _config(root)
    with pytest.raises(UpdateChannelError, match="auto_apply"):
        run_improve_channel_dry_run(
            area="tests",
            workspace_root=root,
            config=cfg,
            provider=MockProvider(cfg),
        )

    _write_staff_config(root, auto_commit=True)
    cfg = _config(root)
    with pytest.raises(UpdateChannelError, match="auto_commit"):
        run_improve_channel_dry_run(
            area="tests",
            workspace_root=root,
            config=cfg,
            provider=MockProvider(cfg),
        )


def test_improve_channel_patch_creates_proposal_without_apply(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    _write_staff_config(root, require_eval_pass=False)
    cfg = _config(root)
    patch_path = root / "change.diff"
    patch_path.write_text(_harmless_patch(), encoding="utf-8")
    source_before = (root / "tests" / "test_example.py").read_text(encoding="utf-8")

    outcome = run_improve_channel_patch(
        area="tests",
        patch_file=patch_path,
        workspace_root=root,
        config=cfg,
        provider=MockProvider(cfg),
        temp_root=_experiments_root(tmp_path),
    )
    assert outcome.ok is True
    assert outcome.proposal_id is not None
    assert "apply-proposal" in outcome.message
    assert (root / "tests" / "test_example.py").read_text(encoding="utf-8") == source_before
    assert (root / ".realforge" / "proposals" / f"{outcome.proposal_id}.json").is_file()


def test_update_history_lists_eval_cycle_proposal_records(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)

    eval_outcome = run_eval(
        provider=MockProvider(cfg),
        suite="smoke",
        workspace_root=root,
        config=cfg,
        write=True,
    )

    _init_git(root)
    patch_path = root / "change.diff"
    patch_path.write_text(_harmless_patch(), encoding="utf-8")
    patch_outcome = run_improve_channel_patch(
        area="tests",
        patch_file=patch_path,
        workspace_root=root,
        config=cfg,
        provider=MockProvider(cfg),
        temp_root=_experiments_root(tmp_path),
    )

    entries = build_update_history(root)
    kinds = {entry.kind for entry in entries}
    assert "eval" in kinds
    assert "cycle" in kinds
    assert "proposal" in kinds
    assert patch_outcome.proposal_id is not None

    timeline = list_update_history(root)
    assert "update history" in timeline.lower()
    assert eval_outcome.report.id in timeline


def test_normal_non_staff_commands_still_work(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "eval", "--provider", "mock", "--suite", "smoke"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr


def test_staff_status_cli(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "staff-status"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "Staff mode enabled: False" in proc.stdout


def test_update_check_cli_refuses_without_staff(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "update-check"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 1
    assert "staff mode is disabled" in proc.stderr


def test_load_staff_config_sections(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root, enabled=True, channel="experimental", max_budget=3)
    cfg = _config(root)
    assert cfg.staff.enabled is True
    assert cfg.improvement.channel == "experimental"
    assert cfg.improvement.max_budget == 3
