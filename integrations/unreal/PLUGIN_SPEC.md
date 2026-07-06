# RealForge Unreal plugin — future architecture spec

Status: **future work / design doc**. Nothing here is compiled or editor-verified yet.
The current shipping surface is the RealForge Engine cockpit (plans + reviewable scripts)
plus the `realforge_ue.py` helper module. This spec defines the one-click in-editor path
so it can be built and tested **inside Unreal** without re-deciding the safety model.

## 1. Shape
An **Editor Utility Widget** (`WBP_RealForge`) inside a small content-only plugin
(`RealForgeBridge`), backed by a Python bridge module (`realforge_bridge.py`) that shells
out to the **local** `realforge` CLI. No C++ required for v1; no network access — the
bridge talks to the same local CLI RealForge's desktop app uses.

```
Editor Utility Widget (UMG)
  └─ realforge_bridge.py  (editor Python)
       └─ subprocess: local `realforge` CLI (fixed argv, stdin prompt, JSON out)
            └─ user-configured local model (OpenAI-compatible; local_untrusted)
```

## 2. Widget design
- One template dropdown (mirrors the cockpit's eight templates) + one brief text box.
- **Draft** button → work package renders in a read-only scrollbox with sections.
- **Review & Run** flow: the Editor Python section renders in a diff-style view with an
  explicit "I reviewed this script" checkbox → **Dry run** → log review → **Apply**.
- Persistent footer: `LOCAL UNTRUSTED · dry-run first · undo-able · nothing auto-runs`.

## 3. Request/response schema
Request (stdin → CLI, mirrors the desktop sandbox: prompt + acknowledgement only):
```json
{ "template": "assets", "brief": "...", "approvalAcknowledged": true }
```
Response (CLI stdout, sanitized exactly like the desktop bridge):
```json
{ "ok": true, "status": "pass", "untrusted_output": true,
  "sections": { "summary": "...", "editor_python": "...", "validation": "..." } }
```
No model name, endpoint, key, or private path ever appears in the response or in any
file the plugin writes.

## 4. Approval model
Same two-gate model as RealForge: (1) explicit approval to *send* the brief to the local
model; (2) explicit reviewed-script approval to *execute* anything. Dry run does not
bypass gate 2 — it is gate 2's first half.

## 5. Dry-run mode
All execution goes through `realforge_ue.py` helpers, which already implement
`DRY_RUN` log-only behavior. The widget's Dry run button executes the reviewed script
with `DRY_RUN = True`; Apply re-runs it with `DRY_RUN = False`.

## 6. Undo / transaction strategy
Wrap Apply in a single editor transaction so one **Ctrl+Z** reverts the batch:
```python
with unreal.ScopedEditorTransaction("RealForge: <template> apply"):  # VERIFY: API name per version
    ...
```
Asset imports are not fully transactional in all versions — the widget must list created
asset paths in the log so a manual revert is one selection + delete.

## 7. Asset write boundary
- Writes allowed **only under** `/Game/` paths named in the reviewed script, plus an
  optional project allowlist (§9).
- Never touch `Config/`, `Source/`, `.uproject`, or plugin folders.
- No deletes in v1. Overwrites require `replace=True` visible in the reviewed script.

## 8. Logging
Every action logs `[RealForge] ...` to the Output Log (already the `realforge_ue.py`
convention): dry-run intents, applied actions, created asset paths, and warnings for any
`# VERIFY:` fallback taken.

## 9. Project allowlist
A per-project `Config/RealForge.ini` (checked into the game repo, no secrets) listing
the `/Game/` roots the bridge may write to, e.g. `AllowedRoots=/Game/Props,/Game/RF`.
The bridge refuses paths outside the allowlist even if a reviewed script names them.

## 10. Privacy rules for project files
No model names (private or upstream), endpoints, API keys, weights, or machine-specific
private paths in: plugin content, generated scripts, logs committed to the repo, or
`Config/RealForge.ini`. The bridge reads provider config from the user's home
(`~/.realforge.local.toml`) exactly like the desktop app — never from the UE project.

## 11. Packaging & testing plan
1. Develop as a project plugin (`Plugins/RealForgeBridge/`) in a throwaway UE project.
2. Test matrix: widget renders → draft round-trip → dry run logs → apply + undo →
   allowlist refusal → CLI-missing error path (clear message, no crash).
3. Package as a content-only plugin zip; installation = drop into `Plugins/`.
4. Only after the matrix passes inside the editor may docs claim in-editor execution.

## 12. UE 5.8 verification checklist (plugin layer)
- [ ] Editor Utility Widget opens and renders on 5.8
- [ ] Python `subprocess` spawn of the local CLI works from editor Python on macOS
- [ ] `ScopedEditorTransaction` API name/behavior confirmed on 5.8 (`# VERIFY:`)
- [ ] Undo reverts an applied blockout batch in one step
- [ ] `realforge_ue.py` §10 checklist (README) passes on 5.8 first
- [ ] Allowlist refusal path verified with a path outside `AllowedRoots`
