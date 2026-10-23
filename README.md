<div align="center">

# Claude Storehouse

**One page for your whole Claude Code setup.**

See, edit, switch on or off, and favorite every skill, agent, plugin, hook, MCP server, setting, and `CLAUDE.md`, for your global `~/.claude` and for the project you are in.

[![npm version](https://img.shields.io/npm/v/claude-storehouse?color=e2725b&label=npm)](https://www.npmjs.com/package/claude-storehouse)
[![CI](https://github.com/Sumonta056/claude-storehouse/actions/workflows/ci.yml/badge.svg)](https://github.com/Sumonta056/claude-storehouse/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/claude-storehouse?color=339933)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/claude-storehouse?color=blue)](https://github.com/Sumonta056/claude-storehouse/blob/main/LICENSE)

```
npx claude-storehouse
```

<img src="https://raw.githubusercontent.com/Sumonta056/claude-storehouse/main/docs/images/dashboard.png" alt="Claude Storehouse dashboard with counts for skills, agents, plugins, hooks and MCP servers, a favorites list, and the project files" width="900">

</div>

## Why

After a few months with Claude Code you have dozens of skills, a handful of plugins from several marketplaces, hooks in two settings files, and MCP servers spread over `~/.claude.json` and `.mcp.json`. The only views are the `/plugin` menu, `/skills`, and raw JSON.

Claude Storehouse reads all of it and shows it on one local page. Switching a skill off is one click instead of a JSON edit. Nothing leaves your machine.

## Quick start

Run it inside the project you want to manage:

```bash
npx claude-storehouse
```

Your browser opens on a local address with a one-time token. Press `Ctrl+C` to stop.

Or install it once:

```bash
npm i -g claude-storehouse
claude-storehouse
```

Requires Node 20 or newer.

## Features

|                             |                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Everything in one place** | Skills, agents, plugins, hooks, MCP servers, settings, and `CLAUDE.md`, split by global and project scope.                                |
| **On / off switches**       | Uses the keys Claude Code itself reads: `enabledPlugins`, `skillOverrides`, and the MCP disable lists.                                    |
| **Edit in place**           | Open any file you own in the drawer, edit it, and save. Plugin cache files stay read-only.                                                |
| **Favorites**               | Star the items you use most, group them in your own categories, and drag them into order. A favorite stays listed when you switch it off. |
| **Undo**                    | Every toggle and favorite can be undone from the activity log. The latest save of each file can be restored.                              |
| **Safe writes**             | Each write makes a backup first, writes a temp file, then renames it. A file that does not parse is never touched.                        |
| **Fork plugin skills**      | Copy a plugin skill into `~/.claude/skills` to make your own version.                                                                     |
| **Uninstall plugins**       | Runs `claude plugin uninstall` for you, with the right scope.                                                                             |

## Screenshots

<table>
  <tr>
    <td><img src="https://raw.githubusercontent.com/Sumonta056/claude-storehouse/main/docs/images/skills.png" alt="Skills page with on/off switches, favorites, and the file each switch writes"></td>
    <td><img src="https://raw.githubusercontent.com/Sumonta056/claude-storehouse/main/docs/images/mcp.png" alt="MCP servers page with transport, command, and source for each server"></td>
  </tr>
  <tr>
    <td align="center">Skills: switch, star, and open any skill</td>
    <td align="center">MCP servers from every source, with secrets masked</td>
  </tr>
  <tr>
    <td colspan="2"><img src="https://raw.githubusercontent.com/Sumonta056/claude-storehouse/main/docs/images/favorites.png" alt="Favorites page with items grouped into Plan, Build, and Review categories"></td>
  </tr>
  <tr>
    <td colspan="2" align="center">Favorites grouped in your own categories</td>
  </tr>
</table>

## Pages

| Page      | Shows                                                                        |
| --------- | ---------------------------------------------------------------------------- |
| Dashboard | Counts, favorites, recent changes, and the files this project has            |
| Favorites | Items you starred, in your own categories and order                          |
| Skills    | Global, project, and plugin skills                                           |
| Agents    | Global, project, and plugin agents                                           |
| Plugins   | Installed plugins and whether they are on                                    |
| Hooks     | Hooks from settings files and plugins                                        |
| MCP       | Servers from `~/.claude.json`, `.mcp.json`, and plugins, with secrets masked |
| Settings  | The global, project, and project-local settings files                        |
| CLAUDE.md | Global and project memory files                                              |

Filter by scope (All, Global, Project) and press `/` to search.

## How on/off works

| Type                         | Off                                                                     | Native to Claude Code |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------- |
| Plugin                       | `enabledPlugins[id] = false`                                            | yes                   |
| Global or project skill      | `skillOverrides[name] = "off"`                                          | yes                   |
| Plugin skill, agent, or hook | no own switch, follows its plugin                                       | n/a                   |
| MCP in `.mcp.json`           | name moves to `disabledMcpjsonServers`                                  | yes                   |
| MCP global or from a plugin  | name added to `disabledMcpServers` for this project in `~/.claude.json` | yes, per project      |
| Hook                         | entry parked in `~/.claude/storehouse.json`                             | no                    |
| Agent                        | file renamed to `name.md.disabled`                                      | no                    |

Global switches write `~/.claude/settings.json`. Project switches write `./.claude/settings.local.json`, never the shared `settings.json`. Claude Code applies changes at the next session.

## CLI options

| Flag            | Default          | Meaning                                              |
| --------------- | ---------------- | ---------------------------------------------------- |
| `--dir <path>`  | current folder   | Project folder to manage. Must exist.                |
| `--home <path>` | your home folder | Folder that holds `.claude`. Must contain `.claude`. |
| `--port <n>`    | free port        | Port to listen on. Exits with an error if busy.      |
| `--no-open`     | off              | Do not open the browser.                             |
| `--help`        |                  | Print usage.                                         |
| `--version`     |                  | Print the version.                                   |

## Safety

- **Backups.** Before any write, the old file is copied to `~/.claude/backups/storehouse/`. The last 20 per file are kept. Delete moves the item to `~/.claude/backups/storehouse/trash/`.
- **Local only.** The server listens on `127.0.0.1` and rejects a foreign `Host` header.
- **Token.** Every API call needs the random token from the start URL. Without it the server returns 401.
- **Allow-list.** Writes are limited to `~/.claude`, `~/.claude.json`, and the project folder. Plugin cache files are read-only.
- **No dependencies to trust.** The only runtime dependency is [`open`](https://www.npmjs.com/package/open), to launch the browser.

## Limitations

1. Plugin skills have no own on/off switch. Switch the plugin.
2. Agent off is a rename to `.md.disabled`.
3. Hook off parks the entry in `~/.claude/storehouse.json`.
4. Changes apply at the next Claude Code session.
5. `commands`, `rules`, and `output-styles` are not shown yet.

## Contributing

Issues and pull requests are welcome. Use the [issue templates](https://github.com/Sumonta056/claude-storehouse/issues/new/choose).

```bash
git clone https://github.com/Sumonta056/claude-storehouse.git
cd claude-storehouse
npm install
npm run check
node bin/storehouse.js --dir <project> --home <fake-home> --no-open
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Tests never touch your real `~/.claude`. Run `node scripts/demo-home.js` to build a demo home with sample data.

See [CHANGELOG.md](https://github.com/Sumonta056/claude-storehouse/blob/main/CHANGELOG.md) for release history.

## License

[MIT](https://github.com/Sumonta056/claude-storehouse/blob/main/LICENSE) © Sumonta Saha Mridul
