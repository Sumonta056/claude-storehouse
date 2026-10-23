---
paths:
  - 'public/**'
---

# UI rules

- Files: one `public/index.html`, one `public/app.js`, one `public/app.css`, plus `public/api.js` and the app icon `public/icon.svg`. Vanilla JS, no framework.
- Font: Figtree from Google Fonts with a system fallback for offline use.
- All functional text is 14 px or larger.
- Approved layout: `.superpowers/brainstorm/*/content/dashboard-demo-v2.html`.

## Pages

Dashboard, Favorites, Duplicates, Skills, Agents, Plugins, Mods, Hooks, MCP, Settings, CLAUDE.md.

## Behavior

- Scope filter: All, Global, Project.
- `/` focuses search.
- Detail drawer with editor, preview, and files tab.
- Activity log with undo in the sidebar.
- Confirm dialog before delete.
- A toast after each write names the file that changed.
- A switch shows the file it writes in a tooltip before the click.
- After any toggle, a banner says: "Claude Code applies this at the next session."
- Plugin skills show a "Fork to local" button.
- MCP secrets are masked.
- All data comes from `GET /api/inventory`, except the Dashboard usage band, which loads `GET /api/usage` one time per page load. Re-render from the content each write returns.
