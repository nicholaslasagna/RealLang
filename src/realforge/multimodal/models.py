from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone


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


def new_report_id() -> str:
    return uuid.uuid4().hex[:12]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
