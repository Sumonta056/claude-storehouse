# Claude Storehouse — design

Date: 2026-10-23
Status: draft for approval

## Intent

A local web dashboard for one developer's Claude Code setup. The developer runs
`npx claude-storehouse` in any folder. The browser opens one page that lists every
skill, agent, plugin, hook, MCP server, settings file, and CLAUDE.md that Claude
Code loads for that folder, split by scope (global `~/.claude` vs project
`./.claude`). From that page the developer can read a file, edit it, switch an
item on or off, and mark favorites.

Why: the developer has about 110 skills and 28 plugins across 10 marketplaces.
Today the only views are the `/plugin` menu, `/skills`, and raw JSON. The
developer keeps a hand-written Markdown catalog of favorite skills grouped by
workflow phase. That catalog goes stale. The dashboard replaces it with a live
view and makes the on/off decisions one click instead of a JSON edit.

## Goals

1. One command, any folder, no install step beyond `npx`.
2. Show global and project items side by side with a scope filter.
3. Switch on/off for plugins, skills, hooks, MCP servers, agents.
4. Edit and save any file the developer owns. Plugin cache files stay read-only.
5. Favorites that survive on/off changes. A favorite that is off still shows,
   marked off.
6. Never corrupt a Claude Code config file. Backup before every write.

## Non-goals

- Installing or updating plugins or marketplaces. Use `/plugin` for that.
- Running Claude, launching sessions, or reading session history.
- Multi-user, remote, or hosted use. The server binds to localhost only.
- A build pipeline for the UI. The UI is one static HTML file plus one JS file.

## Anti-goals (failure even if it works)

- A write that drops keys from `settings.json` or `~/.claude.json`.
- An on/off switch that uses a mechanism Claude Code does not read, so the
  dashboard says "off" but Claude still loads the item.
- A dashboard that needs a framework build, a database, or a cloud account.

## Constraints

- Node 20 or later. No native modules.
- Runtime dependencies: as few as possible. Allowed: `open` (browser launch).
  Everything else uses Node built-ins (`http`, `fs`, `path`, `os`).
- No comments in code (owner rule).
- All functional UI text 14 px or larger. Font: Figtree from Google Fonts, with
  a system fallback when offline.
- macOS is the primary target. Paths must still work on Linux. Windows is
  best effort.

## What Claude Code reads (verified on the owner's machine, 2026-10-23)

| Item | Global location | Project location |
|---|---|---|
| Settings | `~/.claude/settings.json` | `./.claude/settings.json`, `./.claude/settings.local.json` |
| CLAUDE.md | `~/.claude/CLAUDE.md` | `./CLAUDE.md`, `./CLAUDE.local.md`, `./.claude/CLAUDE.md` |
| Skills | `~/.claude/skills/<name>/SKILL.md` | `./.claude/skills/<name>/SKILL.md` |
| Agents | `~/.claude/agents/<name>.md` | `./.claude/agents/<name>.md` |
| Hooks | `settings.json` → `hooks.<Event>[]` | same keys in project settings |
| MCP servers | `~/.claude.json` → `mcpServers` and `projects.<path>.mcpServers` | `./.mcp.json` |
| Plugins installed | `~/.claude/plugins/installed_plugins.json` (scope: user, project, local) | — |
| Plugin files | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` | — |
| Plugin on/off | `settings.json` → `enabledPlugins["name@marketplace"]` | same key in project settings |
| Skill on/off | `settings.json` → `skillOverrides["name"] = "off"` | same key in project settings |
| MCP on/off | `~/.claude.json` → `projects.<path>.disabledMcpServers`, `disabledMcpjsonServers`, `enabledMcpjsonServers` | — |
| Plugin config | `settings.json` → `pluginConfigs` | — |

A plugin folder contains `skills/<name>/SKILL.md`, `agents/<name>.md`,
`hooks/hooks.json`, `.claude-plugin/plugin.json`, and optionally `.mcp.json`.
Skill and agent frontmatter gives `name` and `description`.

## On/off mechanism per type

| Type | Off | On | Native? |
|---|---|---|---|
| Plugin | `enabledPlugins[id] = false` | `= true` | yes |
| Local or project skill | `skillOverrides[name] = "off"` | delete key | yes |
| Plugin skill | no switch. Claude Code ignores `skillOverrides` for plugin skills. The card shows the switch disabled with "via plugin X". Switch the plugin instead. | — | — |
| MCP in `./.mcp.json` | add name to `disabledMcpjsonServers`, remove from `enabledMcpjsonServers` | the reverse | yes |
| MCP global (`~/.claude.json` → `mcpServers`) | add name to `projects.<dir>.disabledMcpServers` in `~/.claude.json` | remove it | yes, per project |
| MCP from a plugin | add `plugin:<plugin>:<server>` to `projects.<dir>.disabledMcpServers` | remove it | yes, per project (observed on this machine, not in docs) |
| Hook | move the hook object from `hooks.<Event>[i].hooks[j]` into `~/.claude/storehouse.json` → `parkedHooks` with its event, matcher, scope, and original index | move it back | no |
| Agent | rename `name.md` → `name.md.disabled` | rename back | no |
| Plugin agent or plugin hook | follows the plugin switch; the UI shows the control disabled with "via plugin X" | — | — |

Scope and target file for each write:

| Scope | File |
|---|---|
| global | `~/.claude/settings.json` |
| project | `./.claude/settings.local.json` (git-ignored). This is where Claude Code itself writes project-level `enabledPlugins`, `skillOverrides`, and MCP lists. The dashboard never writes `./.claude/settings.json` for a switch; that file is for team rules and is only touched through the editor. |
| MCP global and plugin MCP | `~/.claude.json` under `projects.<absolute project dir>` |

`/api/toggle` takes `scope: "global" | "project"`. The UI shows which file each
switch will write before the click (tooltip) and after (toast and activity log).

Undo: toggles and favorites undo by applying the inverse operation, so two
toggles on the same file undo independently. File edits undo by restoring the
backup that the save produced; only the latest save of a file can be undone and
older entries grey out.

Delete: a Delete button on a local or project skill, agent, settings file, or
CLAUDE.md moves the file to `~/.claude/backups/storehouse/trash/<timestamp>-<name>`
and removes its `skillOverrides` or favorite entry. No OS Trash, no dependency.
Restore is available from the Backups panel.

Out of scope for version 1, listed so they are not forgotten: `~/.claude/commands`,
`./.claude/commands`, `./.claude/rules`, `~/.claude/output-styles`.

## Write safety

1. Read file → parse → modify in memory → serialize with 2-space indent →
   write to `<file>.tmp` → `fs.rename` over the original.
2. Before step 1 writes, copy the original to
   `~/.claude/backups/storehouse/<basename>.<id>.<ISO time>`, where `<id>` is the
   first 12 hex characters of the sha1 of the file's realpath. Keep the last 20
   per file.
3. If parse fails, refuse the write and show the parse error. Never overwrite
   a file the server could not parse.
4. The raw JSON editor validates with `JSON.parse` on the server before write.
5. Every write returns the new file content so the UI re-renders from truth.

## Favorites

Stored in `~/.claude/storehouse.json`:

```json
{
  "favorites": [
    { "kind": "skill", "id": "brainstorming", "source": "superpowers@claude-plugins-official", "order": 0 }
  ],
  "parkedHooks": []
}
```

Favorites are global only. A favorite stays in the list when its item is
switched off; the card shows the off state. A favorite whose item no longer
exists on disk shows as "missing" with a remove button. Drag to reorder.

## Architecture

```
bin/storehouse.js        CLI: parse flags, start server, open browser
src/server.js            http server, static files, JSON API, localhost only
src/scan/
  index.js               scan(projectDir) → Inventory
  settings.js            read settings files, hooks, enabledPlugins, skillOverrides
  skills.js              local + project + plugin skills, frontmatter parse
  agents.js              local + project + plugin agents
  plugins.js             installed_plugins.json + cache folders
  mcp.js                 ~/.claude.json + .mcp.json + plugin .mcp.json
  claudemd.js            all CLAUDE.md candidates
src/write/
  json-file.js           readJson, writeJsonAtomic, backup
  toggles.js             one function per type, each returns the new state
  files.js               read/write text files with path allow-list
  favorites.js           storehouse.json
public/
  index.html             the page (layout approved in the demo v2 mockup)
  app.js                 state, render, API calls
  app.css
test/                    node:test, uses a temp fake HOME and project dir
```

Inventory shape (returned by `GET /api/inventory`):

```ts
{
  project: { dir, hasClaudeDir },
  global: { dir },
  skills: Item[], agents: Item[], plugins: Plugin[],
  hooks: Hook[], mcp: McpServer[],
  settings: { global, project, projectLocal },
  claudeMd: { global, project, projectLocal, projectClaudeDir },
  favorites: Favorite[]
}
Item = { kind, name, description, scope: "global"|"project"|"plugin",
         source, plugin?, path, enabled, favorite, readOnly }
```

API:

| Method | Path | Body | Effect |
|---|---|---|---|
| GET | `/api/inventory` | — | full scan |
| GET | `/api/file?path=` | — | text of a file on the allow-list |
| PUT | `/api/file` | `{path, content}` | backup + write, allow-list only |
| POST | `/api/toggle` | `{kind, name, scope, enabled}` | one toggle per table above |
| POST | `/api/favorite` | `{kind, name, source, favorite}` | storehouse.json |
| PUT | `/api/favorites/order` | `[ids]` | reorder |
| POST | `/api/hook` | `{scope, event, matcher, command}` | add |
| DELETE | `/api/hook` | `{scope, event, index}` | remove |
| POST | `/api/mcp` | `{scope, name, config}` | add |
| DELETE | `/api/mcp` | `{scope, name}` | remove |
| DELETE | `/api/file` | `{path}` | move to backups trash |
| POST | `/api/undo` | `{entryId}` | inverse of a logged toggle or favorite |
| POST | `/api/create` | `{what: "claudemd"\|"projectSettings"\|…, template}` | create file |
| GET | `/api/backups?path=` | — | list |
| POST | `/api/restore` | `{backup}` | restore, with backup of current |
| POST | `/api/fork` | `{kind, name}` | copy plugin skill to `~/.claude/skills` |
| POST | `/api/open` | `{path, app: "editor"\|"finder"}` | `open` / `code` |

Path allow-list for file read and write: inside `~/.claude` (except
`plugins/cache`, read-only), inside the project dir, plus `~/.claude.json`.
The check runs on the lexical path and on the resolved real path. A symlinked
skill such as `~/.claude/skills/archify -> ~/.agents/skills/archify` is allowed
when the real path is under the home dir. Any other path returns 403.
Loose files such as `~/.claude/skills/code-review.md` are listed as skills.
`.trash` folders and names that start with `.` are skipped.

Security: the server binds `127.0.0.1`, picks a free port, and prints the URL.
It generates a random token, puts it in the URL, and requires it in a header
on every API call. No CORS.

## UI

The layout is the approved demo
(`.superpowers/brainstorm/*/content/dashboard-demo-v2.html`). Pages:
Dashboard, Favorites, Skills, Agents, Plugins, Hooks, MCP, Settings,
CLAUDE.md. Scope filter All / Global / Project. Search with `/`. Detail drawer
with editor, preview, files tab. Activity log with undo in the sidebar.
Confirm dialog for delete. Toast after each write names the file.

Differences from the demo that the build must add:

- Font Figtree.
- Minimum 14 px for all functional text.
- Real data from `/api/inventory`.
- Undo calls `/api/restore` with the backup the write produced.
- "Fork to local" button on plugin skills.
- A banner after any toggle: "Claude Code applies this at the next session."

## Testing

- Unit tests for every scan module against a fixture tree in `test/fixtures/home`
  and `test/fixtures/project`.
- Unit tests for every toggle: start from a fixture, toggle, assert the exact
  JSON, assert the backup exists, assert unrelated keys unchanged.
- One API smoke test that boots the server on a random port and runs
  inventory → toggle → inventory.
- Manual check in Chrome before done: each page, each switch, one edit, one
  undo, against the owner's real `~/.claude` with a copy as backup.

## Left to the builder

- Exact file layout inside `public/` and how render is split.
- Frontmatter parser (hand-written, about 20 lines; no YAML dependency).
- Port selection and token format.
- How "recently changed" on the dashboard is computed (mtime sort is enough).
- Drag and drop implementation for favorites order.
- Windows path handling.

## Decisions made by the assistant, open to override

- No framework; vanilla JS and one HTML file.
- Favorites are global only, not per project.
- Agent off/on uses the `.disabled` rename.
- Hook off/on uses parking in `storehouse.json`.
- Project switches write `settings.local.json`, never `settings.json`.
- Plugin skills have no switch of their own.
- Delete moves to a dashboard trash folder, not the OS Trash.
- Undo is per operation for toggles, per latest save for files.
- Backups live in `~/.claude/backups/storehouse/`, not next to the file.
