from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from realforge.workspace import assert_path_in_workspace


MULTIMODAL_CATEGORIES = frozenset(
    {
        "vision",
        "vision_understanding",
        "vision_comparisons",
        "vision_asset_briefs",
        "image_prompts",
        "image_jobs",
        "prompt_packs",
        "iterations",
        "reference_boards",
    }
)


def report_to_dict(report: object) -> dict[str, object]:
    return asdict(report)  # type: ignore[arg-type]


def format_report_json(report: object) -> str:
    return json.dumps(report_to_dict(report), indent=2, sort_keys=True)


def write_multimodal_report(
    report: object,
    workspace_root: Path,
    *,
    category: str,
) -> Path:
    if category not in MULTIMODAL_CATEGORIES:
        raise ValueError(f"unsupported multimodal report category: {category}")
    root = workspace_root.resolve()
    storage_root = (root / ".realforge" / "multimodal" / category).resolve()
    report_id = str(getattr(report, "id"))
    path = (storage_root / f"{report_id}.json").resolve()
    assert_path_in_workspace(path, root)
    try:
        path.relative_to(storage_root)
    except ValueError as err:
        raise ValueError(f"multimodal report write refused outside {storage_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_report_json(report) + "\n", encoding="utf-8")
    return path
