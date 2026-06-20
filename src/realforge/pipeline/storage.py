from __future__ import annotations

import json
from pathlib import Path

from realforge.pipeline.models import pipeline_to_dict
from realforge.pipeline.validation import PipelineError
from realforge.workspace import assert_path_in_workspace


PIPELINE_CATEGORIES = frozenset({"assets", "unreal", "blender", "engines"})


def format_pipeline_json(report: object) -> str:
    return json.dumps(pipeline_to_dict(report), indent=2, sort_keys=True)


def write_pipeline_report(report: object, workspace_root: Path, *, category: str) -> Path:
    if category not in PIPELINE_CATEGORIES:
        raise PipelineError(f"unsupported pipeline report category: {category}")
    root = workspace_root.resolve()
    storage_root = (root / ".realforge" / "pipelines" / category).resolve()
    report_id = str(getattr(report, "id"))
    path = (storage_root / f"{report_id}.json").resolve()
    assert_path_in_workspace(path, root)
    try:
        path.relative_to(storage_root)
    except ValueError as err:
        raise PipelineError(f"pipeline report write refused outside {storage_root}: {path}") from err
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_pipeline_json(report) + "\n", encoding="utf-8")
    return path
