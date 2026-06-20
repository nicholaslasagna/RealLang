import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from realforge.config import RealForgeConfig
from realforge.multimodal.image_inputs import ImageInputError
from realforge.multimodal.image_outputs import write_multimodal_report
from realforge.multimodal.image_workflow import (
    ImageWorkflowError,
    build_image_generation_job,
    build_prompt_pack,
    build_reference_board,
    load_image_iteration_plan,
)
from realforge.multimodal.mock import MockMultimodalProvider
from realforge.multimodal.models import ImageGenerationJob, PromptPack
from realforge.multimodal.provider_base import UnsupportedCapabilityError
from realforge.multimodal.registry import get_multimodal_provider


ROOT = Path(__file__).resolve().parents[1]


def _env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    return env


def _run_cli(workspace: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "realforge.cli", *args],
        capture_output=True,
        text=True,
        env=_env(),
        cwd=str(workspace),
    )


def _png_bytes(marker: bytes = b"reference", width: int = 2, height: int = 3) -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00" * 8
        + width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + marker
    )


def test_image_job_returns_typed_untrusted_planning_artifact(tmp_path: Path):
    job = build_image_generation_job(
        "dark cinematic forest monster concept",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )

    assert isinstance(job, ImageGenerationJob)
    assert job.untrusted is True
    assert job.prompt_specs[0].untrusted is True
    assert job.iteration_plan.human_review_required is True
    assert job.provenance.provider == "mock"
    assert len(job.provenance.prompt_hash) == 64
    assert "No binary image" in job.safety_notes[1]
    assert not (tmp_path / ".realforge").exists()


def test_image_job_cli_json_is_valid_and_creates_no_binary(tmp_path: Path):
    proc = _run_cli(
        tmp_path,
        "image",
        "job",
        "--provider",
        "mock",
        "--task",
        "dark cinematic forest monster concept",
        "--json",
    )

    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["untrusted"] is True
    assert payload["provenance"]["provider"] == "mock"
    assert payload["iteration_plan"]["human_review_required"] is True
    assert not (tmp_path / ".realforge").exists()
    assert not tuple(tmp_path.glob("*.png"))


def test_image_job_write_and_iterate_create_separate_json_reports(tmp_path: Path):
    create = _run_cli(
        tmp_path,
        "image",
        "job",
        "--provider",
        "mock",
        "--task",
        "save an image planning job",
        "--write",
        "--json",
    )
    assert create.returncode == 0, create.stderr
    payload = json.loads(create.stdout)
    job_id = payload["id"]
    job_path = tmp_path / ".realforge" / "multimodal" / "image_jobs" / f"{job_id}.json"
    before = job_path.read_bytes()

    iterate = _run_cli(
        tmp_path,
        "image",
        "iterate",
        "--job",
        job_id,
        "--write",
        "--json",
    )
    assert iterate.returncode == 0, iterate.stderr
    iteration = json.loads(iterate.stdout)
    assert iteration["job_id"] == job_id
    assert iteration["plan"]["human_review_required"] is True
    assert job_path.read_bytes() == before
    iteration_paths = tuple(
        (tmp_path / ".realforge" / "multimodal" / "iterations").glob("*.json")
    )
    assert len(iteration_paths) == 1
    assert not tuple((tmp_path / ".realforge" / "multimodal").rglob("*.png"))


def test_prompt_pack_has_variants_and_negative_prompt(tmp_path: Path):
    pack = build_prompt_pack(
        "horror hallway key art",
        MockMultimodalProvider(),
        target_style="dark cinematic realism",
        aspect_ratio="16:9",
    )

    assert isinstance(pack, PromptPack)
    assert pack.untrusted is True
    assert len(pack.variants) == 3
    assert pack.negative_prompt
    assert "dark cinematic realism" in pack.style_tokens
    assert not (tmp_path / ".realforge").exists()


def test_prompt_pack_cli_supports_json_and_write(tmp_path: Path):
    proc = _run_cli(
        tmp_path,
        "image",
        "prompt-pack",
        "--provider",
        "mock",
        "--task",
        "horror hallway key art",
        "--write",
        "--json",
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["variants"]
    assert payload["negative_prompt"]
    paths = tuple((tmp_path / ".realforge" / "multimodal" / "prompt_packs").glob("*.json"))
    assert len(paths) == 1


def test_reference_board_hashes_multiple_images_without_semantic_analysis(tmp_path: Path):
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    first_data = _png_bytes(b"first")
    second_data = _png_bytes(b"second")
    first.write_bytes(first_data)
    second.write_bytes(second_data)

    board = build_reference_board(
        "manual mood and composition references",
        (first, second),
        workspace_root=tmp_path,
    )

    assert board.reference_hashes == (
        hashlib.sha256(first_data).hexdigest(),
        hashlib.sha256(second_data).hexdigest(),
    )
    assert all(
        reference.metadata["semantic_analysis_performed"] is False
        for reference in board.references
    )
    assert "Task-provided context only" in board.style_summary
    assert board.untrusted is True


def test_reference_board_cli_writes_json_only(tmp_path: Path):
    first = tmp_path / "first.png"
    second = tmp_path / "second.png"
    first.write_bytes(_png_bytes(b"first"))
    second.write_bytes(_png_bytes(b"second"))
    proc = _run_cli(
        tmp_path,
        "image",
        "references",
        "--task",
        "reference board",
        "--image",
        str(first),
        "--image",
        str(second),
        "--write",
        "--json",
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert len(payload["reference_hashes"]) == 2
    outputs = tuple(
        (tmp_path / ".realforge" / "multimodal" / "reference_boards").iterdir()
    )
    assert len(outputs) == 1
    assert outputs[0].suffix == ".json"
    assert first.read_bytes() == _png_bytes(b"first")
    assert second.read_bytes() == _png_bytes(b"second")


def test_reference_board_rejects_outside_workspace(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside = tmp_path / "outside.png"
    outside.write_bytes(_png_bytes())
    with pytest.raises(ImageInputError, match="outside workspace"):
        build_reference_board("outside reference", (outside,), workspace_root=workspace)


def test_missing_and_malformed_job_ids_fail_safely(tmp_path: Path):
    with pytest.raises(ImageWorkflowError, match="not found"):
        load_image_iteration_plan("012345abcdef", workspace_root=tmp_path)
    with pytest.raises(ImageWorkflowError, match="12-character"):
        load_image_iteration_plan("../../source", workspace_root=tmp_path)

    proc = _run_cli(tmp_path, "image", "iterate", "--job", "012345abcdef")
    assert proc.returncode == 1
    assert "saved image job not found" in proc.stderr
    assert "Traceback" not in proc.stderr


def test_unsupported_provider_fails_image_workflow_safely(tmp_path: Path):
    config = RealForgeConfig(
        realc_command=(sys.executable, "-m", "reallang.cli"),
        workspace_root=tmp_path,
    )
    provider = get_multimodal_provider("ollama", config)
    with pytest.raises(UnsupportedCapabilityError, match="job planning"):
        build_image_generation_job(
            "unsupported job",
            provider,
            workspace_root=tmp_path,
        )
    with pytest.raises(UnsupportedCapabilityError, match="prompt-pack planning"):
        build_prompt_pack("unsupported pack", provider)


def test_image_workflows_do_not_modify_workspace_sources(tmp_path: Path):
    source = tmp_path / "source.real"
    source.write_text("module main;\n", encoding="utf-8")
    before = source.read_bytes()

    for args in (
        ("image", "job", "--provider", "mock", "--task", "write-only job artifact", "--write"),
        (
            "image",
            "prompt-pack",
            "--provider",
            "mock",
            "--task",
            "write-only prompt artifact",
            "--write",
        ),
        ("image", "prompt", "--provider", "mock", "--task", "existing prompt path"),
    ):
        proc = _run_cli(tmp_path, *args)
        assert proc.returncode == 0, proc.stderr

    assert source.read_bytes() == before
    assert all(path.suffix == ".json" for path in (tmp_path / ".realforge").rglob("*.*"))


def test_direct_iteration_loader_reads_written_job(tmp_path: Path):
    job = build_image_generation_job(
        "direct iteration load",
        MockMultimodalProvider(),
        workspace_root=tmp_path,
    )
    write_multimodal_report(job, tmp_path, category="image_jobs")
    report = load_image_iteration_plan(job.id, workspace_root=tmp_path)
    assert report.job_id == job.id
    assert report.plan == job.iteration_plan
    assert report.untrusted is True
