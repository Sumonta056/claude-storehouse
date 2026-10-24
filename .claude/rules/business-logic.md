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
- `GET /api/usage` returns `monthKey` and 2 periods, `all` and `month`, with the same fields. A switch at the top right of the band picks the period for the cost, the model bar, and the 4 tiles. The default is "This month". The browser keeps the last choice in `localStorage` key `storehouse.usagePeriod`.
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

## Context cost

The Context page estimates the tokens that each item adds to every session. The browser builds it from `GET /api/inventory`. There is no server code for it beyond `size` on skills and agents and `claudeMd.rules`.

| Item                                                    | Loads at session start   | Loads on use                               |
| ------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| CLAUDE.md (global, project, local, `.claude/CLAUDE.md`) | full file                | —                                          |
| `.claude/rules/**/*.md` without `paths:`                | full file                | —                                          |
| `.claude/rules/**/*.md` with `paths:`                   | —                        | full file, when a matching file is touched |
| Skill (on)                                              | `name` + `description`   | full `SKILL.md`                            |
| Agent (on)                                              | `name` + `description`   | full body, in the subagent context         |
| Plugin skill and agent (plugin on)                      | same as above            | same as above                              |
| MCP server (on)                                         | tool names, not measured | full tool schema                           |
| Skill or agent (off)                                    | nothing                  | nothing                                    |

- Estimate: `tokens = Math.ceil(bytes / 4)`. One constant, `TOKEN_BYTES`, in `public/app.js`.
- A skill or agent costs its `name: description` bytes. The description is cut at 1,536 characters, the Claude Code cap.
- No skill listing budget meter. Claude Code's listing budget is a character budget at 1% of the model's context window, changed by `skillListingBudgetFraction`, `SLASH_COMMAND_TOOL_CHAR_BUDGET`, and `skillOverrides: "name-only"`. Storehouse cannot know the model, so the page points to `/context`, which reports the listing after the budget. Source: code.claude.com/docs/en/skills, "Skill descriptions are cut short".
- The list and the type chips show only items that load. The Off chip lists items that are off and the tokens they save.
- The scanner reads rules recursively from `~/.claude/rules` and `./.claude/rules`. It skips names that start with `.`, non-`.md` files, symlinked folders, and symlinked files whose real path is outside the home folder and the project folder. A rule is conditional when its frontmatter `paths` has at least one entry.
- An item that is off counts 0. Its row shows "Saves NN tok while off".
- A skill with a duplicate name counts once for each copy. The row links to Duplicates.
- Not counted: MCP tool schemas, `@path` imports in CLAUDE.md, `SessionStart` hook output, and `disable-model-invocation: true` (counted as if it lists).
- The total uses the scope filter and search. With the chip "All", the total equals the sum of the rows.

## Duplicates

- The Duplicates page groups skills, agents, and MCP servers of one kind that have the same name. A skill and an agent with one name do not make a group.
- The browser builds the groups from `GET /api/inventory`. There is no server code for it.
- A group shows "Conflict" when more than one item in it is on, and "OK" when one or none is on. The nav count is the number of Conflict groups.
- "Keep only this" switches off the other items in the group that have their own switch. Plugin items stay on and the page names the plugin.
- Similar names (shared words, not the same name) are out of scope. A word match gave about 170 false groups on a real setup.

## Doctor

The Doctor page lists config that is broken or that does not do what it says. `GET /api/doctor` returns `{ issues, checked }`. Each issue is `{ id, check, severity, kind, name, file, message, target }`. `checked` is the number of files Doctor looked at. Code: `src/scan/doctor.js`.

Doctor never writes and never runs a command. Check 3 only looks for an executable file in each `PATH` folder.

| #   | Severity | Check                                                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Error    | A config file in `inventory.errors` has invalid JSON. The message is generic: a parse error can quote a secret.                |
| 2   | Warning  | A hook that is on starts with a path that does not exist: `/…`, `~/…`, `$CLAUDE_PROJECT_DIR/…`, `${CLAUDE_PLUGIN_ROOT}/…`.     |
| 3   | Warning  | The command of an MCP stdio server that is on is not an executable file on `PATH`, or at its absolute path.                    |
| 4   | Warning  | An MCP server that is on uses `${VAR}`, and `VAR` is not in `process.env` or in settings `env`.                                |
| 5   | Warning  | `enabledPlugins` names a plugin that is not in `installed_plugins.json`.                                                       |
| 6   | Warning  | `skillOverrides` names a skill that does not exist.                                                                            |
| 7   | Warning  | More than one skill, agent, or MCP server with one name is on. The row links to Duplicates.                                    |
| 8   | Info     | A local or project skill or agent has no `description` in its frontmatter (`hasDescription: false`).                           |
| 9   | Info     | A link in `skills/` or `agents/` is broken (`inventory.skipped`), or a local item's real path is outside home and the project. |
| 10  | Info     | A CLAUDE.md file has more than 200 lines.                                                                                      |

- Check 2 reads only the first word. The word stops at a space or a shell operator (`; & | < > ( )`). Quotes and `\ ` escapes are removed. A quoted `~` is not expanded. A first word that is not a path, such as `node`, is skipped.
- Checks 2, 3, and 4 skip items that are off. `${VAR:-default}` counts as set. `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, and `CLAUDE_PROJECT_DIR` count as set.
- Check 5 skips the marketplaces `builtin` and `synced`. Claude Code does not list those plugins in `installed_plugins.json`.
- Checks 8 and 9 skip plugin items. The user cannot edit plugin files.
- `PATH` of the Storehouse process can differ from the `PATH` Claude Code uses. The row says "not found on the PATH of this terminal".
- The browser loads `/api/doctor` with each inventory refresh, so it runs again after each write. "Check again" refreshes both.
- The nav count is errors plus warnings. It is red when an error exists. The page ignores the scope filter and uses the search box.
- The live demo serves a static snapshot from build time.

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
5. `commands` and `output-styles` are out of scope for version 1. Rules are read-only. They show only on the Context page.
6. Context cost is an estimate from file sizes.
