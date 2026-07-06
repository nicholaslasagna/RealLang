"""RealForge Unreal Engine 5.x editor helpers — non-destructive, human-run.

Run inside the Unreal Editor (Python Editor Script Plugin enabled). These are the
stable primitives the RealForge Engine cockpit's generated scripts target. Nothing
here runs automatically: you paste and run code after reviewing the generated plan,
exactly like the rest of RealForge's LOCAL UNTRUSTED workflow.

Design rules:
  * Non-destructive by default — nothing deletes assets; overwrite requires an
    explicit ``replace=True``.
  * ``DRY_RUN = True`` (module flag) makes mutating helpers log what they WOULD
    do without touching the project. Set ``realforge_ue.DRY_RUN = False`` after
    reviewing a dry pass.
  * Structured logging — every action logs ``[RealForge] ...`` to the Output Log.
  * Targets stable UE 5.x ``unreal`` APIs. Lines marked ``# VERIFY:`` are
    version-sensitive (notably Nanite and editor subsystems) — confirm against
    your installed engine version (e.g. 5.8) before relying on them.

Static checks (syntax) run outside Unreal via ``python -m py_compile``; importing
or calling helpers requires the editor's ``unreal`` runtime.
"""

from __future__ import annotations

try:
    import unreal  # provided by the Unreal Editor Python runtime
except ImportError as exc:  # pragma: no cover - only importable inside UE
    raise RuntimeError("realforge_ue must run inside the Unreal Editor Python console.") from exc

# Flip to False after reviewing a dry pass. While True, mutating helpers only log.
DRY_RUN = True


def _log(message: str) -> None:
    unreal.log(f"[RealForge] {message}")


def _warn(message: str) -> None:
    unreal.log_warning(f"[RealForge] {message}")


def _dry(message: str) -> bool:
    """Log-and-skip guard used by every mutating helper while DRY_RUN is on."""
    if DRY_RUN:
        _log(f"DRY RUN — would {message} (set realforge_ue.DRY_RUN = False to apply)")
        return True
    return False


# --- content folders --------------------------------------------------------------


def ensure_folder(game_path: str) -> str:
    """Create a /Game content folder if it does not exist. Returns the path."""
    if not game_path.startswith("/Game"):
        raise ValueError("content path must start with /Game")
    if unreal.EditorAssetLibrary.does_directory_exist(game_path):
        return game_path
    if _dry(f"create content folder {game_path}"):
        return game_path
    unreal.EditorAssetLibrary.make_directory(game_path)
    _log(f"created content folder {game_path}")
    return game_path


def ensure_folders(game_paths: list[str]) -> list[str]:
    """Create several /Game content folders (e.g. a project folder skeleton)."""
    return [ensure_folder(path) for path in game_paths]


# --- asset import -----------------------------------------------------------------


def import_meshes(
    source_files: list[str],
    dest_path: str,
    *,
    nanite: bool = False,
    replace: bool = False,
    save: bool = True,
) -> list[str]:
    """Batch-import asset files into `dest_path`. Non-destructive unless replace=True.

    Returns imported asset object paths. Review the plan before running.
    """
    ensure_folder(dest_path)
    if _dry(f"import {len(source_files)} file(s) into {dest_path} (replace={replace})"):
        return []
    tasks = []
    for filename in source_files:
        task = unreal.AssetImportTask()
        task.filename = filename
        task.destination_path = dest_path
        task.automated = True          # no modal dialogs
        task.replace_existing = replace
        task.save = save
        tasks.append(task)

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    asset_tools.import_asset_tasks(tasks)

    imported: list[str] = []
    for task in tasks:
        for obj_path in (task.get_editor_property("imported_object_paths") or []):
            imported.append(obj_path)
            if nanite:
                _try_enable_nanite(obj_path)
    _log(f"imported {len(imported)} asset(s) into {dest_path}")
    return imported


def _try_enable_nanite(static_mesh_path: str) -> None:
    """Enable Nanite on a static mesh. VERIFY: Nanite property names vary by UE version."""
    asset = unreal.EditorAssetLibrary.load_asset(static_mesh_path)
    if not isinstance(asset, unreal.StaticMesh):
        return
    if _dry(f"enable Nanite on {static_mesh_path}"):
        return
    try:
        # VERIFY (UE version-sensitive): confirm `nanite_settings` / `MeshNaniteSettings`
        # against your engine build; some releases expose this via build settings instead.
        settings = unreal.MeshNaniteSettings()
        settings.set_editor_property("enabled", True)
        asset.set_editor_property("nanite_settings", settings)
        unreal.EditorAssetLibrary.save_asset(static_mesh_path)
        _log(f"enabled Nanite on {static_mesh_path}")
    except Exception as err:  # noqa: BLE001 - report, never crash the editor session
        _warn(f"could not set Nanite on {static_mesh_path}: {err}")


# --- selection & metadata -----------------------------------------------------------


def selected_asset_paths() -> list[str]:
    """Object paths of the assets currently selected in the Content Browser."""
    util = unreal.EditorUtilityLibrary  # VERIFY: needs the Editor Scripting Utilities plugin
    return [a.get_path_name() for a in util.get_selected_assets()]


def selected_actors() -> list["unreal.Actor"]:
    """Actors currently selected in the level editor viewport."""
    # VERIFY: EditorActorSubsystem is the modern path; older builds used EditorLevelLibrary.
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    return list(subsystem.get_selected_level_actors())


def add_metadata_tags(asset_paths: list[str], tags: dict[str, str]) -> None:
    """Stamp key/value metadata tags on assets (searchable, reversible, non-destructive)."""
    for path in asset_paths:
        if _dry(f"tag {path} with {tags}"):
            continue
        for key, value in tags.items():
            unreal.EditorAssetLibrary.set_metadata_tag(path, key, value)
        unreal.EditorAssetLibrary.save_asset(path)
        _log(f"tagged {path} with {len(tags)} tag(s)")


# --- level organization & blockout ---------------------------------------------------


def set_outliner_folder(actors: list["unreal.Actor"], folder: str) -> None:
    """Move actors into a World Outliner folder (organization only; nothing moves in-world)."""
    for actor in actors:
        if _dry(f"move '{actor.get_actor_label()}' to outliner folder '{folder}'"):
            continue
        actor.set_folder_path(unreal.Name(folder))
    _log(f"outliner folder '{folder}' set on {len(actors)} actor(s)")


def place_placeholder_actors(
    positions: list[tuple[float, float, float]],
    *,
    label_prefix: str = "RF_Blockout",
    outliner_folder: str = "RealForge/Blockout",
) -> list["unreal.Actor"]:
    """Spawn empty placeholder actors at positions for blockout planning.

    Uses plain Actors (no geometry) so a reviewed pass can replace them with real
    content; they are trivially selectable and deletable by label prefix.
    """
    if _dry(f"place {len(positions)} placeholder actor(s) under '{outliner_folder}'"):
        return []
    # VERIFY: EditorActorSubsystem availability (modern path) vs EditorLevelLibrary.
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    placed = []
    for index, (x, y, z) in enumerate(positions):
        actor = subsystem.spawn_actor_from_class(unreal.Actor, unreal.Vector(x, y, z))
        if actor is None:
            _warn(f"could not spawn placeholder at ({x}, {y}, {z})")
            continue
        actor.set_actor_label(f"{label_prefix}_{index:02d}")
        actor.set_folder_path(unreal.Name(outliner_folder))
        placed.append(actor)
    _log(f"placed {len(placed)} placeholder actor(s) in '{outliner_folder}'")
    return placed


# --- saving ---------------------------------------------------------------------------


def save_selected() -> None:
    """Save only the assets currently selected in the Content Browser."""
    for path in selected_asset_paths():
        if _dry(f"save {path}"):
            continue
        unreal.EditorAssetLibrary.save_asset(path, only_if_is_dirty=True)
        _log(f"saved {path}")


def save_dirty() -> None:
    """Save all unsaved /Game assets (call after a reviewed batch of changes)."""
    if _dry("save all dirty assets under /Game"):
        return
    unreal.EditorAssetLibrary.save_directory("/Game", only_if_is_dirty=True, recursive=True)
    _log("saved dirty assets under /Game")

# This module is UE-only glue (it requires the editor's `unreal` runtime), so it has
# no self-check that runs outside Unreal. Syntax-check with `python -m py_compile`;
# behavior must be tested inside the Unreal Editor.
