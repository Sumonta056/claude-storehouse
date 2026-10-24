# Code rules

## Stack

- Node 20 or later, ESM (`"type": "module"`). No TypeScript, no build step, no native modules.
- Runtime dependency allowed: `open` only. Everything else is Node built-ins (`http`, `fs`, `path`, `os`, `crypto`, `child_process`).
- macOS is the primary target. Paths must also work on Linux. Windows is best effort.
- Frontmatter parser is hand-written in `src/scan/frontmatter.js`. No YAML dependency.

## Style

- No comments in code.
- Scanners in `src/scan/` are read-only. All writes go through `src/write/`.
- API handlers live in `src/api.js` and `src/api-config.js`. Routes are listed in `src/server.js`.
- Browser code in `public/logic/` is pure: no DOM globals and no import of `core/dom.js`, `ui/`, `pages/`, `api.js`, or `app.js`. ESLint fails otherwise. Layout of `public/`: `.claude/rules/ui.md`.

## Tests

- `node --test`. Fixtures under `test/fixtures/home` and `test/fixtures/project`.
- Tests never touch the real `~/.claude` or `~/.claude.json`. Use `fs.mkdtempSync` for a fake home.
- Every scan module has a unit test against the fixture tree.
- Every toggle test asserts 3 things: the exact key after the write, the backup file exists, an unrelated key in the same file is unchanged.
- One API smoke test boots the server on a random port and runs inventory, toggle, inventory.
- Browser modules have tests in `test/public/`, one file per module. Node imports them directly. Set the `state` fields a test needs and restore them in `finally`. A page module imports `api.js`, which reads `location` on load: set `globalThis.location` first, then `await import()`. Test `render*` functions with a small fake `document` whose `getElementById` returns plain objects.

## Workflow

- Before you claim a task is done, run `npm run check` and show the output. For UI tasks also run the Chrome check in skill `storehouse-verify`.
- After a change in `src/write/` or `src/scan/`, run agent `toggle-reviewer`.
- Before a change in `public/`, load skill `storehouse-ui-structure`. After it, run agent `ui-structure-reviewer`.
- For a refactor or a large UI change, compare with `main` (skill `storehouse-verify`, section 5) and save the report in `docs/reports/<YYYY-MM-DD>-<slug>.html` (section 6).
- After a user-visible change (a feature, page, switch, CLI flag, shortcut, or UI change), run skill `storehouse-website`. It updates the website, the live demo, the screenshots, and `README.md` in the same task.
- Ask before `git commit` or `git push`.
- Plans and specs are temporary. When the work in a plan is complete, move any lasting rule or decision into `.claude/rules/`, then delete the plan and its spec.
