from __future__ import annotations

from realforge.multimodal.models import (
    ImageGenerationRequest,
    ImageIterationPlan,
    ImagePromptSpec,
    MultimodalCapabilities,
    VisionRequest,
)
from realforge.multimodal.provider_base import (
    AssetBriefDraft,
    ImageComparisonProviderOutput,
    ImageJobProviderOutput,
    ImagePromptProviderOutput,
    ImageToAssetBriefProviderOutput,
    ImageUnderstandingProviderOutput,
    ImageWorkflowRequest,
    MultimodalProvider,
    PromptPackProviderOutput,
    VisionProviderOutput,
)


MOCK_MAX_IMAGES = 4
MOCK_MAX_IMAGE_BYTES = 8 * 1024 * 1024


class MockMultimodalProvider(MultimodalProvider):
    """Deterministic workflow provider; performs no semantic image recognition."""

    @property
    def name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str | None:
        return "mock-multimodal"

    def capabilities(self) -> MultimodalCapabilities:
        return MultimodalCapabilities(
            provider=self.name,
            model=self.model_name,
            supports_text=True,
            supports_vision=True,
            supports_image_generation=True,
            supports_embeddings=False,
            max_images=MOCK_MAX_IMAGES,
            max_image_bytes=MOCK_MAX_IMAGE_BYTES,
            notes=(
                "Vision support validates workflow wiring only; no semantic recognition is performed.",
                "Image generation support returns structured planning artifacts only; no binary image is generated.",
            ),
            experimental=True,
        )

    def analyze_vision(self, request: VisionRequest) -> VisionProviderOutput:
        return VisionProviderOutput(
            observed_elements=(),
            style_notes=("No semantic style analysis was performed by the mock provider.",),
            likely_use_cases=("Validate local multimodal workflow and report integration.",),
            risks=("Do not interpret deterministic mock output as image understanding.",),
            limitations=(
                "MockMultimodalProvider does not inspect semantic image content.",
                "Only trusted ImageInput hash and metadata descriptors were supplied.",
            ),
            confidence=0.0,
        )

    def understand_image(self, request: VisionRequest) -> ImageUnderstandingProviderOutput:
        return ImageUnderstandingProviderOutput(
            detected_subjects=(),
            environment_notes=("No environment inference was performed by the mock provider.",),
            composition_notes=("No composition inference was performed by the mock provider.",),
            lighting_notes=("No lighting inference was performed by the mock provider.",),
            color_palette_notes=("No color-palette inference was performed by the mock provider.",),
            material_notes=("No material inference was performed by the mock provider.",),
            style_notes=("No style inference was performed by the mock provider.",),
            mood_notes=("No mood inference was performed by the mock provider.",),
            gameplay_relevance=(f"Task context recorded without image inference: {request.task}",),
            asset_opportunities=("No asset opportunities were inferred from image content.",),
            map_design_opportunities=("No map opportunities were inferred from image content.",),
            risks=("Do not interpret deterministic mock output as image understanding.",),
            limitations=(
                "MockMultimodalProvider reads no semantic image content.",
                "Only validated image hashes and metadata are available to this mock workflow.",
                "No OCR, object detection, or visual model was used.",
            ),
            confidence=0.0,
            semantic_analysis_performed=False,
        )

    def compare_images(self, request: VisionRequest) -> ImageComparisonProviderOutput:
        hashes = tuple(image.sha256 for image in request.images)
        unique_hashes = len(set(hashes))
        return ImageComparisonProviderOutput(
            similarities=(
                "All inputs passed the same bounded image validation and metadata workflow.",
            ),
            differences=(
                f"The inputs contain {unique_hashes} distinct SHA-256 value(s).",
                "No visual-content differences were assessed.",
            ),
            style_consistency_notes=(
                "Style consistency was not assessed by the mock provider.",
            ),
            asset_pipeline_notes=(
                "Use recorded hashes to track references before any future pipeline review.",
            ),
            risks=("Hash comparison is not semantic image comparison.",),
            limitations=(
                "MockMultimodalProvider does not compare visual content.",
                "No OCR, feature extraction, or visual model was used.",
            ),
            confidence=0.0,
        )

    def image_to_asset_brief(self, request: VisionRequest) -> ImageToAssetBriefProviderOutput:
        return ImageToAssetBriefProviderOutput(
            asset_brief=AssetBriefDraft(
                name="Mock image-derived asset brief",
                category="unclassified reference",
                purpose=f"Planning response for task: {request.task}",
                silhouette="Not inferred from image content by the mock provider.",
                materials=("Materials require manual review or a configured vision provider.",),
                scale_reference="Scale was not inferred from image content.",
                style_notes=("Style was not inferred from image content.",),
                gameplay_constraints=("Gameplay constraints require human definition.",),
                engine_constraints=("Engine constraints require project-specific validation.",),
                texture_requirements=("Texture requirements require manual review.",),
                lod_notes=("LOD strategy requires geometry and engine context.",),
                collision_notes=("Collision requirements were not inferred.",),
                animation_notes=("Animation requirements were not inferred.",),
                validation_checklist=(
                    "Review source image and task manually.",
                    "Replace mock assumptions before production use.",
                    "Validate scale, materials, collision, and animation in the target engine.",
                ),
            ),
            inferred_constraints=("No constraints were inferred from image content.",),
            engine_notes=("No engine-ready asset or import plan was created.",),
            modeling_notes=("No geometry was inferred or generated.",),
            texture_notes=("No texture was inferred or generated.",),
            collision_notes=("No collision geometry was inferred or generated.",),
            animation_notes=("No rig or animation was inferred or generated.",),
            risks=("The mock asset brief is task-derived scaffolding, not visual analysis.",),
            limitations=(
                "MockMultimodalProvider does not inspect semantic image content.",
                "Human review or a configured vision provider is required.",
            ),
        )

    def build_image_prompt(self, request: ImageGenerationRequest) -> ImagePromptProviderOutput:
        style = ", ".join(request.style_notes) if request.style_notes else "purpose-driven concept art"
        use_case = request.target_use_case or "concept exploration"
        brief = f" Brief: {request.brief.strip()}." if request.brief and request.brief.strip() else ""
        return ImagePromptProviderOutput(
            prompt=f"{request.task.strip()}. Intended use: {use_case}.{brief}",
            negative_prompt="unreadable focal point, accidental text, unclear silhouette",
            style=style,
            composition="single readable focal subject with clear foreground and background separation",
            lighting="controlled cinematic lighting that preserves subject readability",
            camera="neutral concept-art camera selected for clear inspection",
            materials=("materials must be specified or validated before production",),
            constraints=(
                "prompt specification only",
                "no binary image generated by RealForge",
                "human review required before use with an image model",
            ),
            intended_tool=None,
            risks=("Generated results from future image tools may not match this specification.",),
        )

    def build_image_job(
        self,
        request: ImageWorkflowRequest,
        prompt_spec: ImagePromptSpec,
    ) -> ImageJobProviderOutput:
        return ImageJobProviderOutput(
            title=f"Image workflow: {request.task}",
            negative_prompt_strategy=(
                "Apply the shared negative prompt to every candidate.",
                "Reject outputs that violate safety or intended-use constraints.",
                "Add only evidence-based exclusions after each reviewed round.",
            ),
            iteration_plan=ImageIterationPlan(
                rounds=3,
                evaluation_criteria=(
                    "task alignment",
                    "readable composition and silhouette",
                    "target-style consistency",
                    "absence of reject criteria",
                ),
                refinement_prompts=(
                    "Round 1: establish composition and subject readability.",
                    "Round 2: refine style, lighting, and materials from reviewed candidates.",
                    "Round 3: resolve remaining defects without changing the approved direction.",
                ),
                reject_criteria=(
                    "unreadable focal subject",
                    "unrequested text or logos",
                    "unsafe or out-of-scope content",
                    "material deviation from the approved brief",
                ),
                human_review_required=True,
            ),
            selection_criteria=(
                f"fits the intended use: {request.intended_use}",
                f"supports the target aspect ratio: {request.aspect_ratio}",
                "preserves a clear focal hierarchy",
                "can be reviewed against documented provenance",
            ),
            safety_notes=(
                "Provider output is untrusted planning data.",
                "No binary image is generated by this workflow.",
                "Human review is required before submitting prompts to an image model.",
            ),
        )

    def build_prompt_pack(
        self,
        request: ImageWorkflowRequest,
        prompt_spec: ImagePromptSpec,
    ) -> PromptPackProviderOutput:
        base = prompt_spec.prompt
        return PromptPackProviderOutput(
            title=f"Prompt pack: {request.task}",
            variants=(
                f"{base} Emphasize a wide environmental composition.",
                f"{base} Emphasize the primary subject and material readability.",
                f"{base} Emphasize production-neutral shape and lighting exploration.",
            ),
            style_tokens=(request.target_style, prompt_spec.style),
            camera_notes=(prompt_spec.camera, f"Frame for aspect ratio {request.aspect_ratio}."),
            lighting_notes=(prompt_spec.lighting,),
            material_notes=prompt_spec.materials,
            composition_notes=(prompt_spec.composition,),
            engine_use_notes=(
                f"Review against intended use: {request.intended_use}.",
                "Treat outputs as references, not engine-ready assets.",
            ),
            risks=prompt_spec.risks
            + ("Future image-model output may introduce unrequested details or text.",),
        )
