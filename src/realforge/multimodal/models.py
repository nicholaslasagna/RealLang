from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from realforge.creative.models import AssetBrief


@dataclass(frozen=True)
class MultimodalCapabilities:
    provider: str
    model: str | None
    supports_text: bool
    supports_vision: bool
    supports_image_generation: bool
    supports_embeddings: bool
    max_images: int | None
    max_image_bytes: int | None
    notes: tuple[str, ...]
    experimental: bool


@dataclass(frozen=True)
class ImageInput:
    path: str
    sha256: str
    size_bytes: int
    media_type: str
    width: int | None
    height: int | None
    metadata: dict[str, object]
    workspace_relative_path: str | None


@dataclass(frozen=True)
class VisionRequest:
    task: str
    images: tuple[ImageInput, ...]
    context: str | None
    safety_instructions: tuple[str, ...]
    require_json: bool = True


@dataclass(frozen=True)
class VisionAnalysis:
    id: str
    created_at: str
    provider: str
    model: str | None
    task: str
    image_sha256_values: tuple[str, ...]
    observed_elements: tuple[str, ...]
    style_notes: tuple[str, ...]
    likely_use_cases: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    confidence: float
    untrusted: bool = True


@dataclass(frozen=True)
class ImageUnderstandingReport:
    id: str
    created_at: str
    provider: str
    model: str | None
    task: str
    images: tuple[ImageInput, ...]
    image_sha256_values: tuple[str, ...]
    detected_subjects: tuple[str, ...]
    environment_notes: tuple[str, ...]
    composition_notes: tuple[str, ...]
    lighting_notes: tuple[str, ...]
    color_palette_notes: tuple[str, ...]
    material_notes: tuple[str, ...]
    style_notes: tuple[str, ...]
    mood_notes: tuple[str, ...]
    gameplay_relevance: tuple[str, ...]
    asset_opportunities: tuple[str, ...]
    map_design_opportunities: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    confidence: float
    semantic_analysis_performed: bool
    untrusted: bool = True


@dataclass(frozen=True)
class ImageComparisonReport:
    id: str
    created_at: str
    provider: str
    model: str | None
    task: str
    images: tuple[ImageInput, ...]
    image_sha256_values: tuple[str, ...]
    similarities: tuple[str, ...]
    differences: tuple[str, ...]
    style_consistency_notes: tuple[str, ...]
    asset_pipeline_notes: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    confidence: float
    untrusted: bool = True


@dataclass(frozen=True)
class ImageToAssetBriefReport:
    id: str
    created_at: str
    provider: str
    model: str | None
    source_image_sha256: str
    asset_brief: AssetBrief
    inferred_constraints: tuple[str, ...]
    engine_notes: tuple[str, ...]
    modeling_notes: tuple[str, ...]
    texture_notes: tuple[str, ...]
    collision_notes: tuple[str, ...]
    animation_notes: tuple[str, ...]
    risks: tuple[str, ...]
    limitations: tuple[str, ...]
    untrusted: bool = True


@dataclass(frozen=True)
class ImageGenerationRequest:
    task: str
    brief: str | None
    style_notes: tuple[str, ...]
    target_use_case: str | None
    safety_instructions: tuple[str, ...]
    output_mode: str = "prompt_spec"


@dataclass(frozen=True)
class ImagePromptSpec:
    id: str
    created_at: str
    provider: str
    model: str | None
    task: str
    prompt: str
    negative_prompt: str | None
    style: str
    composition: str
    lighting: str
    camera: str
    materials: tuple[str, ...]
    constraints: tuple[str, ...]
    intended_tool: str | None
    risks: tuple[str, ...]
    untrusted: bool = True


@dataclass(frozen=True)
class ImageIterationPlan:
    rounds: int
    evaluation_criteria: tuple[str, ...]
    refinement_prompts: tuple[str, ...]
    reject_criteria: tuple[str, ...]
    human_review_required: bool = True


@dataclass(frozen=True)
class ImageProvenanceRecord:
    source: str
    provider: str
    model: str | None
    prompt_hash: str
    reference_image_hashes: tuple[str, ...]
    created_at: str
    notes: tuple[str, ...]


@dataclass(frozen=True)
class PromptPack:
    id: str
    title: str
    base_prompt: str
    negative_prompt: str
    variants: tuple[str, ...]
    style_tokens: tuple[str, ...]
    camera_notes: tuple[str, ...]
    lighting_notes: tuple[str, ...]
    material_notes: tuple[str, ...]
    composition_notes: tuple[str, ...]
    engine_use_notes: tuple[str, ...]
    risks: tuple[str, ...]
    untrusted: bool = True


@dataclass(frozen=True)
class ImageGenerationJob:
    id: str
    created_at: str
    title: str
    task: str
    intended_use: str
    target_style: str
    aspect_ratio: str
    output_count: int
    prompt_specs: tuple[ImagePromptSpec, ...]
    reference_images: tuple[ImageInput, ...]
    negative_prompt_strategy: tuple[str, ...]
    iteration_plan: ImageIterationPlan
    selection_criteria: tuple[str, ...]
    safety_notes: tuple[str, ...]
    provenance: ImageProvenanceRecord
    untrusted: bool = True


@dataclass(frozen=True)
class ImageReferenceBoard:
    id: str
    task: str
    references: tuple[ImageInput, ...]
    reference_hashes: tuple[str, ...]
    style_summary: str
    constraints: tuple[str, ...]
    limitations: tuple[str, ...]
    untrusted: bool = True


@dataclass(frozen=True)
class ImageIterationReport:
    id: str
    created_at: str
    job_id: str
    plan: ImageIterationPlan
    untrusted: bool = True


def new_report_id() -> str:
    return uuid.uuid4().hex[:12]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
