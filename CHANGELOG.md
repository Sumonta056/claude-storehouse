# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-24

This release adds a Duplicates page that finds skills, agents, and MCP servers that use the same name, so you can see which ones Claude Code loads and keep only the one you want.

### Added

- Duplicates page: groups skills, agents, and MCP servers of one type that have the same name, across global, project, and plugin scopes. A group shows "Conflict" when more than one item in it is on, and "OK" when one or none is on. The sidebar count shows the groups that need action.
- "Keep only this" on each item in a group switches off the other items that have their own switch. Plugin items show the plugin that controls them.
- A group notes when its items have the same description, which usually means that one item is a copy of the other.
- The website and the live demo show the new page.

### Changed

- The `open` dependency is now version 11. Node 20 or later is still required.
- Development: Node 24 is pinned for development, the dev tools and GitHub Actions are updated, the code passes the ESLint 10 rules, and the npm package has more keywords.

## [1.1.0] - 2026-10-23

This release adds a usage band that shows what your Claude Code use would cost at API prices, a Mods page, a new Activity panel, and a website with a live demo.

### Added

- Dashboard usage band: API-equal cost of your Claude Code use, by model, with total tokens, sessions, projects, and how much the prompt cache saved. It reads only token counts from the session files in `~/.claude/projects`, never message text. A model with no known price counts tokens but no cost, and the band names it.
- Mods page: installed mods (plugins that change Claude Code itself) and the mods in `~/.claude/dev-mods`. Installed mods also stay on the Plugins page with a "Mod" flag. Mods in development are read-only.
- App icon: a terminal prompt with the Claude spark as the cursor, in the browser tab.
- Website at https://sumonta056.github.io/claude-storehouse/ with a live demo. The demo runs the real dashboard in your browser on a sample setup, so you can try switches, favorites, edits, and undo before you install.

### Changed

- Activity panel: an icon for each kind of change, the time of each change, and an empty state that says what shows there.
- Hooks and MCP servers pages: a new layout.
- Favorites: the star opens a category picker. Search for a category or type a new name to create it.
- Drawer: a more compact header.
- New README with a feature tour and screenshots of every main page.

### Fixed

- Skill and agent descriptions that span more than one line in the frontmatter now show in full.

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

[Unreleased]: https://github.com/Sumonta056/claude-storehouse/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Sumonta056/claude-storehouse/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Sumonta056/claude-storehouse/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Sumonta056/claude-storehouse/releases/tag/v1.0.0
