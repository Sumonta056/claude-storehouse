# claude-storehouse

Claude Storehouse is a local dashboard for your Claude Code configuration. It scans your global `~/.claude` folder and the current project's `.claude` folder, lists every plugin, skill, agent, hook, MCP server, settings file and `CLAUDE.md` in one browser page, and lets you read, edit, favorite, switch on or off, create and delete them. Every write is backed up first. Toggles, favorites and the latest save of each file can be undone.

## Install and run

Run it inside the project you want to manage:

```
npx claude-storehouse
```

Or install it once:

```
npm i -g claude-storehouse
claude-storehouse
```

Node 20 or newer is required. The browser opens on a local address that carries a one-time token.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--dir <path>` | current folder | Project folder to manage. Must exist. |
| `--home <path>` | your home folder | Folder that holds `.claude`. Must contain `.claude`. |
| `--port <n>` | free port | Port to listen on. Exits with an error if it is busy. |
| `--no-open` | off | Do not open the browser. |
| `--help` | | Print usage. |
| `--version` | | Print the version. |

## Pages

| Page | Shows |
|---|---|
| Dashboard | Counts and recent activity |
| Favorites | Items you starred, in your own order |
| Skills | Global, project and plugin skills |
| Agents | Global, project and plugin agents |
| Plugins | Installed plugins and whether they are enabled |
| Hooks | Hooks from settings files and plugins |
| MCP | Servers from `~/.claude.json`, `.mcp.json` and plugins, with secrets masked |
| Settings | The three settings files |
| CLAUDE.md | Global and project memory files |

Use the scope filter (All, Global, Project), search with `/`, and open any item to edit it. The activity log in the sidebar lets you undo a change.

## How on/off works

| Type | Off | Native to Claude Code |
|---|---|---|
| Plugin | `enabledPlugins[id] = false` | yes |
| Local or project skill | `skillOverrides[name] = "off"` | yes |
| Plugin skill | no switch, follows the plugin | n/a |
| MCP in `.mcp.json` | name moves to `disabledMcpjsonServers` | yes |
| MCP global or from a plugin | name added to `disabledMcpServers` for this project in `~/.claude.json` | yes, per project |
| Hook | entry parked in `~/.claude/storehouse.json` | no |
| Agent | file renamed to `name.md.disabled` | no |
| Plugin agent or hook | follows the plugin | n/a |

Global switches write `~/.claude/settings.json`. Project switches write `./.claude/settings.local.json`, never `settings.json`.

## Limitations

1. Plugin skills have no own on/off switch. Switch the plugin.
2. Agent off is a rename to `.md.disabled`.
3. Hook off parks the entry in `~/.claude/storehouse.json`.
4. Changes apply at the next Claude Code session.
5. `commands`, `rules` and `output-styles` are out of scope for version 1.

## Safety

- Before any write, the old file is copied to `~/.claude/backups/storehouse/`. Delete moves the item to `~/.claude/backups/storehouse/trash/`.
- The server listens on `127.0.0.1` only and rejects requests with a foreign Host header.
- Every API call needs the random token printed in the start URL. Anyone without it gets 401.
- Writes are limited to `~/.claude`, `~/.claude.json` and the project folder. Plugin cache files are read only.
