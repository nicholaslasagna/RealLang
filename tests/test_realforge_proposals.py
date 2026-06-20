import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.experiment_report import CommandResultRecord, ExperimentReport, write_report_json
from realforge.proposals import (
    ProposalError,
    apply_proposal,
    list_proposals,
    propose_merge_from_report,
    show_proposal,
)
from realforge.proposal_report import proposals_dir

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
            "+# harmless proposal patch",
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


def _passed_report(
    patch_file: Path,
    *,
    report_path: Path,
    passed: bool = True,
    main_modified: bool = False,
) -> Path:
    report = ExperimentReport(
        id="exp123",
        area="tests",
        patch_file=str(patch_file),
        workspace_mode="copy",
        experiment_path=None,
        validation_commands=(".venv/bin/pytest -q",),
        command_results=(
            CommandResultRecord(
                command=".venv/bin/pytest -q",
                returncode=0,
                stdout="",
                stderr="",
                passed=passed,
            ),
        ),
        passed=passed,
        failures=() if passed else ("validation failed",),
        duration_ms=10,
        kept=False,
        cleanup_status="removed",
        main_workspace_modified=main_modified,
        notes=("Human approval is required before merging any changes to the main workspace.",),
    )
    write_report_json(report, report_path)
    return report_path


def test_propose_merge_rejects_failed_experiment_report(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", passed=False)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    with pytest.raises(ProposalError, match="did not pass"):
        propose_merge_from_report(report_path, workspace_root=root, config=cfg)


def test_propose_merge_rejects_main_workspace_modified(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", main_modified=True)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    with pytest.raises(ProposalError, match="main workspace was modified"):
        propose_merge_from_report(report_path, workspace_root=root, config=cfg)


def test_propose_merge_creates_pending_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    proposal = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    assert proposal.status == "pending"
    assert proposal.passed is True
    assert (root / proposal.patch_file).is_file()
    assert (proposals_dir(root) / f"{proposal.id}.json").is_file()


def test_list_proposals_shows_pending_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    proposals = list_proposals(root)

    assert len(proposals) == 1
    assert proposals[0].id == created.id
    assert proposals[0].status == "pending"


def test_show_proposal_prints_details(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    proposal = show_proposal(root, created.id)

    assert proposal.title
    assert proposal.validation_summary
    assert proposal.rollback_plan


def test_apply_proposal_requires_confirm(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    with pytest.raises(ProposalError, match="requires --confirm"):
        apply_proposal(created.id, workspace_root=root, config=cfg, confirm=False)


def test_apply_proposal_blocks_missing_patch_file(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)
    stored_patch = root / created.patch_file
    stored_patch.unlink()

    with pytest.raises(ProposalError, match="patch file not found"):
        apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)


def test_apply_proposal_applies_patch_only_with_confirm(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    target = root / "tests" / "test_example.py"
    original = target.read_text(encoding="utf-8")
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)

    assert outcome.ok is True
    assert "# harmless proposal patch" in target.read_text(encoding="utf-8")
    assert original != target.read_text(encoding="utf-8")


def test_apply_proposal_rolls_back_on_validation_failure(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    target = root / "tests" / "test_example.py"
    original = target.read_text(encoding="utf-8")
    patch = _write_patch(tmp_path / "break.diff", _breaking_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)

    assert outcome.ok is False
    assert target.read_text(encoding="utf-8") == original
    assert show_proposal(root, created.id).status == "failed"


def test_apply_proposal_leaves_changes_uncommitted_by_default(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)

    assert outcome.ok is True
    assert show_proposal(root, created.id).commit is None
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    assert status.stdout.strip()


def test_apply_proposal_commit_only_after_passing_validation(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True, commit=True)

    assert outcome.ok is True
    proposal = show_proposal(root, created.id)
    assert proposal.commit
    log = subprocess.run(
        ["git", "log", "-1", "--format=%an <%ae>"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
        env=_git_env(),
    )
    assert "Imagicast Studios" in log.stdout
    assert "reallang@users.noreply.github.com" in log.stdout


def test_proposal_writes_stay_inside_workspace(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    json_path = proposals_dir(root) / f"{created.id}.json"
    patch_path = proposals_dir(root) / f"{created.id}.patch"
    assert json_path.is_file()
    assert patch_path.is_file()
    assert json_path.resolve().is_relative_to(root.resolve())
    assert patch_path.resolve().is_relative_to(root.resolve())


def test_propose_merge_cli(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json")
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "propose-merge",
            "--report",
            str(report_path),
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "Proposal ID:" in proc.stdout
    assert "apply-proposal" in proc.stdout
