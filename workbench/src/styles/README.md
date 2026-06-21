# Workbench design tokens (0.5c)

Design tokens are split into focused files imported by `tokens.css`:

| File | Contents |
|------|----------|
| `tokens-colors.css` | Palette, typography |
| `tokens-layout.css` | Sidebar, topbar, rail dimensions |
| `tokens-status-badges.css` | Status pill / badge tone variables |

`tokens.css` is imported before `styles.css` in the React app. Component rules remain
in the monolithic `styles.css`; a broader per-feature CSS split is planned before Tauri (0.6).
