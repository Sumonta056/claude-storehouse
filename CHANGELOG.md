# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-23

First stable release. Claude Storehouse is a local web dashboard for your Claude Code setup. Run `npx claude-storehouse` in any folder to see, edit, switch on or off, and favorite every skill, agent, plugin, hook, MCP server, settings file, and `CLAUDE.md`, for your global `~/.claude` and for the current project.

### Added

**Browse**

- One page with Dashboard, Favorites, Skills, Agents, Plugins, Hooks, MCP servers, Settings, and CLAUDE.md views.
- Scope filter (All, Global, Project) and search with `/`.
- Dashboard with counts, favorites, recently changed items, and the config files this project has.
- MCP servers from `~/.claude.json`, `.mcp.json`, and plugins, with env and header values masked.
- Global-only mode when you run it from your home folder.

**Switch on and off**

- Plugins through `enabledPlugins`, and global or project skills through `skillOverrides`, the keys Claude Code itself reads.
- MCP servers through the `.mcp.json` lists or the per-project `disabledMcpServers` list in `~/.claude.json`.
- Hooks are parked in `~/.claude/storehouse.json`, and agents are renamed to `.md.disabled`.
- Plugin skills, agents, and hooks follow their plugin and show "via plugin".
- Project switches write `.claude/settings.local.json`, never the shared `settings.json`.

**Edit and manage**

- Detail drawer to read, edit, and save any file you own. Plugin cache files are read-only.
- Add and remove hooks and MCP servers.
- Create a missing `CLAUDE.md`, `CLAUDE.local.md`, `.claude/settings.json`, `.claude/settings.local.json`, or `.mcp.json`.
- Fork a plugin skill into `~/.claude/skills`.
- Uninstall a plugin through `claude plugin uninstall`, with the right scope.
- Open a file in your editor or show it in Finder.
- Delete moves a file to `~/.claude/backups/storehouse/trash/`.

**Favorites**

- Star skills, agents, and plugins, and drag them into your own order.
- Group favorites in your own categories. Rename and delete a category, and drag items between categories.
- A favorite stays listed when you switch it off, and shows "missing" when its file is gone.

**Undo and backups**

- Activity log with undo for every toggle, favorite, and category change.
- Restore the latest save of any file from its backup.

**CLI**

- Flags `--dir`, `--home`, `--port`, `--no-open`, `--help`, and `--version`.

### Security

- Every write makes a backup, writes a temp file, and renames it. A file that does not parse is never overwritten.
- The server listens on `127.0.0.1` only, rejects a foreign `Host` header, and needs the random token from the start URL on every API call.
- Reads and writes are limited to `~/.claude`, `~/.claude.json`, and the project folder.

### Changed

- New README with screenshots, MIT license, and full npm package metadata.
- Development: ESLint, Prettier, Husky, and commitlint; CI on Node 20 and 22 on Ubuntu and macOS; tag-driven npm publish with provenance.

[Unreleased]: https://github.com/Sumonta056/claude-storehouse/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Sumonta056/claude-storehouse/releases/tag/v1.0.0
