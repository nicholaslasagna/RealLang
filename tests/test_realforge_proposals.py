import os
import subprocess
import sys
from pathlib import Path

from realforge.config import RealForgeConfig
from realforge.experiment_report import write_report_json
from realforge.patch_safety import inspect_patch_file, workspace_content_digest
from realforge.proposals import propose_merge_from_report

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


def test_propose_merge_cli(tmp_path: Path):
    root = _workspace(tmp_path)
    patch = tmp_path / "good.diff"
    patch.write_text(_harmless_patch(), encoding="utf-8")
    inspection = inspect_patch_file(patch, root)
    from realforge.experiment_report import CommandResultRecord, ExperimentReport

    report = ExperimentReport(
        id="exp123",
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
    report_path = tmp_path / "report.json"
    write_report_json(report, report_path)
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
    assert "Patch SHA-256:" in proc.stdout
    assert "apply-proposal" in proc.stdout
