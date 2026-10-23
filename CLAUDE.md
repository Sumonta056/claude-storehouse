# claude-storehouse

A local web dashboard for one developer's Claude Code setup. Run `npx claude-storehouse`
in any folder. It lists skills, agents, plugins, hooks, MCP servers, settings, and
CLAUDE.md for the global scope (`~/.claude`) and the project scope (`./.claude`), and lets
the developer read, edit, switch on/off, and favorite them.

Design: `docs/superpowers/specs/2026-10-23-claude-storehouse-design.md` (approved).
Plan: `docs/superpowers/plans/` (one task per section).
Setup index: `plot.md`.

## Stack

- Node 20, CommonJS or ESM as the plan says. No TypeScript, no build step.
- Runtime dependency allowed: `open` only. Everything else is Node built-ins.
- Tests: `node --test`. Fixtures under `test/fixtures/`. Tests never touch the real `~/.claude`.
- UI: one `public/index.html`, one `public/app.js`, one `public/app.css`. Vanilla JS.
- Font: Figtree from Google Fonts with a system fallback. All functional text 14 px or larger.

## Rules

- No comments in code.
- Never write to the real `~/.claude`, `~/.claude.json`, or a real project `.claude` during development or tests. Use a temp HOME. See skill `storehouse-config-safety`.
- Every config write: backup first, write temp file, rename. Parse failure means refuse.
- Project switches write `.claude/settings.local.json`, never `.claude/settings.json`.
- Plugin cache files are read-only. Plugin skills, agents, and hooks have no own switch.
- Before you claim a task is done, run `npm test` and show the output. For UI tasks also verify in Chrome against a temp HOME. See skill `storehouse-verify`.
- Ask before `git commit` or `git push`.

## Commands

```
npm test              run all tests
npm start             start the server on this folder
node bin/storehouse.js --dir <path> --home <fakeHome> --no-open
```

## Layout

```
bin/storehouse.js   CLI
src/server.js       http + API
src/scan/*.js       read-only scanners, one per item type
src/write/*.js      json-file (atomic + backup), toggles, files, favorites
public/             UI
test/               node:test + fixtures
.claude/            project skills, agents, settings for this development
```
