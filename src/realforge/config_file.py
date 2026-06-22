from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


class ConfigFileError(Exception):
    pass


@dataclass(frozen=True)
class ModelSettings:
    provider: str = "mock"
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    display_name: str | None = None
    trust: str = "local_untrusted"


@dataclass(frozen=True)
class StaffSettings:
    enabled: bool = False


@dataclass(frozen=True)
class ImprovementSettings:
    channel: str = "stable"
    max_budget: int = 1
    require_eval_pass: bool = True
    minimum_eval_score: float = 0.75
    allow_research: bool = False
    allow_patch_proposals: bool = True
    auto_apply: bool = False
    auto_commit: bool = False


IMPROVEMENT_CHANNELS = frozenset({"stable", "experimental"})
SCHEDULER_MODES = frozenset({"manual", "recurring"})
MIN_IMPROVEMENT_BUDGET = 1
MAX_IMPROVEMENT_BUDGET = 3
MIN_SCHEDULER_RUNS = 1
MAX_SCHEDULER_RUNS = 3
DEFAULT_SCHEDULER_AREAS = ("tests", "docs", "realforge")


@dataclass(frozen=True)
class SchedulerSettings:
    enabled: bool = False
    mode: str = "manual"
    max_runs_per_invocation: int = 1
    areas: tuple[str, ...] = DEFAULT_SCHEDULER_AREAS
    provider: str = "mock"
    require_leaderboard_pass: bool = True
    minimum_benchmark_score: float = 0.75
    create_update_bundle: bool = True
    auto_apply: bool = False
    auto_commit: bool = False


def find_config_file(workspace_root: Path) -> Path | None:
    root = workspace_root.resolve()
    path = root / ".realforge.toml"
    if not path.is_file():
        return None
    try:
        path.resolve().relative_to(root)
    except ValueError as err:
        raise ConfigFileError(f"config file must live inside workspace root: {path}") from err
    return path


def load_model_settings(path: Path, *, workspace_root: Path) -> ModelSettings:
    try:
        path.resolve().relative_to(workspace_root.resolve())
    except ValueError as err:
        raise ConfigFileError(
            f"refusing to load config outside workspace root: {path}"
        ) from err

    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as err:
        raise ConfigFileError(f"invalid TOML in {path}: {err}") from err

    section = data.get("model")
    if section is None:
        return ModelSettings()

    if not isinstance(section, dict):
        raise ConfigFileError("[model] must be a table")

    provider = section.get("provider", "mock")
    if not isinstance(provider, str) or not provider.strip():
        raise ConfigFileError("[model].provider must be a non-empty string")

    model = section.get("model")
    if model is not None and not isinstance(model, str):
        raise ConfigFileError("[model].model must be a string")

    base_url = section.get("base_url")
    if base_url is not None and not isinstance(base_url, str):
        raise ConfigFileError("[model].base_url must be a string")

    normalized_provider = provider.strip()
    normalized_model = model.strip() if isinstance(model, str) and model.strip() else None
    normalized_base_url = (
        base_url.strip() if isinstance(base_url, str) and base_url.strip() else None
    )

    if normalized_base_url and normalized_base_url.startswith("file:"):
        raise ConfigFileError("[model].base_url must be an HTTP(S) endpoint, not a file URL")

    return ModelSettings(
        provider=normalized_provider,
        model=normalized_model,
        base_url=normalized_base_url,
    )


def _parse_bool(value: object, *, field: str) -> bool:
    if isinstance(value, bool):
        return value
    raise ConfigFileError(f"{field} must be a boolean")


def _parse_staff_settings(section: object) -> StaffSettings:
    if section is None:
        return StaffSettings()
    if not isinstance(section, dict):
        raise ConfigFileError("[staff] must be a table")
    enabled = section.get("enabled", False)
    return StaffSettings(enabled=_parse_bool(enabled, field="[staff].enabled"))


def _parse_improvement_settings(section: object) -> ImprovementSettings:
    if section is None:
        return ImprovementSettings()
    if not isinstance(section, dict):
        raise ConfigFileError("[improvement] must be a table")

    channel = section.get("channel", "stable")
    if not isinstance(channel, str) or channel.strip() not in IMPROVEMENT_CHANNELS:
        raise ConfigFileError("[improvement].channel must be 'stable' or 'experimental'")

    max_budget = section.get("max_budget", 1)
    if not isinstance(max_budget, int) or max_budget < MIN_IMPROVEMENT_BUDGET or max_budget > MAX_IMPROVEMENT_BUDGET:
        raise ConfigFileError("[improvement].max_budget must be an integer from 1 to 3")

    minimum_eval_score = section.get("minimum_eval_score", 0.75)
    if not isinstance(minimum_eval_score, (int, float)):
        raise ConfigFileError("[improvement].minimum_eval_score must be a number")
    minimum_eval_score = float(minimum_eval_score)
    if minimum_eval_score < 0.0 or minimum_eval_score > 1.0:
        raise ConfigFileError("[improvement].minimum_eval_score must be between 0.0 and 1.0")

    return ImprovementSettings(
        channel=channel.strip(),
        max_budget=max_budget,
        require_eval_pass=_parse_bool(section.get("require_eval_pass", True), field="[improvement].require_eval_pass"),
        minimum_eval_score=minimum_eval_score,
        allow_research=_parse_bool(section.get("allow_research", False), field="[improvement].allow_research"),
        allow_patch_proposals=_parse_bool(
            section.get("allow_patch_proposals", True),
            field="[improvement].allow_patch_proposals",
        ),
        auto_apply=_parse_bool(section.get("auto_apply", False), field="[improvement].auto_apply"),
        auto_commit=_parse_bool(section.get("auto_commit", False), field="[improvement].auto_commit"),
    )


def _parse_string_list(value: object, *, field: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ConfigFileError(f"{field} must be a list of strings")
    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ConfigFileError(f"{field} must contain non-empty strings")
        items.append(item.strip())
    return tuple(items)


def _parse_scheduler_settings(section: object) -> SchedulerSettings:
    if section is None:
        return SchedulerSettings()
    if not isinstance(section, dict):
        raise ConfigFileError("[scheduler] must be a table")

    mode = section.get("mode", "manual")
    if not isinstance(mode, str) or mode.strip() not in SCHEDULER_MODES:
        raise ConfigFileError("[scheduler].mode must be 'manual' or 'recurring'")

    max_runs = section.get("max_runs_per_invocation", 1)
    if not isinstance(max_runs, int) or max_runs < MIN_SCHEDULER_RUNS or max_runs > MAX_SCHEDULER_RUNS:
        raise ConfigFileError("[scheduler].max_runs_per_invocation must be an integer from 1 to 3")

    provider = section.get("provider", "mock")
    if not isinstance(provider, str) or not provider.strip():
        raise ConfigFileError("[scheduler].provider must be a non-empty string")

    minimum_benchmark_score = section.get("minimum_benchmark_score", 0.75)
    if not isinstance(minimum_benchmark_score, (int, float)):
        raise ConfigFileError("[scheduler].minimum_benchmark_score must be a number")
    minimum_benchmark_score = float(minimum_benchmark_score)
    if minimum_benchmark_score < 0.0 or minimum_benchmark_score > 1.0:
        raise ConfigFileError("[scheduler].minimum_benchmark_score must be between 0.0 and 1.0")

    areas = _parse_string_list(section.get("areas"), field="[scheduler].areas")
    if not areas:
        areas = DEFAULT_SCHEDULER_AREAS

    return SchedulerSettings(
        enabled=_parse_bool(section.get("enabled", False), field="[scheduler].enabled"),
        mode=mode.strip(),
        max_runs_per_invocation=max_runs,
        areas=areas,
        provider=provider.strip(),
        require_leaderboard_pass=_parse_bool(
            section.get("require_leaderboard_pass", True),
            field="[scheduler].require_leaderboard_pass",
        ),
        minimum_benchmark_score=minimum_benchmark_score,
        create_update_bundle=_parse_bool(
            section.get("create_update_bundle", True),
            field="[scheduler].create_update_bundle",
        ),
        auto_apply=_parse_bool(section.get("auto_apply", False), field="[scheduler].auto_apply"),
        auto_commit=_parse_bool(section.get("auto_commit", False), field="[scheduler].auto_commit"),
    )


def load_realforge_settings(path: Path, *, workspace_root: Path) -> tuple[ModelSettings, StaffSettings, ImprovementSettings, SchedulerSettings]:
    try:
        path.resolve().relative_to(workspace_root.resolve())
    except ValueError as err:
        raise ConfigFileError(
            f"refusing to load config outside workspace root: {path}"
        ) from err

    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as err:
        raise ConfigFileError(f"invalid TOML in {path}: {err}") from err

    model = load_model_settings(path, workspace_root=workspace_root)
    staff = _parse_staff_settings(data.get("staff"))
    improvement = _parse_improvement_settings(data.get("improvement"))
    scheduler = _parse_scheduler_settings(data.get("scheduler"))
    return model, staff, improvement, scheduler
