import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.experiment import run_experiment_patch
from realforge.experiment_report import CommandResultRecord, ExperimentReport, write_report_json
from realforge.patch_safety import (
    PatchSafetyError,
    inspect_patch_file,
    normalize_patch_target,
    rollback_patch_backups,
    sha256_file,
    workspace_content_digest,
)
from realforge.patch_safety import build_patch_backups, FileBackupKind
from realforge.proposals import (
    ProposalError,
    apply_proposal,
    list_proposals,
    propose_merge_from_report,
    show_proposal,
)
from realforge.proposal_report import proposal_dir, proposals_dir, stored_patch_path

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


def _new_file_patch() -> str:
    return "\n".join(
        [
            "diff --git a/tests/test_added.py b/tests/test_added.py",
            "new file mode 100644",
            "--- /dev/null",
            "+++ b/tests/test_added.py",
            "@@ -0,0 +1,2 @@",
            "+def test_added():",
            "+    assert True",
            "",
        ]
    )


def _delete_file_patch() -> str:
    return "\n".join(
        [
            "diff --git a/tests/test_example.py b/tests/test_example.py",
            "deleted file mode 100644",
            "--- a/tests/test_example.py",
            "+++ /dev/null",
            "@@ -1,2 +0,0 @@",
            "-def test_ok():",
            "-    assert True",
            "",
        ]
    )


def _passed_report(
    patch_file: Path,
    *,
    report_path: Path,
    workspace_root: Path,
    passed: bool = True,
    main_modified: bool = False,
    validation_mode: str = "quick",
) -> Path:
    inspection = inspect_patch_file(patch_file, workspace_root)
    report = ExperimentReport(
        id="exp123",
        area="tests",
        patch_file=str(patch_file),
        patch_sha256=inspection.patch_sha256,
        patch_targets=inspection.patch_targets,
        validation_mode=validation_mode,
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
        workspace_content_digest=workspace_content_digest(workspace_root),
        notes=("Human approval is required before merging any changes to the main workspace.",),
    )
    write_report_json(report, report_path)
    return report_path


def test_experiment_report_stores_patch_sha256(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    report = run_experiment_patch(
        area="tests",
        patch_file=patch,
        workspace_root=root,
        config=cfg,
        temp_root=tmp_path / "experiments",
    )
    assert report.patch_sha256 == sha256_file(patch)
    assert report.patch_targets == ("tests/test_example.py",)
    assert report.validation_mode == "quick"


def test_propose_merge_rejects_tampered_patch(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    patch.write_text(_breaking_patch(), encoding="utf-8")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    with pytest.raises(ProposalError, match="SHA-256 mismatch"):
        propose_merge_from_report(report_path, workspace_root=root, config=cfg)


def test_apply_proposal_rejects_tampered_stored_patch(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)
    stored = stored_patch_path(root, created.id)
    stored.write_text(_breaking_patch(), encoding="utf-8")

    with pytest.raises(ProposalError, match="SHA-256 mismatch"):
        apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)


def test_validation_mode_preserved_from_experiment_to_apply(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(
        patch,
        report_path=tmp_path / "report.json",
        workspace_root=root,
        validation_mode="examples",
    )
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)
    assert created.validation_mode == "examples"

    seen_modes: list[str] = []

    def tracking_build(mode, workspace, *, config=None):
        seen_modes.append(mode)
        from realforge.experiment import build_validation_commands as real_build

        return real_build(mode, workspace, config=config)

    monkeypatch.setattr("realforge.proposals.build_validation_commands", tracking_build)
    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)
    assert outcome.ok is True
    assert seen_modes == ["examples"]


def test_malicious_patch_paths_rejected(tmp_path: Path):
    root = _workspace(tmp_path)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    escape = _write_patch(
        tmp_path / "escape.diff",
        "\n".join(
            [
                "--- a/../../../outside.txt",
                "+++ b/../../../outside.txt",
                "@@ -0,0 +1 @@",
                "+owned",
                "",
            ]
        ),
    )
    with pytest.raises(PatchSafetyError, match="traversal|escapes"):
        inspect_patch_file(escape, root, config=cfg)

    git_path = _write_patch(
        tmp_path / "git.diff",
        "\n".join(
            [
                "--- a/.git/config",
                "+++ b/.git/config",
                "@@ -0,0 +1 @@",
                "+evil",
                "",
            ]
        ),
    )
    with pytest.raises(PatchSafetyError, match=".git"):
        inspect_patch_file(git_path, root, config=cfg)


def test_commit_stages_only_patch_targets(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    (root / "other.txt").write_text("tracked unchanged\n", encoding="utf-8")
    subprocess.run(["git", "add", "other.txt"], cwd=root, check=True, capture_output=True, env=_git_env())
    subprocess.run(
        ["git", "commit", "-m", "other"],
        cwd=root,
        check=True,
        capture_output=True,
        env=_git_env(),
    )

    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True, commit=True)
    assert outcome.ok is True

    show = subprocess.run(
        ["git", "show", "--name-only", "--format="],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    committed = [line.strip() for line in show.stdout.splitlines() if line.strip()]
    assert committed == ["tests/test_example.py"]
    assert "other.txt" not in committed


def test_non_git_dirty_workspace_blocks_apply(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    (root / "tests" / "test_example.py").write_text("def test_ok():\n    assert True\n# dirty\n", encoding="utf-8")

    with pytest.raises(ProposalError, match="content changed since experiment"):
        apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)


def test_rollback_restores_modified_file(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "tests" / "test_example.py"
    original = target.read_bytes()
    inspection = inspect_patch_file(_write_patch(tmp_path / "p.diff", _harmless_patch()), root)
    backups = build_patch_backups(
        root,
        patch_targets=inspection.patch_targets,
        deleted_targets=inspection.deleted_targets,
        new_targets=inspection.new_targets,
    )
    target.write_text("# modified by patch\n", encoding="utf-8")
    outcome = rollback_patch_backups(backups, root)
    assert outcome.ok is True
    assert target.read_bytes() == original


def test_rollback_deletes_new_file(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "new.diff", _new_file_patch())
    inspection = inspect_patch_file(patch, root)
    backups = build_patch_backups(
        root,
        patch_targets=inspection.patch_targets,
        deleted_targets=inspection.deleted_targets,
        new_targets=inspection.new_targets,
    )
    new_path = root / "tests" / "test_added.py"
    new_path.write_text("def test_added():\n    assert True\n", encoding="utf-8")
    outcome = rollback_patch_backups(backups, root)
    assert outcome.ok is True
    assert not new_path.exists()


def test_rollback_restores_deleted_file(tmp_path: Path):
    root = _workspace(tmp_path)
    target = root / "tests" / "test_example.py"
    original = target.read_bytes()
    patch = _write_patch(tmp_path / "del.diff", _delete_file_patch())
    inspection = inspect_patch_file(patch, root)
    backups = build_patch_backups(
        root,
        patch_targets=inspection.patch_targets,
        deleted_targets=inspection.deleted_targets,
        new_targets=inspection.new_targets,
    )
    target.unlink()
    outcome = rollback_patch_backups(backups, root)
    assert outcome.ok is True
    assert target.read_bytes() == original


def test_propose_merge_rejects_failed_experiment_report(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(
        patch, report_path=tmp_path / "report.json", workspace_root=root, passed=False
    )
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    with pytest.raises(ProposalError, match="did not pass"):
        propose_merge_from_report(report_path, workspace_root=root, config=cfg)


def test_propose_merge_creates_pending_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)

    proposal = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    assert proposal.status == "pending"
    assert proposal.copied_patch_sha256 == sha256_file(patch)
    assert stored_patch_path(root, proposal.id).is_file()
    assert (proposals_dir(root) / f"{proposal.id}.json").is_file()


def test_apply_proposal_requires_confirm(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    with pytest.raises(ProposalError, match="requires --confirm"):
        apply_proposal(created.id, workspace_root=root, config=cfg, confirm=False)


def test_apply_proposal_rolls_back_on_validation_failure(tmp_path: Path):
    root = _workspace(tmp_path)
    _init_git(root)
    target = root / "tests" / "test_example.py"
    original = target.read_text(encoding="utf-8")
    patch = _write_patch(tmp_path / "break.diff", _breaking_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    outcome = apply_proposal(created.id, workspace_root=root, config=cfg, confirm=True)

    assert outcome.ok is False
    assert "rollback" in outcome.message.lower()
    assert target.read_text(encoding="utf-8") == original
    assert show_proposal(root, created.id).status == "failed"


def test_proposal_writes_stay_inside_workspace(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)

    json_path = proposals_dir(root) / f"{created.id}.json"
    patch_path = stored_patch_path(root, created.id)
    assert json_path.is_file()
    assert patch_path.is_file()
    assert json_path.resolve().is_relative_to(root.resolve())
    assert patch_path.resolve().is_relative_to(proposal_dir(root, created.id).resolve())


def test_show_proposal_includes_integrity_fields(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = _write_patch(tmp_path / "good.diff", _harmless_patch())
    report_path = _passed_report(patch, report_path=tmp_path / "report.json", workspace_root=root)
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    created = propose_merge_from_report(report_path, workspace_root=root, config=cfg)
    from realforge.proposal_report import format_proposal_summary

    summary = format_proposal_summary(created)
    assert "Patch SHA-256:" in summary
    assert "Validation mode:" in summary
    assert "Patch targets:" in summary
    assert "apply-proposal" in summary


def test_legacy_experiment_report_rejected(tmp_path: Path):
    root = _workspace(tmp_path)
    legacy = {
        "id": "old",
        "area": "tests",
        "patch_file": "x.diff",
        "passed": True,
        "validation_commands": ["pytest"],
        "command_results": [],
        "failures": [],
        "duration_ms": 1,
        "kept": False,
        "cleanup_status": "removed",
        "main_workspace_modified": False,
        "notes": [],
        "workspace_mode": "copy",
    }
    path = tmp_path / "legacy.json"
    path.write_text(json.dumps(legacy), encoding="utf-8")
    cfg = RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)
    with pytest.raises(ProposalError, match="validation_mode"):
        propose_merge_from_report(path, workspace_root=root, config=cfg)


def test_normalize_rejects_absolute_paths():
    with pytest.raises(PatchSafetyError):
        normalize_patch_target("/etc/passwd")
