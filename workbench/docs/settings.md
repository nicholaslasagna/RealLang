# Workbench settings (0.35)

Settings is organized like a normal desktop app preferences area — calm categories,
progressive disclosure for technical detail, and unchanged safety boundaries.

## Category groups

| Group | Sections |
|-------|----------|
| **App** | General · Workspace |
| **Local model** | Provider / Local Model |
| **System** | Updates · Safety / Doctor |
| **Boundaries** | Permissions · Research / Network |
| **Advanced** | Staff · Scheduler · Benchmarks · Creative · Engine |

Route IDs and section content are unchanged. Values remain read-only in the prototype.

## Provider / Local Model layout

1. **Status summary** — readiness badge row + optional checklist (`local_untrusted`).
2. **Safe actions** — fixed smoke check and private chat sandbox (approval-gated).
3. **Advanced details** (collapsed) — sanitized status grid, image provider metadata,
   and disconnected-boundary matrix. Image execution stays disabled.

No new provider IPC. Private model identity remains in gitignored home config only.

## General / About

- Compact About card with quick runtime badges.
- Full diagnostics grid behind **System diagnostics**; **Copy diagnostics** stays visible.
- Runtime indicator behind **Runtime details**.

## Updates

- Summary badges and check/install actions stay visible.
- Configuration grid, safety notes, release readiness checklist, and release notes
  are behind **Update configuration & release readiness**.
- Install remains disabled unless a verified signed update exists.

## Boundaries

- **Active safety boundaries** strip is collapsed by default on every settings page.
- Security scans, update install, and provider tools remain read-only / approval-gated.
- Output stays `local_untrusted`.
