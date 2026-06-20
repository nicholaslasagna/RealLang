import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from realforge import __version__
from realforge.config import load_config
from realforge.experiment_report import CommandResultRecord, ExperimentReport, write_report_json
from realforge.patch_safety import inspect_patch_file, workspace_content_digest
from realforge.proposal_report import ProposalStatus, load_proposal_json, proposal_path, write_proposal_json
from realforge.proposals import propose_merge_from_report
from realforge.staff import StaffError
from realforge.update_bundle import (
    UpdateBundleError,
    candidate_version_from_base,
    create_update_bundle,
    export_update_bundle,
    list_update_bundle_records,
    mark_update_bundle,
    show_update_bundle_record,
)
from realforge.update_bundle_report import update_bundle_path, updates_dir

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
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


def _write_staff_config(root: Path, *, enabled: bool = True) -> None:
    (root / ".realforge.toml").write_text(
        "\n".join(
            [
                "[staff]",
                f"enabled = {str(enabled).lower()}",
                "",
                "[model]",
                'provider = "mock"',
                'model = "mock"',
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def _config(root: Path):
    return load_config(root)


def _harmless_patch() -> str:
    return "\n".join(
        [
            "--- a/tests/test_example.py",
            "+++ b/tests/test_example.py",
            "@@ -1,2 +1,3 @@",
            "+# harmless bundle patch",
            " def test_ok():",
            "     assert True",
            "",
        ]
    )


def _pending_proposal(root: Path, tmp_path: Path):
    patch = tmp_path / "good.diff"
    patch.write_text(_harmless_patch(), encoding="utf-8")
    inspection = inspect_patch_file(patch, root)
    report = ExperimentReport(
        id="expbundle",
        area="tests",
        patch_file=str(patch),
        patch_sha256=inspection.patch_sha256,
        patch_targets=inspection.patch_targets,
        validation_mode="quick",
        workspace_mode="copy",
        experiment_path=None,
        validation_commands=(".venv/bin/pytest -q",),
        command_results=(
            CommandResultRecord(
                command=".venv/bin/pytest -q",
                returncode=0,
                stdout="",
                stderr="",
                passed=True,
            ),
        ),
        passed=True,
        failures=(),
        duration_ms=10,
        kept=False,
        cleanup_status="removed",
        main_workspace_modified=False,
        workspace_content_digest=workspace_content_digest(root),
        notes=(),
    )
    report_path = root / "experiment.json"
    write_report_json(report, report_path)
    proposal = propose_merge_from_report(report_path, workspace_root=root, config=_config(root))
    return proposal


def test_update_bundle_commands_refuse_when_staff_disabled(tmp_path: Path):
    root = _workspace(tmp_path)
    cfg = _config(root)
    with pytest.raises(StaffError):
        create_update_bundle(proposal_id="missing", workspace_root=root, config=cfg)


def test_create_rejects_missing_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    with pytest.raises(UpdateBundleError, match="not found"):
        create_update_bundle(proposal_id="missing", workspace_root=root, config=cfg)


def test_create_rejects_non_pending_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    proposal = _pending_proposal(root, tmp_path)
    applied = replace(proposal, status=ProposalStatus.APPLIED.value)
    write_proposal_json(applied, proposal_path(root, proposal.id))

    with pytest.raises(UpdateBundleError, match="not pending"):
        create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=cfg)


def test_create_verifies_patch_hash(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    proposal = _pending_proposal(root, tmp_path)
    patch_path = root / proposal.patch_file
    patch_path.write_text("tampered patch\n", encoding="utf-8")

    with pytest.raises(UpdateBundleError, match="hash verification failed"):
        create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=cfg)


def test_create_writes_bundle_under_realforge_updates(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    proposal = _pending_proposal(root, tmp_path)
    source_before = (root / "tests" / "test_example.py").read_text(encoding="utf-8")

    outcome = create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=cfg)
    assert outcome.ok is True
    assert outcome.bundle is not None
    path = update_bundle_path(root, outcome.bundle.id)
    assert path.is_file()
    assert path.resolve().is_relative_to(updates_dir(root).resolve())
    assert outcome.bundle.version_base == __version__
    assert outcome.bundle.candidate_version == candidate_version_from_base(__version__)
    assert outcome.bundle.source_proposal_id == proposal.id
    assert outcome.bundle.patch_sha256 == proposal.copied_patch_sha256
    assert (root / "tests" / "test_example.py").read_text(encoding="utf-8") == source_before


def test_list_and_show_update_bundle(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    proposal = _pending_proposal(root, tmp_path)
    created = create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=cfg)

    listed = list_update_bundle_records(workspace_root=root, config=cfg)
    assert created.bundle.id in listed

    shown = show_update_bundle_record(
        bundle_id=created.bundle.id,
        workspace_root=root,
        config=cfg,
    )
    assert "update bundle" in shown.lower()
    assert "apply-proposal" in shown
    assert created.bundle.candidate_version in shown


def test_mark_updates_status_only(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    proposal = _pending_proposal(root, tmp_path)
    created = create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=cfg)
    source_before = (root / "tests" / "test_example.py").read_text(encoding="utf-8")

    outcome = mark_update_bundle(
        bundle_id=created.bundle.id,
        status="approved",
        workspace_root=root,
        config=cfg,
    )
    assert outcome.ok is True
    assert outcome.bundle.status == "approved"
    assert (root / "tests" / "test_example.py").read_text(encoding="utf-8") == source_before


def test_export_writes_metadata_only_json(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    cfg = _config(root)
    proposal = _pending_proposal(root, tmp_path)
    created = create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=cfg)
    output = root / "bundle-export.json"

    outcome = export_update_bundle(
        bundle_id=created.bundle.id,
        output=output,
        workspace_root=root,
        config=cfg,
    )
    assert outcome.ok is True
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["id"] == created.bundle.id
    assert payload["source_proposal_id"] == proposal.id
    assert "patch_diff" not in payload


def test_update_bundle_cli_list_with_staff_config(tmp_path: Path):
    root = _workspace(tmp_path)
    _write_staff_config(root)
    proposal = _pending_proposal(root, tmp_path)
    create_update_bundle(proposal_id=proposal.id, workspace_root=root, config=_config(root))

    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "update-bundle", "list"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "update bundles" in proc.stdout.lower()


def test_update_bundle_cli_refuses_without_staff(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [sys.executable, "-m", "realforge.cli", "update-bundle", "list"],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 1
    assert "staff mode is disabled" in proc.stderr
