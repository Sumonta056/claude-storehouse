---
name: storehouse-verify
description: How to prove a claude-storehouse task is done. Use before claiming any task complete, before a commit, and after any UI change. Covers npm test, a safe fake home for the server, the Chrome check list, the full feature checklist, the main-versus-branch comparison for refactors, and where to save the report.
---

# Storehouse verify

## 1. Tests

```
npm run lint
npm test
```

Paste the last lines of the output in the reply. A task with a failing or skipped test is not done.

`npm run check` also runs `prettier --check .`. Untracked folders that are not yours (for example `.archify/`) can make that step fail. Then run `npx prettier --check .` and name each file it lists. Fix only your own files.

## 2. Fake home for manual checks

Never point the server at the real `~/.claude`. Never copy the real `~/.claude` either: it holds about 3 GB of session files. Build a demo home with sample skills, agents, plugins, hooks, MCP servers, favorites, and usage:

```
node scripts/demo-home.js <dir>
node bin/storehouse.js --dir <dir>/home/acme-api --home <dir>/home --no-open --port <port>
```

`demo-home.js` prints `{home, project}`. The server prints the URL with its token. Use a folder in the session scratchpad for `<dir>`, and a free port. Each parallel agent uses its own folder and port. Stop the server and delete the folder at the end.

## 3. Browser

- Open your own tab with `new_page`. If it fails with "The browser is already running for …/chrome-devtools-mcp/chrome-profile", call `new_page` again with `isolatedContext: "<your-name>"`. Do not ask the user to close Chrome.
- Call `select_page` before each action. Close your tab with `close_page` when done.
- If the Chrome DevTools tools cannot start at all, drive your own headless Chrome with a temporary `--user-data-dir` (CDP, puppeteer-core, or `--dump-dom`). Never use the shared profile.
- Never click "Reveal in Finder" or "Open in editor", and never confirm "Uninstall": they start apps or run `claude plugin uninstall`. Open the dialog and press Cancel.

## 4. Chrome check list (every UI task)

1. Dashboard loads with non-zero counts for skills, agents, plugins.
2. Scope filter Global and Project changes the counts.
3. Search filters rows on every page.
4. One switch on a local skill: toggle off, read `<home>/.claude/settings.json`, confirm `skillOverrides`. Toggle on, confirm the key is gone. Confirm a backup file exists.
5. One switch on a plugin: confirm `enabledPlugins` in the file.
6. One plugin skill row has no switch of its own and says it follows the plugin.
7. One file edit and save in the drawer: confirm the file on disk and the backup.
8. One undo from the activity log.
9. Console has no errors. Use `list_console_messages`.
10. All functional text is 14 px or larger. Check one card, one table row, one tag with `get_css_styles`.

Report each item as pass or fail with the evidence.

## 5. Refactor or large UI change: compare with main

A refactor must not change what the user sees. Prove it against `main`:

1. Make a worktree of `main` in the scratchpad: `git worktree add <scratch>/main-wt main`, then link `node_modules` into it.
2. Start one server from the worktree and one from the branch, each with its own demo home and port.
3. **Text:** render all 14 pages in both with headless Chrome (`--dump-dom "<url>#<page>"`). Compare the visible text of each `#p-<page>` section. Replace the demo folder name and relative times before the compare.
4. **Screenshots:** take each page at 1440 px and 720 px wide in both, with web fonts blocked (`--host-resolver-rules="MAP fonts.googleapis.com 0.0.0.0, MAP fonts.gstatic.com 0.0.0.0"`), so font load timing does not change the pixels. Look at each pair that differs. A clock label that moved one hour ("7 h ago" against "8 h ago") is not a difference.
5. **Features:** run the full checklist in `features.md` (in this skill folder) on both sides. Split it over 4 agents, one per group (A to D), each with its own ports, demo homes, and isolated browser context. A regression is pass on `main` and fail on the branch. A fail on both is an old issue: report it, do not fix it in the refactor.
6. Remove the worktree at the end: `git worktree remove --force <scratch>/main-wt`.

## 6. Report

For a refactor, a release, or any change checked with section 5, write one report:

- Content: the verdict first (features checked, regressions, test count, console errors), before and after numbers, each proof layer, the feature table with `main` and branch results, the tests added, old issues found, trade-offs, and the commits.
- Publish it as an Artifact and give the user the link.
- Save the same page in `docs/reports/<YYYY-MM-DD>-<slug>.html` as a full HTML document (`<!doctype html>`, `<meta charset>`, viewport meta), so it opens offline. Commit it with the work. `docs/` is not in the npm package.
- Example: `docs/reports/2026-10-24-app-js-split.html`.
