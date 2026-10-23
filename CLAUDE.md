# claude-storehouse

A local web dashboard for one developer's Claude Code setup. Run `npx claude-storehouse`
in any folder. It lists skills, agents, plugins, hooks, MCP servers, settings, and
CLAUDE.md for the global scope (`~/.claude`) and the project scope (`./.claude`), and lets
the developer read, edit, switch on/off, and favorite them.

## Rules

Claude Code loads every file in `.claude/rules/`. Files with `paths:` load only for matching files.

| File                              | Holds                                                                        | Loads                   |
| --------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `.claude/rules/code-rules.md`     | Stack, style, tests, workflow, plan cleanup                                  | always                  |
| `.claude/rules/business-logic.md` | Goals, what Claude Code reads, on/off per type, favorites, undo, limitations | always                  |
| `.claude/rules/config-safety.md`  | Write procedure, backups, path allow-list, server security                   | `src/`, `test/`, `bin/` |
| `.claude/rules/ui.md`             | Font, 14 px, pages, UI behavior, mockup                                      | `public/`               |
| `.claude/rules/git-workflow.md`   | Conventional Commits, Husky hooks, CI, release pipeline                      | always                  |

Key rules:

- No comments in code.
- Never write to the real `~/.claude` or `~/.claude.json` during development or tests.
- Run `npm run check` and show the output before you claim a task is done.
- Ask before `git commit` or `git push`.
- Delete a plan and its spec when the work is complete. Keep lasting decisions in `.claude/rules/`.

## Project Claude Code setup

- Skill `storehouse-config-safety`: switch table, write procedure, path allow-list, test rule. Load for any `src/write` or `src/scan` task.
- Skill `storehouse-verify`: test command, fake home recipe, 10-point Chrome check. Load before you claim a task is done.
- Skill `storehouse-release`: release to GitHub and npm, README and npm page, screenshots from a demo home. Load for any release or README task.
- Agent `toggle-reviewer`: read-only reviewer for toggle and scanner code. Run after each `src/write` task.
- `.claude/settings.json`: allows `npm test`, `node --test`, and the CLI. Denies edits to the real `~/.claude/settings.json` and `~/.claude.json`.

## Commands

```
npm test              run all tests
npm run lint          ESLint
npm run format        Prettier write
npm run check         lint + tests, run before you claim a task is done
npm start             start the server on this folder
node bin/storehouse.js --dir <path> --home <fakeHome> --no-open
```

## Layout

```
bin/storehouse.js   CLI
src/server.js       http server, route table
src/api*.js         API handlers
src/scan/*.js       read-only scanners, one per item type
src/write/*.js      json-file (atomic + backup), toggles, files, favorites, activity, paths
public/             UI
test/               node:test + fixtures
.claude/            project rules, skills, agents, settings
.github/            CI and release workflows, PR and issue templates, dependabot
.husky/             git hooks
CHANGELOG.md        written by /release-tag
scripts/demo-home.js  builds a fake home with sample data for screenshots
docs/images/        README screenshots
```
