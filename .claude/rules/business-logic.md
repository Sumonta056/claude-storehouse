# Business logic

## Purpose

The developer has about 110 skills and 28 plugins across 10 marketplaces. The dashboard replaces a hand-written Markdown catalog of favorite skills. It gives a live view and makes on/off one click instead of a JSON edit.

## Goals

1. One command, any folder, no install step beyond `npx`.
2. Show global and project items side by side with a scope filter.
3. Switch on/off for plugins, skills, hooks, MCP servers, agents.
4. Edit and save any file the developer owns.
5. Favorites survive on/off changes.
6. Never corrupt a Claude Code config file.

## Non-goals

- Install or update plugins or marketplaces. Use `/plugin`. Uninstall is allowed: it calls `claude plugin uninstall <id> --scope <scope>`.
- Run Claude, start sessions, or read session text. The usage band reads only token counts from transcripts.
- Multi-user, remote, or hosted use.
- A database, a cloud account, or a UI build pipeline.

## Failure even if it works

- A write that drops keys from a config file.
- A switch that uses a mechanism Claude Code does not read. The dashboard then says "off" but Claude still loads the item.

## What Claude Code reads

| Item                | Global                                                           | Project                                                    |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Settings            | `~/.claude/settings.json`                                        | `./.claude/settings.json`, `./.claude/settings.local.json` |
| CLAUDE.md           | `~/.claude/CLAUDE.md`                                            | `./CLAUDE.md`, `./CLAUDE.local.md`, `./.claude/CLAUDE.md`  |
| Skills              | `~/.claude/skills/<name>/SKILL.md`                               | `./.claude/skills/<name>/SKILL.md`                         |
| Agents              | `~/.claude/agents/<name>.md`                                     | `./.claude/agents/<name>.md`                               |
| Hooks               | `settings.json` → `hooks.<Event>[]`                              | same keys in project settings                              |
| MCP servers         | `~/.claude.json` → `mcpServers`, `projects.<path>.mcpServers`    | `./.mcp.json`                                              |
| Plugins installed   | `~/.claude/plugins/installed_plugins.json`                       | —                                                          |
| Plugin files        | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`      | —                                                          |
| Mods installed      | a plugin whose `hooks/hooks.json` has `"modules": [...]`         | —                                                          |
| Mods in development | `~/.claude/dev-mods/<session>/<name>/.claude-plugin/plugin.json` | —                                                          |
| Session transcripts | `~/.claude/projects/<project>/<session>.jsonl`                   | —                                                          |

A plugin folder contains `skills/<name>/SKILL.md`, `agents/<name>.md`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, and optionally `.mcp.json`.

A mod is a plugin that changes Claude Code itself. Claude Code loads its `modules` only when `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set in the shell or in settings `env`. The Mods page shows installed mods and the mods in `~/.claude/dev-mods`. Installed mods also stay on the Plugins page with a "Mod" flag.

Scan rules:

- Loose files such as `~/.claude/skills/code-review.md` count as skills.
- Skip `.trash` folders and names that start with `.`.
- Symlinked skills are allowed when the real path is under the home folder.

## On/off per type

| Type                      | Off                                                                                             | On             | Native to Claude Code |
| ------------------------- | ----------------------------------------------------------------------------------------------- | -------------- | --------------------- |
| Plugin                    | `enabledPlugins[id] = false`                                                                    | `= true`       | yes                   |
| Local or project skill    | `skillOverrides[name] = "off"`                                                                  | delete the key | yes                   |
| Mod (installed)           | same as Plugin                                                                                  | same as Plugin | yes                   |
| Mod in `dev-mods`         | no switch, read-only. No star, no uninstall.                                                    | —              | —                     |
| Plugin skill, agent, hook | no own switch, follows the plugin. UI shows "via plugin X".                                     | —              | —                     |
| MCP in `./.mcp.json`      | add to `disabledMcpjsonServers`, remove from `enabledMcpjsonServers`                            | the reverse    | yes                   |
| MCP global                | add name to `projects.<dir>.disabledMcpServers` in `~/.claude.json`                             | remove it      | yes, per project      |
| MCP from a plugin         | add `plugin:<plugin>:<server>` to `projects.<dir>.disabledMcpServers`                           | remove it      | yes, per project      |
| Hook                      | move the entry to `~/.claude/storehouse.json` → `parkedHooks` with event, matcher, scope, index | move it back   | no                    |
| Agent                     | rename `name.md` → `name.md.disabled`                                                           | rename back    | no                    |

Target file per scope:

| Scope                     | File                                                     |
| ------------------------- | -------------------------------------------------------- |
| global                    | `~/.claude/settings.json`                                |
| project                   | `./.claude/settings.local.json`                          |
| MCP global and plugin MCP | `~/.claude.json` under `projects.<absolute project dir>` |

## Usage band

- The Dashboard shows API-equal cost, tokens, sessions, projects, and cache savings from `GET /api/usage`.
- `src/scan/usage.js` reads `<project>/*.jsonl` and `<project>/<session>/subagents/*.jsonl` line by line, and parses only lines that contain `"usage"`. It never keeps or returns message text.
- It reads regular files only. It skips symlinks, unreadable folders, and other entries without an error.
- One response can write many lines, and the early lines can hold partial counts. Count each `message.id` + `requestId` one time across all files, and keep the largest value of each token field. A line with no ids counts on its own.
- Records per file are cached in memory by `mtime` and size. Calls that overlap share one scan. A full scan of 3 GB takes about 5 seconds; a cached scan reads only changed files.
- Prices live in `src/scan/prices.js`, per million tokens: input, output, cache read. Cache write is 1.25 × input for 5 minutes and 2 × input for 1 hour. Cache-read price differs by model. Update the table when Anthropic changes prices. The cost is an estimate: it leaves out long-context, fast-mode, and Batch prices.
- An unknown model counts tokens but no cost, and the band names it.
- "Saved by prompt cache" is cache-read tokens × (input price − cache-read price).
- A project is one folder under `~/.claude/projects`. "This month" uses local time.

## Favorites

- Stored in `~/.claude/storehouse.json` → `favorites[]` as `{ kind, id, source, order }`.
- Global only, not per project.
- Categories live in `favoriteCategories[]`. Each favorite has an optional `category`. Rename and delete of a category can be undone.
- A favorite that is off stays in the list and shows the off state.
- A favorite whose item is gone shows "missing" with a remove button.
- Drag to reorder.

## Undo, delete, fork

- Toggles and favorites undo with the inverse operation. Two toggles on one file undo independently.
- A file edit undoes by restoring the backup that the save made. Only the latest save of a file can undo.
- Delete moves the file to `~/.claude/backups/storehouse/trash/<timestamp>-<name>` and removes its `skillOverrides` or favorite entry. No OS Trash. Restore from the Backups panel.
- Fork copies a plugin skill to `~/.claude/skills`. Only skills can be forked.

## Known limitations

1. Plugin skills have no own on/off switch.
2. Agent off is a rename to `.md.disabled`.
3. Hook off parks the entry in `~/.claude/storehouse.json`.
4. Changes apply at the next Claude Code session.
5. `commands`, `rules`, `output-styles` are out of scope for version 1.
