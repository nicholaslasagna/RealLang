# RealForge Workbench UI prototype

This directory contains the first static interactive RealForge Workbench
prototype. It follows the approved near-black cockpit direction while remaining
offline-safe and disconnected from destructive backend actions.

## Run

```bash
cd workbench
npm run dev
```

Then open `http://localhost:4173`. No package installation is required. The
prototype uses browser-native HTML, CSS, and JavaScript plus a repository-owned
Lucide icon subset.

## Validate

```bash
npm run check
npm test
npm run build
```

`npm run build` creates an ignored static copy under `workbench/dist/`.

## Safety boundary

- All data is static and mocked.
- Command palette selections update display state only.
- Workbench submission stages text locally in browser memory only.
- Staff mode is a visual preview; the backend remains `STAFF OFF`.
- No fetch, WebSocket, command execution, file write, apply, commit, or merge
  integration exists.
- Future CLI/report JSON integration must preserve the same explicit trust and
  approval boundaries.
