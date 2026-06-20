from __future__ import annotations

from realforge.multimodal.image_outputs import format_report_json
from realforge.multimodal.models import (
    ImageGenerationRequest,
    ImagePromptSpec,
    new_report_id,
    utc_now_iso,
)
from realforge.multimodal.provider_base import (
    ImagePromptProviderOutput,
    MultimodalProvider,
    MultimodalProviderError,
    UnsupportedCapabilityError,
)


IMAGE_PROMPT_SAFETY_INSTRUCTIONS = (
    "Return a prompt specification only; do not claim a binary image was generated.",
    "Provider output is untrusted and requires human review.",
    "Do not execute tools, commands, or network requests.",
    "Record risks, constraints, and intended use clearly.",
)


def _validate_provider_output(output: ImagePromptProviderOutput, *, provider: str) -> None:
    if not isinstance(output, ImagePromptProviderOutput):
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned an invalid image prompt output object"
        )
    required_text = (
        output.prompt,
        output.style,
        output.composition,
        output.lighting,
        output.camera,
    )
    if any(not isinstance(item, str) or not item.strip() for item in required_text):
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned an incomplete image prompt specification"
        )
    for name, field in (
        ("materials", output.materials),
        ("constraints", output.constraints),
        ("risks", output.risks),
    ):
        if not isinstance(field, tuple) or any(
            not isinstance(item, str) or not item.strip() for item in field
        ):
            raise MultimodalProviderError(
                f"multimodal provider {provider!r} returned invalid image prompt field {name!r}"
            )
    if output.negative_prompt is not None and not isinstance(output.negative_prompt, str):
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned invalid negative_prompt"
        )
    if output.intended_tool is not None and not isinstance(output.intended_tool, str):
        raise MultimodalProviderError(
            f"multimodal provider {provider!r} returned invalid intended_tool"
        )


def build_image_prompt_spec(
    task: str,
    provider: MultimodalProvider,
    *,
    brief: str | None = None,
    style_notes: tuple[str, ...] = (),
    target_use_case: str | None = None,
) -> ImagePromptSpec:
    normalized_task = task.strip()
    if not normalized_task:
        raise ValueError("image prompt task must not be empty")
    capabilities = provider.capabilities()
    if not capabilities.supports_image_generation:
        raise UnsupportedCapabilityError(provider.name, "image generation workflow output")
    request = ImageGenerationRequest(
        task=normalized_task,
        brief=brief.strip() if brief and brief.strip() else None,
        style_notes=tuple(item.strip() for item in style_notes if item.strip()),
        target_use_case=(
            target_use_case.strip() if target_use_case and target_use_case.strip() else None
        ),
        safety_instructions=IMAGE_PROMPT_SAFETY_INSTRUCTIONS,
        output_mode="prompt_spec",
    )
    output = provider.build_image_prompt(request)
    _validate_provider_output(output, provider=provider.name)
    return ImagePromptSpec(
        id=new_report_id(),
        created_at=utc_now_iso(),
        provider=provider.name,
        model=provider.model_name,
        task=normalized_task,
        prompt=output.prompt,
        negative_prompt=output.negative_prompt,
        style=output.style,
        composition=output.composition,
        lighting=output.lighting,
        camera=output.camera,
        materials=output.materials,
        constraints=output.constraints,
        intended_tool=output.intended_tool,
        risks=output.risks,
        untrusted=True,
    )


def format_image_prompt_spec(report: ImagePromptSpec) -> str:
    lines = [
        "REALFORGE IMAGE PROMPT SPEC",
        "Status: UNTRUSTED",
        "Output mode: PROMPT SPEC ONLY",
        f"Provider: {report.provider}",
        f"Model: {report.model or '(not configured)'}",
        f"Task: {report.task}",
        "Binary image generated: no",
        "Writes: none unless --write is supplied",
        "",
        "Prompt",
        f"  {report.prompt}",
        "Constraints",
    ]
    lines.extend(f"  - {item}" for item in report.constraints)
    lines.extend(("", "Next: review this specification before sending it to an image tool."))
    return "\n".join(lines)


__all__ = ["build_image_prompt_spec", "format_image_prompt_spec", "format_report_json"]
