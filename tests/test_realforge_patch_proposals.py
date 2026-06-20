import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from realforge.config import RealForgeConfig
from realforge.errors import ProviderPlanError
from realforge.patch_proposal import PatchProposalError, parse_patch_proposal_payload, run_propose_patch
from realforge.patch_proposal_report import (
    load_patch_proposal,
    mock_task_patch_proposal,
    patch_proposal_diff_path,
    patch_proposal_json_path,
    patch_proposals_dir,
)
from realforge.providers.base import PatchProposalRequest
from realforge.providers.mock import MockProvider
from realforge.runner import run_validation_command

ROOT = Path(__file__).resolve().parents[1]


def _env():
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _workspace(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    root.mkdir()
    (root / "README.md").write_text("# Temp RealLang workspace\n", encoding="utf-8")
    (root / "tests").mkdir()
    (root / "tests" / "test_realforge_improve.py").write_text(
        "def test_ok():\n    assert True\n",
        encoding="utf-8",
    )
    (root / "tests" / "test_example.py").write_text("def test_ok():\n    assert True\n", encoding="utf-8")
    return root


def _config(root: Path) -> RealForgeConfig:
    return RealForgeConfig(realc_command=(sys.executable, "-m", "reallang.cli"), workspace_root=root)


def _valid_payload(**overrides) -> dict:
    base = {
        "title": "Test patch",
        "summary": "Summary",
        "rationale": "Because tests",
        "files_to_modify": ["README.md"],
        "validation_commands": [".venv/bin/pytest -q"],
        "risks": ["Low risk"],
        "unified_diff": "\n".join(
            [
                "--- a/README.md",
                "+++ b/README.md",
                "@@ -1,1 +1,2 @@",
                "+# comment",
            ]
        ),
        "requires_human_approval": True,
    }
    base.update(overrides)
    return base


class InvalidJsonPatchProvider(MockProvider):
    def generate_task_patch_proposal(self, request: PatchProposalRequest):
        raise ProviderPlanError("invalid", "invalid JSON patch proposal", raw="not json")


class EmptyDiffPatchProvider(MockProvider):
    def generate_task_patch_proposal(self, request: PatchProposalRequest):
        return parse_patch_proposal_payload(
            json.dumps(_valid_payload(unified_diff="")),
            provider="empty",
            task=request.task,
        )


class MaliciousPathPatchProvider(MockProvider):
    def generate_task_patch_proposal(self, request: PatchProposalRequest):
        return parse_patch_proposal_payload(
            json.dumps(
                _valid_payload(
                    files_to_modify=[".git/config"],
                    unified_diff="\n".join(
                        [
                            "--- a/.git/config",
                            "+++ b/.git/config",
                            "@@ -1,1 +1,2 @@",
                            "+evil=true",
                        ]
                    ),
                )
            ),
            provider="evil",
            task=request.task,
        )


class CommandSuggestingPatchProvider(MockProvider):
    def generate_task_patch_proposal(self, request: PatchProposalRequest):
        return parse_patch_proposal_payload(
            json.dumps(_valid_payload(validation_commands=["rm -rf /"])),
            provider="evil-cmd",
            task=request.task,
        )


def test_propose_patch_dry_run_prints_untrusted_patch_proposal(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_propose_patch(
        task="add a comment to README",
        provider=MockProvider(_config(root)),
        workspace_root=root,
        config=_config(root),
    )
    assert outcome.ok is True
    assert "UNTRUSTED PROVIDER PATCH PROPOSAL" in outcome.message
    assert "proposed unified diff" in outcome.message
    assert outcome.proposal is not None
    assert outcome.proposal.untrusted is True
    assert outcome.proposal.requires_human_approval is True


def test_invalid_provider_json_fails_safely(tmp_path: Path):
    root = _workspace(tmp_path)
    with pytest.raises(ProviderPlanError):
        run_propose_patch(
            task="update docs",
            provider=InvalidJsonPatchProvider(_config(root)),
            workspace_root=root,
            config=_config(root),
        )


def test_empty_diff_is_rejected(tmp_path: Path):
    root = _workspace(tmp_path)
    with pytest.raises(ProviderPlanError, match="unified_diff"):
        run_propose_patch(
            task="update docs",
            provider=EmptyDiffPatchProvider(_config(root)),
            workspace_root=root,
            config=_config(root),
        )


def test_malicious_patch_paths_are_rejected(tmp_path: Path):
    root = _workspace(tmp_path)
    with pytest.raises(PatchProposalError):
        run_propose_patch(
            task="evil patch",
            provider=MaliciousPathPatchProvider(_config(root)),
            workspace_root=root,
            config=_config(root),
        )


def test_save_writes_proposal_json_and_patch_diff(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_propose_patch(
        task="add a comment to README",
        provider=MockProvider(_config(root)),
        workspace_root=root,
        config=_config(root),
        save=True,
    )
    assert outcome.saved_json is not None
    assert outcome.saved_diff is not None
    assert outcome.saved_json.is_file()
    assert outcome.saved_diff.is_file()
    assert outcome.saved_json.resolve().is_relative_to(patch_proposals_dir(root).resolve())
    loaded = load_patch_proposal(root, outcome.proposal.id)
    assert loaded.patch_sha256
    assert loaded.patch_targets == ("README.md",)


def test_saved_patch_includes_sha256_and_targets(tmp_path: Path):
    root = _workspace(tmp_path)
    outcome = run_propose_patch(
        task="add a comment to README",
        provider=MockProvider(_config(root)),
        workspace_root=root,
        config=_config(root),
        save=True,
    )
    payload = json.loads(patch_proposal_json_path(root, outcome.proposal.id).read_text(encoding="utf-8"))
    diff_text = patch_proposal_diff_path(root, outcome.proposal.id).read_text(encoding="utf-8")
    assert payload["patch_sha256"]
    assert payload["patch_targets"] == ["README.md"]
    assert payload["untrusted"] is True
    assert diff_text.strip()


def test_main_workspace_source_files_remain_unchanged(tmp_path: Path):
    root = _workspace(tmp_path)
    readme = root / "README.md"
    before = readme.read_text(encoding="utf-8")
    before_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}

    run_propose_patch(
        task="add a comment to README",
        provider=MockProvider(_config(root)),
        workspace_root=root,
        config=_config(root),
        save=True,
    )

    assert readme.read_text(encoding="utf-8") == before
    after_mtimes = {path: path.stat().st_mtime_ns for path in root.rglob("*") if path.is_file()}
    for path, mtime in before_mtimes.items():
        if ".realforge" in path.as_posix():
            continue
        assert after_mtimes.get(path) == mtime


def test_mock_provider_patch_proposal_is_deterministic(tmp_path: Path):
    first = mock_task_patch_proposal("add a comment to README")
    second = mock_task_patch_proposal("add a comment to README")
    assert first.title == second.title
    assert first.files_to_modify == second.files_to_modify
    assert first.unified_diff == second.unified_diff
    assert first.validation_commands == second.validation_commands


def test_provider_suggested_commands_are_not_executed(tmp_path: Path):
    root = _workspace(tmp_path)
    with patch("realforge.runner.run_validation_command", wraps=run_validation_command) as runner:
        run_propose_patch(
            task="add a comment to README",
            provider=CommandSuggestingPatchProvider(_config(root)),
            workspace_root=root,
            config=_config(root),
        )
    runner.assert_not_called()


def test_experiment_uses_isolated_flow_without_applying_to_main_workspace(tmp_path: Path):
    root = _workspace(tmp_path)
    readme = root / "README.md"
    before = readme.read_text(encoding="utf-8")
    outcome = run_propose_patch(
        task="add a comment to README",
        provider=MockProvider(_config(root)),
        workspace_root=root,
        config=_config(root),
        run_experiment=True,
        temp_root=tmp_path / "experiments",
    )
    assert outcome.experiment_report is not None
    assert outcome.experiment_report.main_workspace_modified is False
    assert "Experiment" in outcome.message
    assert readme.read_text(encoding="utf-8") == before


def test_propose_patch_cli_dry_run(tmp_path: Path):
    root = _workspace(tmp_path)
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "realforge.cli",
            "propose-patch",
            "--provider",
            "mock",
            "--task",
            "add a comment to README",
            "--dry-run",
        ],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(root),
    )
    assert proc.returncode == 0, proc.stderr
    assert "UNTRUSTED PROVIDER PATCH PROPOSAL" in proc.stdout
