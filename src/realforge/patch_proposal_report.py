from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from realforge.patch_safety import sha256_text
from realforge.workspace import assert_path_in_workspace


@dataclass(frozen=True)
class PatchProposal:
    id: str
    created_at: str
    provider: str
    task: str
    title: str
    summary: str
    rationale: str
    files_to_modify: tuple[str, ...]
    validation_commands: tuple[str, ...]
    risks: tuple[str, ...]
    unified_diff: str
    patch_sha256: str
    patch_targets: tuple[str, ...]
    requires_human_approval: bool
    untrusted: bool = True


def patch_proposals_dir(workspace_root: Path) -> Path:
    return workspace_root / ".realforge" / "patch_proposals"


def patch_proposal_dir(workspace_root: Path, proposal_id: str) -> Path:
    return patch_proposals_dir(workspace_root) / proposal_id


def patch_proposal_json_path(workspace_root: Path, proposal_id: str) -> Path:
    return patch_proposal_dir(workspace_root, proposal_id) / "proposal.json"


def patch_proposal_diff_path(workspace_root: Path, proposal_id: str) -> Path:
    return patch_proposal_dir(workspace_root, proposal_id) / "patch.diff"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def proposal_to_dict(proposal: PatchProposal) -> dict:
    return asdict(proposal)


def proposal_from_dict(data: dict) -> PatchProposal:
    return PatchProposal(
        id=str(data["id"]),
        created_at=str(data.get("created_at", "")),
        provider=str(data["provider"]),
        task=str(data["task"]),
        title=str(data.get("title", "")),
        summary=str(data.get("summary", "")),
        rationale=str(data.get("rationale", "")),
        files_to_modify=tuple(str(item) for item in data.get("files_to_modify", [])),
        validation_commands=tuple(str(item) for item in data.get("validation_commands", [])),
        risks=tuple(str(item) for item in data.get("risks", [])),
        unified_diff=str(data.get("unified_diff", "")),
        patch_sha256=str(data.get("patch_sha256", "")),
        patch_targets=tuple(str(item) for item in data.get("patch_targets", [])),
        requires_human_approval=bool(data.get("requires_human_approval", True)),
        untrusted=bool(data.get("untrusted", True)),
    )


def write_patch_proposal(proposal: PatchProposal, workspace_root: Path) -> tuple[Path, Path]:
    root = workspace_root.resolve()
    proposal_root = patch_proposal_dir(root, proposal.id).resolve()
    assert_path_in_workspace(proposal_root, root)
    try:
        proposal_root.relative_to(patch_proposals_dir(root).resolve())
    except ValueError as err:
        raise ValueError(f"patch proposal write refused outside patch_proposals: {proposal_root}") from err

    proposal_root.mkdir(parents=True, exist_ok=True)
    json_path = patch_proposal_json_path(root, proposal.id)
    diff_path = patch_proposal_diff_path(root, proposal.id)
    diff_path.write_text(proposal.unified_diff.rstrip() + "\n", encoding="utf-8")
    json_path.write_text(json.dumps(proposal_to_dict(proposal), indent=2) + "\n", encoding="utf-8")
    return json_path, diff_path


def load_patch_proposal(workspace_root: Path, proposal_id: str) -> PatchProposal:
    path = patch_proposal_json_path(workspace_root.resolve(), proposal_id)
    if not path.is_file():
        raise FileNotFoundError(f"patch proposal not found: {proposal_id}")
    return proposal_from_dict(json.loads(path.read_text(encoding="utf-8")))


def mock_task_patch_proposal(task: str, *, provider: str = "mock") -> PatchProposal:
    lowered = task.lower()
    if "readme" in lowered:
        diff = "\n".join(
            [
                "--- a/README.md",
                "+++ b/README.md",
                "@@ -1,1 +1,2 @@",
                "+# UNTRUSTED MODEL PATCH PROPOSAL (dry-run only)",
            ]
        )
        files = ("README.md",)
        title = "Add README comment"
    elif "test" in lowered:
        diff = "\n".join(
            [
                "--- a/tests/test_example.py",
                "+++ b/tests/test_example.py",
                "@@ -1,2 +1,3 @@",
                "+# UNTRUSTED MODEL PATCH PROPOSAL (dry-run only)",
                " def test_ok():",
                "     assert True",
                "",
            ]
        )
        files = ("tests/test_example.py",)
        title = "Add scheduler test comment"
    else:
        diff = "\n".join(
            [
                "--- a/tests/test_realforge_improve.py",
                "+++ b/tests/test_realforge_improve.py",
                "@@ -1,1 +1,2 @@",
                "+# UNTRUSTED MODEL PATCH PROPOSAL (dry-run only)",
            ]
        )
        files = ("tests/test_realforge_improve.py",)
        title = "Add RealForge improve test comment"

    return PatchProposal(
        id=uuid.uuid4().hex[:12],
        created_at=utc_now_iso(),
        provider=provider,
        task=task.strip() or "(empty task)",
        title=title,
        summary="Deterministic mock patch proposal for tests.",
        rationale="MockProvider returns a safe, review-only unified diff.",
        files_to_modify=files,
        validation_commands=(".venv/bin/pytest -q", "git diff --check"),
        risks=("Mock patch is for harness wiring only.",),
        unified_diff=diff,
        patch_sha256=sha256_text(diff),
        patch_targets=files,
        requires_human_approval=True,
        untrusted=True,
    )
