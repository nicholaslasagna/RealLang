# Local bridge boundary (planned — Workbench 0.5+)

Strict integration layer between the React UI and RealForge CLI / Tauri runtime on
**macOS and Windows**. The UI never spawns subprocesses directly.

## Today (0.4)

- Allowlist: `src/data/import/cli-report-sources.js`
- Dev helper: `tools/realforge-report-bridge.mjs` (Node only; never imported by browser UI)

## Rules (non-negotiable)

| Rule | Detail |
|------|--------|
| Fixed `argv` only | No shell strings, no `cmd.exe /c`, no `sh -c`, no user-supplied arguments |
| Fixed allowlist | Adding a command requires updating `cli-report-sources` and security review |
| Read-only (0.4–0.6) | `capabilities --json`, `slash --json`, `settings doctor --json` |
| Timeout / max output | 15s default, 2MB stdout cap (mirror in Tauri Rust spawn) |
| Sanitized environment | Minimal fixed env; no accidental secret inheritance |
| Structured errors | `BridgeResult` with codes — never opaque failures in UI |
| Output untrusted | All JSON through report import adapters |
| Write commands | Deferred until approval-gated milestone; denylist apply/scheduler/staff |

## Cross-platform paths

- Use `path.join` / `path.resolve` (Node) or `std::path` (Rust) — never manual `/` concatenation in shared code
- Workspace roots from native OS dialogs; validated on bridge side
- Executable discovery: bundled sidecar or venv `Scripts\python.exe` (Win) / `bin/python` (macOS) — not user paths
- Display commands (`realforge capabilities --json`) are labels; execution uses frozen `argv`
- Unix-only dev assumptions (e.g. `.venv/bin/python`) stay in `tools/` until Rust bridge ships

## Future (0.6+ Tauri)

```typescript
// src/bridge/local-bridge.ts
export interface LocalBridge {
  listReportSources(): ReadonlyReportSourceMeta[];
  loadReportSource(id: string): Promise<BridgeResult<unknown>>;
}
```

Rust `src-tauri/src/bridge/spawn.rs` implements the same contract as the Node dev bridge.
IPC is the production trust boundary — not localhost HTTP.

See [react-migration-plan.md](../../docs/react-migration-plan.md) for packaging, UX, and validation expectations.
