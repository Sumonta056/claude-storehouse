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
- Run Claude, start sessions, or read session text. The usage scanner reads only token counts and, per tool call, the tool name and one target field (see Usage band).
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

### Block, days, and projects

`GET /api/usage` also returns `days`, `byProject`, and `block`. The Dashboard shows the block, the days, and the top 3 projects by tokens under the band, with a Refresh button that loads `/api/usage` again.

- `days`: the last 14 local days, oldest first, with `{ date, cost, tokens }`. Days with no use have zero.
- `byProject`: `{ all, month }`. Each is a list of `{ project, sessions, tokens, cost, list }`, sorted by cost. The project is the first `cwd` of the session, with `~` for the home folder, else the folder name under `~/.claude/projects`. A `cd` inside a session does not split it. The costs add up to the cost of the period.
- `list`: one row per session, newest first: `{ id, start, end, responses, tokens, cost, models }`. `start` and `end` are epoch ms or `null`. A record with no session id counts in the project but has no session row. No message text.

### Projects page

- The Dashboard shows the top 3 projects by tokens as cards in one row, for the period of the usage band. A card opens the sessions of that project. "All projects →" opens the Projects page.
- The Projects page lists all projects of the period with sessions, tokens, cost, and last active. It has the same period switch and Refresh as the band, and the search box filters project names. The scope filter does not apply.
- Click a project to see its sessions: start time, length, models, responses, tokens, cost. "← All projects" goes back. `state.projectSel` holds the open project, and it resets when the user leaves the page.
- A session has no title: Storehouse does not read message text. The row shows the first 8 characters of the session id, with the full id in a tooltip.
- `block`: the current 5-hour block, the same rule as ccusage. Sort records by time. A block starts at the first record, rounded down to the full UTC hour, and lasts 5 hours. A record after the block end starts a new block. `block` is the last block while now is before its end, else `null` ("No active block").
- `burnPerHour = cost / hours since block start`. `projected = cost + burnPerHour × hours left`. The card says "estimate": Anthropic does not write the real limit to disk.
- The scanner reads each transcript as one buffer, 8 files at a time, and decodes only the lines that contain `"usage"`. `bin/storehouse.js` starts a scan when the server starts, so the first `/api/usage` call joins it. A cold scan of 3.7 GB took 13.7 s with `readline` and takes about 5 s now.

### Use per item

`GET /api/usage` also returns `items`: `{ "<key>": { count30, last } }`, where `last` is epoch ms. The scanner reads `tool_use` blocks on the same lines that hold `"usage"` and keeps only these fields:

| Tool call in the transcript                      | Key                                                       |
| ------------------------------------------------ | --------------------------------------------------------- |
| `"name":"Skill"`                                 | `skill:<input.skill>`, for example `skill:plugin:name`    |
| `"name":"Agent"` or `"name":"Task"`              | `agent:<input.subagent_type>`, absent → `general-purpose` |
| `"name":"mcp__<server>__<tool>"`                 | `mcp:<server>`                                            |
| `"name":"mcp__plugin_<plugin>_<server>__<tool>"` | `mcp:plugin:<plugin>:<server>`, split at the first `_`    |

- It never keeps `input.prompt`, `input.args`, or any message text. A test puts a secret in the prompt and asserts that the response does not hold it.
- Count each `tool_use` `id` one time across all files. A call stamped after now does not count.
- `count30` counts calls in the 30 days before now. `last` is the newest call.
- Slash commands typed by the user and hooks are not counted. Counts are for all projects together.
- `since` is the time of the oldest tool call, or `null`. The Unused flag and banner show only when `since` is 30 days or more ago.
- The browser matches a skill or agent by `<kind>:<name>`, and a plugin skill or agent by `<kind>:<plugin>:<name>`. A plugin item also takes the bare `<kind>:<name>` only when no local or project item of that kind has the name. MCP keys use `mcp:<server>` and `mcp:plugin:<plugin>:<server>`, with each character outside `[A-Za-z0-9_-]` changed to `_`, as Claude Code does in tool names.
- Items with the same key (a global and a project item, or 2 plugins) each show the full count, and the row says "Shared with N items of this name".
- "Unused 30 d" = usage has at least one response, `since` covers 30 days, the item is a skill, agent, or MCP server that is on, it has no call in 30 days, and its file is older than 30 days. MCP servers have no file time, so only the call count applies. A skill with `disable-model-invocation: true` is never Unused: Claude cannot call it. Typed `/name` use does not count, and the banner and confirm dialog say so.
- "Switch off N" toggles each switchable unused item that the scope filter and search show, one at a time, after a confirm dialog. Each toggle gets its own Activity entry with undo.
- The sort (Most used, Least used, Name) is kept in `localStorage` key `storehouse.usageSort`. The default is Name.

### Tier

`GET /api/usage` also returns `last30`, with the same fields as `month`, for records from 30 days before now up to now. Records with no valid time are left out. The Dashboard shows a "Your tier" card from `last30.cost`, under the 4 usage tiles. It is for fun.

| Tier     | API-equal cost in the last 30 days |
| -------- | ---------------------------------- |
| Bronze   | $0                                 |
| Silver   | $25                                |
| Gold     | $75                                |
| Platinum | $200                               |
| Diamond  | $500                               |
| Elite    | $1,200                             |
| Epic     | $3,000                             |
| Legend   | $7,500                             |

- The table is `TIERS` in `public/logic/rank.js`. A tier starts at its value.
- Sources for the limits: code.claude.com/docs/en/costs gives $150 to $250 per developer per month on average, and less than $30 per active day for 90% of users (about $660 per month). Gold and Platinum hold the average, and Diamond starts above the 90th percentile. viberank.app, a ccusage leaderboard, sets Legend.
- The window is 30 days, not all time: Claude Code deletes transcripts after `cleanupPeriodDays`, 30 days by default. A calendar month would put every user in Bronze on day 1.
- The card ignores the period switch. It also shows the amount to the next tier and "Saved by prompt cache", so it does not reward only spend.
- When `last30.unpriced` is not empty, the card says "Tier may be low".

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
| 6   | Warning  | `skillOverrides` names only a plugin skill. Plugin skills ignore `skillOverrides`.                                             |
| 6   | Info     | `skillOverrides` names no local or project skill. It can still name a bundled skill, which Storehouse does not scan.           |
| 7   | Warning  | More than one local or project skill, agent, or MCP server with one name is on. The row links to Duplicates.                   |
| 8   | Info     | A local or project skill or agent has no `description` in its frontmatter (`hasDescription: false`).                           |
| 9   | Info     | A link in `skills/` or `agents/` is broken (`inventory.skipped`), or a local item's real path is outside home and the project. |
| 10  | Info     | A CLAUDE.md file has more than 200 lines.                                                                                      |

- Check 2 reads only the first word. The word stops at a space or a shell operator (`; & | < > ( )`). Quotes and `\ ` escapes are removed. A quoted `~` is not expanded. A first word that is not a path, such as `node`, is skipped.
- Checks 2, 3, and 4 skip items that are off. `${VAR:-default}` counts as set. `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, and `CLAUDE_PROJECT_DIR` count as set.
- Check 5 skips the marketplaces `builtin` and `synced`. Claude Code does not list those plugins in `installed_plugins.json`.
- Checks 8 and 9 skip plugin items. The user cannot edit plugin files.
- Check 7 skips plugin items. Claude Code namespaces them as `/plugin:name`, so they do not clash with a local item. Between local and project items, one wins: personal over project for skills. Source: code.claude.com/docs/en/skills, "Resolve skills that share a name". The Duplicates page still groups plugin items, so its Conflict count can be higher than the Doctor count.
- `PATH` of the Storehouse process can differ from the `PATH` Claude Code uses. The row says "not found on the PATH of this terminal".
- The browser loads `/api/doctor` with each inventory refresh, so it runs again after each write. "Check again" refreshes both.
- The nav count is errors plus warnings. It is red when an error exists. The page ignores the scope filter and uses the search box.
- The live demo serves a static snapshot from build time.

## Settings page

- Layout like the CLAUDE.md page: a numbered file list on the left (1 Global, 2 Project, 3 Project local) and one file on the right. The higher number wins. Without a project folder, only Global shows.
- Each file has 2 tabs: Form and Raw JSON. Invalid JSON opens Raw JSON and disables Form.
- Form fields (`FORM_FIELDS` in `public/app.js`): `model`, `effortLevel`, `outputStyle`, `theme`, `permissions.defaultMode`, `skipDangerousModePermissionPrompt`. A field with the wrong type is locked: "edit in Raw JSON".
- `autoMode` is classifier rules (an object), not an on/off switch. The form never writes it.
- `permissions.defaultMode` values: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`. `auto` and `bypassPermissions` do not take effect from project or local files.
- The form writes one key into the file read from disk and keeps every other key, also inside `permissions`. An empty value deletes the key. An emptied `permissions` stays as `{}`.
- Read-only groups: permission rules (allow, ask, deny), keys managed on other pages (`enabledPlugins`, `skillOverrides`, `hooks`, with a link), other keys (link to Raw JSON).

## Effective settings

The Settings page has a second view, Effective. `src/scan/effective.js` builds `inventory.settings.effective` = `{ rows, skipped, invalid }`. `inventory.settings.managed` is true when a managed settings file exists. Verified against code.claude.com/docs/en/settings.md on 2026-10-24.

| Item                                                       | Rule                                                                                                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precedence                                                 | managed > command line > project local > shared project > user                                                                                                                   |
| Scalars and other values                                   | the highest file that sets the key wins                                                                                                                                          |
| Lists (top-level keys, and the lists inside `permissions`) | combine from all files, no duplicates, highest file first                                                                                                                        |
| `permissions`, `env`, `modelSettings`                      | per key, one level deep                                                                                                                                                          |
| Any other object, for example `statusLine` or `sandbox`    | one whole value: the highest file wins. The docs do not say that other objects merge                                                                                             |
| `fallbackModel`                                            | highest file wins, no combine                                                                                                                                                    |
| `modelPicker`                                              | whole value; project and local files are ignored                                                                                                                                 |
| `permissions.defaultMode` = `auto` or `bypassPermissions`  | ignored in project and local files                                                                                                                                               |
| Deny and ask over allow                                    | an allow rule does not outrank a deny or ask rule from another file                                                                                                              |
| `enabledPlugins`, `skillOverrides`                         | docs silent; the higher file per key, marked `docsSilent`                                                                                                                        |
| `hooks`                                                    | not in the table; hooks from all files run                                                                                                                                       |
| `null`                                                     | counts as not set                                                                                                                                                                |
| A list next to a value of another type                     | the lists combine; the other value is `wrongType` and ignored                                                                                                                    |
| `permissions`, `env`, … that is not an object              | left out and listed in `invalid`                                                                                                                                                 |
| Managed settings                                           | not read; the page notes that they exist. macOS `/Library/Application Support/ClaudeCode`, Linux `/etc/claude-code`, file `managed-settings.json` or `managed-settings.d/*.json` |

- Each file tag in the table opens that file in the Files view.
- A form field that a higher file overrides shows "↑ <file> sets <value>. That value wins in this folder." A value that Claude Code ignores in that file says so.
- The live demo loads `effective.js` and recomputes the view after each settings write. `effective.js` must stay free of imports.

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
