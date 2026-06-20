import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.cycle import CycleError, run_cycle_dry_run, run_cycle_patch, show_cycle, validate_budget
from realforge.cycle_report import cycle_report_path, cycles_dir, list_cycle_reports
from realforge.providers.mock import MockProvider
from realforge.proposal_report import proposals_dir
from realforge.research.fetcher import run_research_fetch

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
            "+# harmless cycle patch",
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


@dataclass
class _MockResponse:
    status: int
    headers: dict[str, str]
    body: bytes
    url: str


def _mock_opener(body: bytes = b"saved research summary text"):
    def opener(url: str, timeout: float) -> _MockResponse:
        return _MockResponse(
            status=200,
            headers={"Content-Type": "text/plain"},
            body=body,
            url=url,
        )

    return opener


def _save_research(root: Path, tmp_path: Path) -> str:
    outcome = run_research_fetch(
        url="https://example.com/docs",
        allow_domain="example.com",
        workspace_root=root,
        opener=_mock_opener(),
        resolve_host=lambda _host, allow_domain: None,
    )
    return outcome.record.id


def test_budget_over_three_is_rejected():
    with pytest.raises(CycleError, match="budget must be between"):
        validate_budget(4)


def test_dry_run_cycle_creates_no_experiment_or_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    before = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}

    outcome = run_cycle_dry_run(
        area="tests",
        workspace_root=root,
        provider=MockProvider(),
        config=cfg,
        budget=1,
    )

    assert outcome.ok is True
    assert outcome.report is None
    assert "dry-run" in outcome.message.lower()
    assert not proposals_dir(root).exists()
    assert not cycles_dir(root).exists()
    after = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}
    assert before == after


def test_cycle_with_passing_patch_creates_proposal_without_apply(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    target = root / "tests" / "test_example.py"
    original = target.read_text(encoding="utf-8")
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    outcome = run_cycle_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    assert outcome.report is not None
    assert outcome.report.passed is True
    assert outcome.report.proposal_ids
    assert target.read_text(encoding="utf-8") == original
    assert cycle_report_path(root, outcome.report.id).is_file()
    assert proposals_dir(root).is_dir()


def test_cycle_with_failing_patch_records_failure_without_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "bad.diff", _breaking_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    outcome = run_cycle_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    assert outcome.ok is False
    assert outcome.report is not None
    assert not outcome.report.proposal_ids
    assert outcome.report.stopped_reason == "experiment failed"


def test_cycle_list_and_show(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_cycle_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )

    listed = list_cycle_reports(root)
    assert len(listed) == 1
    assert listed[0].id == outcome.report.id
    shown = show_cycle(root, outcome.report.id)
    assert "Next steps:" in shown
    assert "realforge apply-proposal" in shown


def test_research_id_can_be_attached_from_saved_record(tmp_path: Path):
    root = _workspace(tmp_path)
    research_id = _save_research(root, tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    dry = run_cycle_dry_run(
        area="docs",
        workspace_root=root,
        provider=MockProvider(),
        config=cfg,
        budget=1,
        research_ids=(research_id,),
    )
    assert research_id in dry.message
    assert "Saved Research" in dry.message

    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    outcome = run_cycle_patch(
        area="docs",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        research_ids=(research_id,),
        temp_root=_experiments_root(tmp_path),
    )
    assert outcome.report is not None
    assert outcome.report.research_ids == (research_id,)


def test_cycle_report_written_under_workspace_bound_cycles(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    outcome = run_cycle_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=_experiments_root(tmp_path),
    )
    path = cycle_report_path(root, outcome.report.id)
    assert path.is_file()
    assert path.resolve().is_relative_to(cycles_dir(root).resolve())
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["main_workspace_modified"] is False


def test_cycle_cli_dry_run(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "cycle",
            "--dry-run",
            "--provider",
            "mock",
            "--area",
            "tests",
            "--budget",
            "1",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "cycle dry-run" in proc.stdout.lower()
