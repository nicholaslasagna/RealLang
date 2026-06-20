from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from realforge.multimodal.generation_report import build_image_prompt_spec
from realforge.multimodal.image_inputs import DEFAULT_MAX_IMAGE_BYTES, load_image_input
from realforge.multimodal.models import (
    ImageGenerationJob,
    ImageInput,
    ImageIterationPlan,
    ImageIterationReport,
    ImageProvenanceRecord,
    ImagePromptSpec,
    ImageReferenceBoard,
    PromptPack,
    new_report_id,
    utc_now_iso,
)
from realforge.multimodal.provider_base import (
    ImageJobProviderOutput,
    ImageWorkflowRequest,
    MultimodalProvider,
    MultimodalProviderError,
    PromptPackProviderOutput,
    UnsupportedCapabilityError,
)
from realforge.workspace import WorkspaceError, assert_path_in_workspace


MAX_REFERENCE_IMAGES = 16
JOB_ID_PATTERN = re.compile(r"^[0-9a-f]{12}$")


class ImageWorkflowError(Exception):
    pass


def _nonempty(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ImageWorkflowError(f"{field_name} must not be empty")
    return normalized


def _workflow_request(
    task: str,
    *,
    intended_use: str,
    target_style: str,
    aspect_ratio: str,
    output_count: int,
) -> ImageWorkflowRequest:
    if output_count < 1 or output_count > 16:
        raise ImageWorkflowError("output_count must be between 1 and 16")
    return ImageWorkflowRequest(
        task=_nonempty(task, "image workflow task"),
        intended_use=_nonempty(intended_use, "intended_use"),
        target_style=_nonempty(target_style, "target_style"),
        aspect_ratio=_nonempty(aspect_ratio, "aspect_ratio"),
        output_count=output_count,
    )


def _load_references(
    image_paths: tuple[Path, ...],
    *,
    workspace_root: Path,
    max_image_bytes: int,
    max_images: int = MAX_REFERENCE_IMAGES,
) -> tuple[ImageInput, ...]:
    if len(image_paths) > max_images:
        raise ImageWorkflowError(f"too many reference images: {len(image_paths)} > {max_images}")
    return tuple(
        load_image_input(path, workspace_root=workspace_root, max_image_bytes=max_image_bytes)
        for path in image_paths
    )


def _validate_text_tuple(value: object, name: str, *, allow_empty: bool = False) -> None:
    if not isinstance(value, tuple) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise MultimodalProviderError(f"provider returned invalid image workflow field {name!r}")
    if not allow_empty and not value:
        raise MultimodalProviderError(f"provider returned empty image workflow field {name!r}")


def _validate_iteration_plan(plan: object) -> None:
    if (
        not isinstance(plan, ImageIterationPlan)
        or not isinstance(plan.rounds, int)
        or isinstance(plan.rounds, bool)
        or plan.rounds < 1
    ):
        raise MultimodalProviderError("provider returned an invalid image iteration plan")
    for field_name in ("evaluation_criteria", "refinement_prompts", "reject_criteria"):
        _validate_text_tuple(getattr(plan, field_name), field_name)
    if plan.human_review_required is not True:
        raise MultimodalProviderError("image iteration plan must require human review")


def _validate_job_output(output: object, provider: str) -> ImageJobProviderOutput:
    if not isinstance(output, ImageJobProviderOutput):
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned an invalid image job output object"
        )
    if not isinstance(output.title, str) or not output.title.strip():
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned an invalid image job title"
        )
    for field_name in ("negative_prompt_strategy", "selection_criteria", "safety_notes"):
        _validate_text_tuple(getattr(output, field_name), field_name)
    _validate_iteration_plan(output.iteration_plan)
    return output


def _validate_prompt_pack_output(output: object, provider: str) -> PromptPackProviderOutput:
    if not isinstance(output, PromptPackProviderOutput):
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned an invalid prompt-pack output object"
        )
    if not isinstance(output.title, str) or not output.title.strip():
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned an invalid prompt-pack title"
        )
    for field_name in (
        "variants",
        "style_tokens",
        "camera_notes",
        "lighting_notes",
        "material_notes",
        "composition_notes",
        "engine_use_notes",
        "risks",
    ):
        _validate_text_tuple(getattr(output, field_name), field_name)
    return output


def _prompt_hash(spec: ImagePromptSpec) -> str:
    canonical = json.dumps(
        {
            "prompt": spec.prompt,
            "negative_prompt": spec.negative_prompt,
            "constraints": spec.constraints,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_image_generation_job(
    task: str,
    provider: MultimodalProvider,
    *,
    workspace_root: Path,
    intended_use: str = "concept exploration",
    target_style: str = "purpose-driven concept art",
    aspect_ratio: str = "1:1",
    output_count: int = 4,
    reference_image_paths: tuple[Path, ...] = (),
) -> ImageGenerationJob:
    request = _workflow_request(
        task,
        intended_use=intended_use,
        target_style=target_style,
        aspect_ratio=aspect_ratio,
        output_count=output_count,
    )
    capabilities = provider.capabilities()
    if not capabilities.supports_image_generation:
        raise UnsupportedCapabilityError(provider.name, "image generation job planning")
    max_bytes = capabilities.max_image_bytes or DEFAULT_MAX_IMAGE_BYTES
    max_images = capabilities.max_images or MAX_REFERENCE_IMAGES
    references = _load_references(
        reference_image_paths,
        workspace_root=workspace_root,
        max_image_bytes=max_bytes,
        max_images=min(max_images, MAX_REFERENCE_IMAGES),
    )
    prompt_spec = build_image_prompt_spec(
        request.task,
        provider,
        style_notes=(request.target_style,),
        target_use_case=request.intended_use,
    )
    output = _validate_job_output(
        provider.build_image_job(request, prompt_spec),
        provider.name,
    )
    created_at = utc_now_iso()
    provenance = ImageProvenanceRecord(
        source="realforge-image-workflow-planner",
        provider=provider.name,
        model=provider.model_name,
        prompt_hash=_prompt_hash(prompt_spec),
        reference_image_hashes=tuple(item.sha256 for item in references),
        created_at=created_at,
        notes=(
            "Planning artifact only; no binary image was generated.",
            "Provider output remains untrusted until human review.",
        ),
    )
    return ImageGenerationJob(
        id=new_report_id(),
        created_at=created_at,
        title=output.title,
        task=request.task,
        intended_use=request.intended_use,
        target_style=request.target_style,
        aspect_ratio=request.aspect_ratio,
        output_count=request.output_count,
        prompt_specs=(prompt_spec,),
        reference_images=references,
        negative_prompt_strategy=output.negative_prompt_strategy,
        iteration_plan=output.iteration_plan,
        selection_criteria=output.selection_criteria,
        safety_notes=output.safety_notes,
        provenance=provenance,
        untrusted=True,
    )


def build_prompt_pack(
    task: str,
    provider: MultimodalProvider,
    *,
    intended_use: str = "concept exploration",
    target_style: str = "purpose-driven concept art",
    aspect_ratio: str = "1:1",
) -> PromptPack:
    request = _workflow_request(
        task,
        intended_use=intended_use,
        target_style=target_style,
        aspect_ratio=aspect_ratio,
        output_count=1,
    )
    if not provider.capabilities().supports_image_generation:
        raise UnsupportedCapabilityError(provider.name, "image prompt-pack planning")
    prompt_spec = build_image_prompt_spec(
        request.task,
        provider,
        style_notes=(request.target_style,),
        target_use_case=request.intended_use,
    )
    output = _validate_prompt_pack_output(
        provider.build_prompt_pack(request, prompt_spec),
        provider.name,
    )
    return PromptPack(
        id=new_report_id(),
        title=output.title,
        base_prompt=prompt_spec.prompt,
        negative_prompt=prompt_spec.negative_prompt or "",
        variants=output.variants,
        style_tokens=output.style_tokens,
        camera_notes=output.camera_notes,
        lighting_notes=output.lighting_notes,
        material_notes=output.material_notes,
        composition_notes=output.composition_notes,
        engine_use_notes=output.engine_use_notes,
        risks=output.risks,
        untrusted=True,
    )


def build_reference_board(
    task: str,
    image_paths: tuple[Path, ...],
    *,
    workspace_root: Path,
) -> ImageReferenceBoard:
    normalized_task = _nonempty(task, "reference board task")
    if not image_paths:
        raise ImageWorkflowError("at least one --image is required")
    references = _load_references(
        image_paths,
        workspace_root=workspace_root,
        max_image_bytes=DEFAULT_MAX_IMAGE_BYTES,
    )
    return ImageReferenceBoard(
        id=new_report_id(),
        task=normalized_task,
        references=references,
        reference_hashes=tuple(item.sha256 for item in references),
        style_summary=f"Task-provided context only: {normalized_task}",
        constraints=(
            "Reference files remain unchanged.",
            "Hashes and file metadata are recorded for provenance.",
        ),
        limitations=(
            "RealForge 2.4 performs no semantic analysis for reference boards.",
            "The style summary is derived only from the supplied task text.",
        ),
        untrusted=True,
    )


def _tuple_strings(value: object, name: str) -> tuple[str, ...]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ImageWorkflowError(f"saved image job has invalid {name}")
    return tuple(value)


def _plan_from_dict(value: object) -> ImageIterationPlan:
    if not isinstance(value, dict):
        raise ImageWorkflowError("saved image job has invalid iteration_plan")
    rounds = value.get("rounds")
    if not isinstance(rounds, int) or isinstance(rounds, bool):
        raise ImageWorkflowError("saved image job has invalid iteration_plan")
    try:
        plan = ImageIterationPlan(
            rounds=rounds,
            evaluation_criteria=_tuple_strings(value["evaluation_criteria"], "evaluation_criteria"),
            refinement_prompts=_tuple_strings(value["refinement_prompts"], "refinement_prompts"),
            reject_criteria=_tuple_strings(value["reject_criteria"], "reject_criteria"),
            human_review_required=value["human_review_required"] is True,
        )
    except (KeyError, TypeError, ValueError) as err:
        raise ImageWorkflowError("saved image job has invalid iteration_plan") from err
    try:
        _validate_iteration_plan(plan)
    except MultimodalProviderError as err:
        raise ImageWorkflowError(str(err)) from err
    return plan


def load_image_iteration_plan(
    job_id: str,
    *,
    workspace_root: Path,
) -> ImageIterationReport:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ImageWorkflowError("job id must be a 12-character lowercase hexadecimal id")
    root = workspace_root.resolve()
    jobs_root = (root / ".realforge" / "multimodal" / "image_jobs").resolve()
    path = (jobs_root / f"{job_id}.json").resolve()
    try:
        assert_path_in_workspace(path, root)
        path.relative_to(jobs_root)
    except (WorkspaceError, ValueError) as err:
        raise ImageWorkflowError("image job path escaped workflow storage") from err
    if not path.is_file():
        raise ImageWorkflowError(f"saved image job not found: {job_id}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        raise ImageWorkflowError(f"could not read saved image job {job_id}: {err}") from err
    if not isinstance(payload, dict) or payload.get("id") != job_id:
        raise ImageWorkflowError(f"saved image job id does not match {job_id}")
    if payload.get("untrusted") is not True:
        raise ImageWorkflowError("saved image job is missing its untrusted marker")
    plan = _plan_from_dict(payload.get("iteration_plan"))
    return ImageIterationReport(
        id=new_report_id(),
        created_at=utc_now_iso(),
        job_id=job_id,
        plan=plan,
        untrusted=True,
    )


def format_image_job(job: ImageGenerationJob) -> str:
    return "\n".join(
        (
            "REALFORGE IMAGE GENERATION JOB",
            "Status: UNTRUSTED",
            "Output: PLANNING ARTIFACT ONLY",
            f"ID: {job.id}",
            f"Title: {job.title}",
            f"Task: {job.task}",
            f"Intended use: {job.intended_use}",
            f"Target style: {job.target_style}",
            f"Aspect ratio: {job.aspect_ratio}",
            f"Requested candidates: {job.output_count}",
            f"Prompt specifications: {len(job.prompt_specs)}",
            f"Reference images: {len(job.reference_images)}",
            "Binary images generated: no",
            "Human review required: yes",
        )
    )


def format_prompt_pack(pack: PromptPack) -> str:
    lines = (
        "REALFORGE IMAGE PROMPT PACK",
        "Status: UNTRUSTED",
        f"ID: {pack.id}",
        f"Title: {pack.title}",
        f"Variants: {len(pack.variants)}",
        "Binary images generated: no",
        "",
        "Base prompt",
        f"  {pack.base_prompt}",
        "",
        "Negative prompt",
        f"  {pack.negative_prompt}",
    )
    return "\n".join(lines)


def format_iteration_report(report: ImageIterationReport) -> str:
    lines = [
        "REALFORGE IMAGE ITERATION PLAN",
        "Status: UNTRUSTED",
        f"Source job: {report.job_id}",
        f"Rounds: {report.plan.rounds}",
        "Human review required: yes",
        "Job mutated: no",
        "Binary images generated: no",
        "",
        "Evaluation criteria",
    ]
    lines.extend(f"  - {item}" for item in report.plan.evaluation_criteria)
    return "\n".join(lines)


def format_reference_board(board: ImageReferenceBoard) -> str:
    return "\n".join(
        (
            "REALFORGE IMAGE REFERENCE BOARD",
            "Status: UNTRUSTED",
            f"ID: {board.id}",
            f"Task: {board.task}",
            f"References: {len(board.references)}",
            "Semantic image analysis performed: no",
            "Reference files modified: no",
        )
    )
