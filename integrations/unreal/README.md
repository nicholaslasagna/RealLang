# RealForge ↔ Unreal Engine — integration guide

RealForge's Engine tab is an **Unreal Production Cockpit**: pick a task template, describe
the task, and your **user-configured local model** streams back a reviewable Unreal work
package. This folder holds the Unreal-side toolkit and the future plugin spec.

## 1. What the RealForge Unreal Assistant does
- **Eight task templates**, each shaping the model's answer for the discipline:
  Gameplay System · UMG/UI · Level Blockout · Asset Import · Blueprint Architecture ·
  Cinematic/Camera · Optimization/Validation · Custom Task.
- Every answer arrives as a **structured work package**: Summary, Assumptions,
  Architecture, Asset & Folder plan, **Editor Python** (when useful), Manual editor
  steps, Validation checklist, Risks & version notes.
- Prompts force **Unreal Engine 5.x** stable APIs, non-destructive behavior, and
  `# VERIFY:` markers on version-sensitive calls.
- Output is **LOCAL UNTRUSTED**, approval-gated, bounded, session-only. RealForge
  launches nothing and writes no files.

## 2. What it does not do (yet)
- It does **not** execute anything inside Unreal. You review and paste.
- It is **not** a compiled Unreal plugin; `realforge_ue.py` is an editor-side helper
  module you install and test in your project.
- No claim of UE 5.8 API verification — see the checklist in §10.

## 3. The safe copy-paste workflow
1. RealForge → **Engine** → pick a template → describe the task → **Draft UE plan**.
2. **Read the whole work package.** The script is untrusted until you review it.
3. In Unreal: **Tools → Execute Python Script**, or the Output Log **Cmd → Python** console.
4. Keep `realforge_ue.DRY_RUN = True` for the first run — helpers log what they *would*
   do. Flip to `False` only after the dry pass looks right.

## 4. Installing `realforge_ue.py`
1. Enable **Edit → Plugins → Python Editor Script Plugin** (restart the editor).
2. Copy `realforge_ue.py` into your project's `Content/Python/` folder (create it if missing).
3. In the UE Python console:
   ```python
   import realforge_ue as rf
   rf.ensure_folders(["/Game/Props", "/Game/Materials"])   # logs only while DRY_RUN
   rf.DRY_RUN = False                                       # after reviewing the dry pass
   ```

## 5. Example — asset import plan
Template: **Asset Import**. Brief: *"40 FBX props into /Game/Props with a shared master
material and instances."* Typical reviewed result:
```python
import realforge_ue as rf
rf.ensure_folders(["/Game/Props/Meshes", "/Game/Props/Materials"])
rf.DRY_RUN = False
imported = rf.import_meshes([...fbx paths...], "/Game/Props/Meshes", nanite=True)
rf.add_metadata_tags(imported, {"RF.Batch": "props-2026-07", "RF.Source": "outsource-dropA"})
rf.save_selected()
```

## 6. Example — level blockout plan
Template: **Level Blockout**. The work package plans zones/landmarks; the script places
labelled, folder-organized placeholder actors you replace during a real pass:
```python
rf.place_placeholder_actors([(0,0,0), (2500,0,0), (5000,1200,300)],
                            label_prefix="RF_Encounter", outliner_folder="RealForge/Blockout")
```

## 7. Example — UMG plan
Template: **UMG / UI**. The package returns a widget tree, bindings vs event-driven
updates, state flow, gamepad navigation notes, and an implementation checklist. UMG work
is mostly manual-editor steps — the checklist and tree are the deliverable; scripting is
optional scaffolding (folders, naming).

## 8. Future plugin architecture
See [PLUGIN_SPEC.md](PLUGIN_SPEC.md): an Editor Utility Widget that talks to the local
RealForge CLI, with in-editor review, dry-run, transactions/undo, and a strict write
boundary. Build and test it inside Unreal — that half cannot be verified from RealForge.

## 9. Unreal Engine 5.x compatibility notes
- Helpers target **stable UE 5.x** APIs: `AssetImportTask`, `EditorAssetLibrary`,
  `EditorUtilityLibrary`, `EditorActorSubsystem`.
- `# VERIFY:` marks the spots that drift between engine releases — **Nanite settings**
  (property names have changed across releases) and **editor subsystems vs the older
  `EditorLevelLibrary`** path.
- If the editor logs an unknown-property/attribute error, fix the flagged line for your
  build; everything else is standard.

## 10. UE 5.8 verification checklist
Run once inside your 5.8 editor before trusting the toolkit:
- [ ] `import realforge_ue as rf` loads without errors (Python plugin enabled)
- [ ] `rf.ensure_folder("/Game/RFVerify")` creates the folder (after `DRY_RUN = False`)
- [ ] `rf.import_meshes([...one test FBX...], "/Game/RFVerify")` imports and returns a path
- [ ] `rf._try_enable_nanite(path)` sets Nanite without warnings — else fix the `# VERIFY:` line
- [ ] `rf.selected_asset_paths()` / `rf.selected_actors()` reflect your selection
- [ ] `rf.place_placeholder_actors([(0,0,0)])` spawns a labelled actor in the outliner folder
- [ ] `rf.add_metadata_tags`, `rf.save_selected`, `rf.save_dirty` behave as logged
- [ ] Delete `/Game/RFVerify` and the placeholder actor when done

## 11. Security & safety model (matches RealForge)
- **Human-in-the-loop:** nothing runs until you paste and run it. No auto-execution.
- **Non-destructive defaults:** no delete helpers; overwrite requires `replace=True`;
  `DRY_RUN` starts `True`.
- **Untrusted output:** generated scripts are LOCAL UNTRUSTED — read every line first.
- **No secrets:** no model names, endpoints, keys, or private paths belong in project
  files or generated scripts.
