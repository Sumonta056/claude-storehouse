# Claude Storehouse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `npx claude-storehouse` command that opens a local dashboard of every Claude Code skill, agent, plugin, hook, MCP server, settings file, and CLAUDE.md for the global and the current project scope, with edit, on/off, and favorites.

**Architecture:** A Node http server scans `~/.claude`, `~/.claude.json`, and `./.claude` into one Inventory JSON and exposes a small token-protected API. Writes go through one atomic JSON helper with backups. One static HTML page renders the Inventory and calls the API.

**Tech Stack:** Node 20, ESM (`"type": "module"`), built-ins only plus `open`. Tests with `node --test`. Vanilla JS UI, Figtree font.

**Spec:** `docs/superpowers/specs/2026-10-23-claude-storehouse-design.md`

**Project skills to load:** `.claude/skills/storehouse-config-safety/SKILL.md` for Tasks 1 to 9. `.claude/skills/storehouse-verify/SKILL.md` before any "done". Run agent `toggle-reviewer` after Tasks 7 and 8.

## Global Constraints

- Node `>=20`. No native modules. Runtime dependency: `open` only.
- No comments in code.
- Tests never touch the real home. Every function that reads config takes `home` and `projectDir` as parameters.
- Project switches write `./.claude/settings.local.json`, never `./.claude/settings.json`.
- Every config write: backup to `<home>/.claude/backups/storehouse/<basename>.<id>.<ISO time>` (id = first 12 hex of sha1 of the file's realpath), then temp file, then rename. Keep 20 backups per file.
- Plugin cache (`<home>/.claude/plugins/cache`) is read-only. Plugin skills, agents, hooks have no toggle.
- Server binds `127.0.0.1`. Every `/api/*` request needs header `x-storehouse-token` equal to the token in the URL.
- UI: Figtree from Google Fonts with `system-ui` fallback. Functional text `font-size` 14 px or larger.

## Review Focus

1. `settings.json` with a JSON syntax error. Expected: scan reports the error on that file, other sections still render, toggles on that file are refused. Test in Task 3 and Task 7.
2. A skill folder without `SKILL.md`, a loose `name.md` file, a `.trash` folder, a symlink to outside `~/.claude`. Expected: folder without SKILL.md is skipped, loose file is listed, `.trash` skipped, symlink listed with real path and allowed when under home. Test in Task 5 and Task 2.
3. `installed_plugins.json` entry whose `installPath` no longer exists. Expected: plugin listed with `missing: true`, no crash. Test in Task 4.
4. Toggle on a project item when `./.claude/` does not exist. Expected: folder and `settings.local.json` are created. Test in Task 7.
5. Two toggles on the same file then undo of the first. Expected: second toggle survives. Test in Task 8.

---

### Task 1: Package scaffold and atomic JSON file helper

**Files:**
- Create: `package.json`, `.gitignore` (add `node_modules/`, `.superpowers/`), `src/write/json-file.js`, `test/helpers/fixture.js`, `test/write/json-file.test.js`

**Interfaces:**
- Produces: `readJson(path) -> {ok: true, data} | {ok: false, error, raw}`; `writeJsonAtomic(path, data, home) -> {backup: string|null}`; `backupFile(path, home) -> string|null` (null when file did not exist); `listBackups(path, home) -> string[]` newest first.
- Produces: `makeFixture() -> {home, projectDir, cleanup}` which copies `test/fixtures/home` and `test/fixtures/project` into a temp dir.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-storehouse",
  "version": "0.1.0",
  "type": "module",
  "bin": { "claude-storehouse": "bin/storehouse.js" },
  "files": ["bin", "src", "public"],
  "scripts": { "test": "node --test test/", "start": "node bin/storehouse.js" },
  "engines": { "node": ">=20" },
  "dependencies": { "open": "^10.1.0" }
}
```

Run `npm install`.

- [ ] **Step 2: Write `test/helpers/fixture.js`**

`makeFixture()` uses `fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-'))`, copies `test/fixtures/home` to `<tmp>/home` and `test/fixtures/project` to `<tmp>/project` with `fs.cpSync(..., {recursive: true, verbatimSymlinks: true})`, returns `{home, projectDir, cleanup}`. Fixtures are created in Task 3 to 6; for this task create only `test/fixtures/home/.claude/settings.json` with `{"model":"fable","skillOverrides":{"old":"off"}}` and an empty `test/fixtures/project/.gitkeep`.

- [ ] **Step 3: Write failing tests `test/write/json-file.test.js`**

```js
test('readJson returns ok false with error on bad json', ...)   // write "{bad" to a temp file, assert ok === false and typeof error === 'string'
test('writeJsonAtomic writes backup then file, keeps other keys', ...) // write {model:'fable',skillOverrides:{old:'off'}}, call writeJsonAtomic with data where skillOverrides.new='off'; assert file has model 'fable', backup path exists under home/.claude/backups/storehouse/, no .tmp left
test('writeJsonAtomic keeps at most 20 backups', ...)            // 22 writes, assert listBackups(...).length === 20
test('backupFile returns null when file is missing', ...)
```

- [ ] **Step 4: Run `npm test`, expect FAIL on import**

- [ ] **Step 5: Implement `src/write/json-file.js`**

Backup name: `${path.basename(real)}.${id}.${new Date().toISOString().replace(/[:.]/g, '-')}`, where `real` is the file's realpath and `id` is the first 12 hex characters of the sha1 of `real`. Serialize with `JSON.stringify(data, null, 2) + '\n'`. Temp file is `${file}.tmp`, then `fs.renameSync`.

- [ ] **Step 6: Run `npm test`, expect PASS**

- [ ] **Step 7: Ask the user, then commit** `feat: scaffold package and atomic json helper`

---

### Task 2: Path allow-list and text file access

**Files:**
- Create: `src/write/paths.js`, `src/write/files.js`, `test/write/paths.test.js`, `test/write/files.test.js`

**Interfaces:**
- Produces: `isAllowed(file, {home, projectDir}) -> {allowed: boolean, readOnly: boolean, reason?: string}`; `readText(file, ctx) -> {ok, content|error}`; `writeText(file, content, ctx) -> {ok, backup|error}`; `deleteToTrash(file, ctx) -> {ok, trashPath|error}`.

- [ ] **Step 1: Write failing tests**

```js
test('allows path under home/.claude', ...)
test('allows ~/.claude.json', ...)
test('allows path under projectDir', ...)
test('marks plugins/cache as readOnly', ...)
test('rejects path outside', ...)                      // os.tmpdir() root -> allowed false
test('allows symlink whose real path is under home', ...)  // symlink home/.claude/skills/x -> home/.agents/skills/x
test('rejects symlink whose real path is outside home', ...)
test('writeText refuses readOnly', ...)
test('deleteToTrash moves file to home/.claude/backups/storehouse/trash/<stamp>-<name>', ...)
```

- [ ] **Step 2: Run tests, expect FAIL**

- [ ] **Step 3: Implement `paths.js` and `files.js`**

`isAllowed` resolves `path.resolve(file)` and `fs.realpathSync` when the path exists; both must be under one of: `<home>/.claude`, `<home>/.claude.json`, `<projectDir>`. If under `<home>/.claude/plugins/cache`, `readOnly: true`. A real path under `<home>` but outside those roots is allowed only when the lexical path is under `<home>/.claude` (the symlink case). `writeText` calls `backupFile` from Task 1, then temp file and rename.

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Ask the user, then commit** `feat: path allow-list and text file access`

---

### Task 3: Settings scanner

**Files:**
- Create: `src/scan/settings.js`, `test/scan/settings.test.js`, fixtures `test/fixtures/home/.claude/settings.json` (replace with the full one below), `test/fixtures/project/.claude/settings.json`, `test/fixtures/project/.claude/settings.local.json`

**Interfaces:**
- Produces: `scanSettings({home, projectDir}) -> { files: SettingsFile[], hooks: Hook[], enabledPlugins: Record<string, boolean>, skillOverrides: Record<string, string>, mcpJsonLists: {enabled: string[], disabled: string[]} }`
- `SettingsFile = {scope: 'global'|'project'|'projectLocal', path, exists, ok, error?, data?}`
- `Hook = {scope, event, matcher, command, type, timeout?, index: {event, group, hook}, path}`
- Merge order for `enabledPlugins`, `skillOverrides`, lists: global, then project, then projectLocal (later wins).

- [ ] **Step 1: Write fixtures**

Global settings: `model`, `enabledPlugins` with `"superpowers@claude-plugins-official": true` and `"ecc@ecc": false`, `skillOverrides` with `"java-clean-code": "off"`, `hooks.Stop` with one command hook `~/.claude/hooks/stop.sh`, `hooks.PreToolUse` with matcher `Bash` and one hook. Project `settings.json`: `permissions.allow: ["Bash(npm test:*)"]`, `hooks.PreToolUse` with matcher `Bash(rm:*)`. Project `settings.local.json`: `enabledPlugins` with `"code-review@claude-plugins-official": true`, `skillOverrides` with `"deploy-checklist": "off"`, `enabledMcpjsonServers: ["postgres"]`, `disabledMcpjsonServers: ["redis"]`.

- [ ] **Step 2: Write failing tests**

```js
test('lists three settings files with exists flags', ...)
test('flattens hooks with scope and index', ...)           // 3 hooks; the project one has scope 'project', index {event:'PreToolUse', group:0, hook:0}
test('merges enabledPlugins and skillOverrides later wins', ...)
test('reports parse error for a broken file and still returns others', ...)  // overwrite project settings.json with "{bad" in the fixture copy
test('mcpJsonLists come from settings.local.json', ...)
```

- [ ] **Step 3: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 4: Ask the user, then commit** `feat: settings scanner`

---

### Task 4: Plugins scanner

**Files:**
- Create: `src/scan/plugins.js`, `test/scan/plugins.test.js`, fixtures `test/fixtures/home/.claude/plugins/installed_plugins.json`, `test/fixtures/home/.claude/plugins/cache/claude-plugins-official/superpowers/1.0.0/{.claude-plugin/plugin.json, skills/brainstorming/SKILL.md, agents/reviewer.md, hooks/hooks.json, .mcp.json}`, and `cache/ecc/ecc/1.0.0/.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: `scanSettings().enabledPlugins`.
- Produces: `scanPlugins({home, projectDir, enabledPlugins}) -> Plugin[]`
- `Plugin = {id: 'superpowers@claude-plugins-official', name, marketplace, version, scope: 'global'|'project', installPath, missing: boolean, enabled: boolean, description, skills: string[], agents: string[], hooks: Hook[] (scope 'plugin', plugin id), mcp: {name, config}[]}`
- An entry with `scope: 'project'|'local'` is included only when its `projectPath` equals `projectDir`.

- [ ] **Step 1: Write fixtures.** `installed_plugins.json` version 2 with superpowers (user scope), ecc (user scope), `code-review@claude-plugins-official` (project scope, `projectPath` set to the literal string `__PROJECT__`, which `makeFixture` replaces with the real temp project path), and `ghost@x` with a non-existent installPath.

- [ ] **Step 2: Write failing tests**

```js
test('lists user-scope plugins with enabled from settings', ...)   // superpowers enabled true, ecc false
test('includes project-scope plugin only for matching projectDir', ...)
test('marks missing installPath', ...)                              // ghost.missing === true
test('reads skills agents hooks and mcp from the cache folder', ...) // superpowers.skills includes 'brainstorming', agents 'reviewer', hooks length 1, mcp[0].name
```

- [ ] **Step 3: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 4: Ask the user, then commit** `feat: plugins scanner`

---

### Task 5: Skills and agents scanner with frontmatter

**Files:**
- Create: `src/scan/frontmatter.js`, `src/scan/skills.js`, `src/scan/agents.js`, tests for each, fixtures `test/fixtures/home/.claude/skills/{html-report/SKILL.md, java-clean-code/SKILL.md, loose.md, nodesc/, .trash/x/SKILL.md}`, `test/fixtures/home/.claude/agents/{my-agent.md, parked.md.disabled}`, `test/fixtures/project/.claude/skills/deploy-checklist/SKILL.md`, `test/fixtures/project/.claude/agents/repo-explainer.md`

**Interfaces:**
- Produces: `parseFrontmatter(text) -> {name?, description?, body}` (supports `key: value` lines between `---` fences; no YAML lists).
- Produces: `scanSkills({home, projectDir, plugins, skillOverrides}) -> Item[]`, `scanAgents({home, projectDir, plugins}) -> Item[]`
- `Item = {kind: 'skill'|'agent', name, description, scope: 'global'|'project'|'plugin', source, plugin?: pluginId, path, realPath, enabled, readOnly, canToggle, favorite: false}`
- Skill `enabled` = `skillOverrides[name] !== 'off'` for global and project; for plugin skills `enabled` = plugin enabled, `canToggle: false`. Agent `enabled` = file does not end with `.md.disabled`; plugin agents `canToggle: false`. Agent `name` strips `.md` and `.md.disabled`.

- [ ] **Step 1: Write failing tests**

```js
test('parseFrontmatter reads name and description', ...)
test('parseFrontmatter without fences returns empty meta', ...)
test('scanSkills lists global project and plugin skills', ...)     // html-report global, deploy-checklist project, brainstorming plugin
test('skips folder without SKILL.md and .trash, lists loose md', ...)
test('skill enabled follows skillOverrides', ...)                   // java-clean-code enabled false
test('plugin skill is readOnly and canToggle false', ...)
test('scanAgents reads disabled from file suffix', ...)             // parked enabled false, name 'parked'
```

- [ ] **Step 2: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 3: Ask the user, then commit** `feat: skills and agents scanners`

---

### Task 6: MCP and CLAUDE.md scanners, inventory

**Files:**
- Create: `src/scan/mcp.js`, `src/scan/claudemd.js`, `src/scan/index.js`, tests, fixtures `test/fixtures/home/.claude.json` (with `mcpServers.kubernetes`, `projects.__PROJECT__.mcpServers.aws`, `projects.__PROJECT__.disabledMcpServers: ["aws", "plugin:superpowers:demo"]`), `test/fixtures/project/.mcp.json` (postgres, redis), `test/fixtures/home/.claude/CLAUDE.md`, `test/fixtures/project/CLAUDE.md`

**Interfaces:**
- Produces: `scanMcp({home, projectDir, plugins, mcpJsonLists}) -> McpServer[]`, `McpServer = {name, scope: 'global'|'project'|'plugin', plugin?, transport: 'stdio'|'http'|'sse', command|url, config, enabled, canToggle: true, path, disabledKey}` where `disabledKey` is `name` for global and `plugin:<plugin>:<name>` for plugin servers. Project server `enabled` = in enabled list and not in disabled list.
- Produces: `scanClaudeMd({home, projectDir}) -> {global, project, projectLocal, projectClaudeDir}` each `{path, exists, size}`.
- Produces: `scanAll({home, projectDir}) -> Inventory` as the spec shape, with `favorites` merged in from Task 8 (`[]` until then) and `errors: {path, error}[]`.

- [ ] **Step 1: Write failing tests**

```js
test('scanMcp lists global project and plugin servers with enabled', ...)   // kubernetes true, aws false, postgres true, redis false, plugin demo false
test('scanClaudeMd reports exists and size', ...)
test('scanAll returns every section and errors array', ...)
```

- [ ] **Step 2: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 3: Ask the user, then commit** `feat: mcp and claude.md scanners, inventory`

---

### Task 7: Toggles

**Files:**
- Create: `src/write/toggles.js`, `test/write/toggles.test.js`

**Interfaces:**
- Consumes: `readJson`, `writeJsonAtomic` (Task 1), `scanAll` (Task 6).
- Produces: `toggle({kind, name, scope, enabled, plugin?}, ctx) -> {ok, file, backup, undo: {kind, name, scope, enabled}} | {ok: false, error}` where `kind` is `'plugin'|'skill'|'mcp'|'hook'|'agent'` and `scope` is `'global'|'project'`.
- Target file per scope: global `<home>/.claude/settings.json`; project `<projectDir>/.claude/settings.local.json` (create dir and `{}` when missing). MCP global and plugin: `<home>/.claude.json` under `projects[projectDir].disabledMcpServers`. MCP project: `settings.local.json` lists. Hook: moves between settings file and `<home>/.claude/storehouse.json` → `parkedHooks` (`{scope, event, matcher, hook, index}`); for hook `name` is the hook command and the request also carries `event` and `index`. Agent: rename.
- Refuses with `ok: false` when `kind` is skill/agent/hook and the item is from a plugin, or when the target file fails to parse.

- [ ] **Step 1: Write failing tests**

```js
test('plugin off writes enabledPlugins false in global settings and keeps model', ...)
test('skill off writes skillOverrides off, on deletes the key', ...)
test('project skill writes settings.local.json and creates .claude when missing', ...)  // delete project/.claude first
test('refuses plugin skill', ...)
test('mcp project off moves name from enabled to disabled list', ...)
test('mcp global off adds to disabledMcpServers in .claude.json for projectDir', ...)
test('mcp plugin off adds plugin:<plugin>:<name>', ...)
test('hook off parks entry and removes it from settings, on restores same index', ...)
test('agent off renames to .md.disabled and on renames back', ...)
test('refuses when settings file is broken json', ...)
test('every successful toggle returns a backup path that exists', ...)
```

- [ ] **Step 2: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 3: Run agent `toggle-reviewer` on `src/write/toggles.js`. Fix blocking findings.**

- [ ] **Step 4: Ask the user, then commit** `feat: toggles for plugin skill mcp hook agent`

---

### Task 8: Favorites, activity log, undo

**Files:**
- Create: `src/write/favorites.js`, `src/write/activity.js`, tests

**Interfaces:**
- Produces: `loadStore(home) -> {favorites: Favorite[], parkedHooks: []}` (creates `<home>/.claude/storehouse.json` when missing); `setFavorite({kind, name, source, favorite}, home) -> Favorite[]`; `reorderFavorites(ids: string[], home) -> Favorite[]`; `Favorite = {id: kind+':'+source+':'+name, kind, name, source, order}`.
- Produces: `Activity` class in `activity.js`: `record({file, message, undo}) -> entry {id, time, file, message, canUndo}`; `undo(id, ctx) -> result` which calls `toggle(entry.undo, ctx)` for toggles, `setFavorite` inverse for favorites, or `restoreBackup` for file saves (only when the entry is the latest save for that file); `list() -> entry[]` newest first.
- Produces: `restoreBackup(backupPath, targetPath, home) -> {ok, backup}` (backs up current target first) in `json-file.js`.
- `scanAll` now merges `favorite: true` into items and returns `favorites` with `{...favorite, exists, enabled}` resolved from the inventory.

- [ ] **Step 1: Write failing tests**

```js
test('setFavorite adds then removes', ...)
test('favorite survives item toggle off and reports enabled false', ...)   // scanAll after toggle skill off
test('favorite of a missing item reports exists false', ...)
test('reorderFavorites sets order by position', ...)
test('undo of first toggle does not revert second toggle on same file', ...)
test('undo of an older file save is refused', ...)
```

- [ ] **Step 2: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 3: Run agent `toggle-reviewer` on `src/write/activity.js`.**

- [ ] **Step 4: Ask the user, then commit** `feat: favorites and undo`

---

### Task 9: HTTP server and API

**Files:**
- Create: `src/server.js`, `src/api.js`, `test/server.test.js`

**Interfaces:**
- Produces: `startServer({home, projectDir, port: 0, token}) -> Promise<{url, port, close}>`.
- Routes exactly as the spec API table plus `GET /api/activity`, `POST /api/undo {entryId}`, `DELETE /api/file {path}`. Static files from `public/` at `/`. All `/api/*` need `x-storehouse-token`; wrong or missing returns 401. Any `ok: false` result returns 400 with `{error}`. 403 for a path the allow-list refuses.
- `POST /api/open {path, app}` runs `open -R` (finder) or `open -a "Visual Studio Code"` then falls back to `open`; on Linux `xdg-open`.
- `POST /api/fork {kind: 'skill', name, plugin}` copies the plugin skill folder to `<home>/.claude/skills/<name>`; refuses when the target exists.
- `POST /api/create {what, template}` with `what` in `claudemd | claudemdLocal | projectSettings | projectSettingsLocal | mcpJson` and `template` in `'default' | 'empty'`. Default CLAUDE.md template is the one in the mockup v2.

- [ ] **Step 1: Write failing tests** (boot on port 0 with fixture)

```js
test('401 without token', ...)
test('GET /api/inventory returns sections', ...)
test('POST /api/toggle then inventory shows change', ...)
test('PUT /api/file outside allow-list is 403', ...)
test('PUT then GET /api/file round trips and creates backup', ...)
test('POST /api/fork copies plugin skill and refuses second time', ...)
test('POST /api/create claudemd writes file', ...)
```

- [ ] **Step 2: Run, expect FAIL. Implement. Run, expect PASS.**

- [ ] **Step 3: Ask the user, then commit** `feat: http server and api`

---

### Task 10: CLI

**Files:**
- Create: `bin/storehouse.js`, `README.md`

**Interfaces:**
- Flags: `--dir <path>` (default `process.cwd()`), `--home <path>` (default `os.homedir()`), `--port <n>` (default 0), `--no-open`. Prints `Storehouse running at <url>` and the project dir. Token: `crypto.randomBytes(16).toString('hex')`. Opens the browser with `open` unless `--no-open`. Ctrl+C closes.

- [ ] **Step 1: Implement, then run** `node bin/storehouse.js --dir . --home <fixture home> --no-open` and `curl` the inventory with the token. Expected: JSON with `skills` array.

- [ ] **Step 2: Write `README.md`**: one paragraph, usage, flags, the limitations list from `plot.md`.

- [ ] **Step 3: Ask the user, then commit** `feat: cli`

---

### Task 11: UI shell and catalog pages

**Files:**
- Create: `public/index.html`, `public/app.css`, `public/app.js`, `public/api.js`

**Interfaces:**
- Consumes: `GET /api/inventory`. Token read from `location.search` and sent as header by `api.js` (`get(path)`, `send(method, path, body)`).
- Produces: `state = {inventory, scope: 'all'|'global'|'project', query, page}`; `render()` re-renders the current page from state; `go(page)`.
- Layout: port of `.superpowers/brainstorm/*/content/dashboard-demo-v2.html`: sidebar nav with counts, scope filter, search with `/`, Dashboard (stat tiles, favorites, this project, recently changed by mtime), Favorites, Skills, Agents, Plugins pages grouped by scope. Cards show the switch disabled with "via plugin X" when `canToggle` is false. Each toggle calls `POST /api/toggle` and re-renders from the response. Star calls `POST /api/favorite`. The Favorites page supports drag to reorder with native HTML5 drag events and calls `PUT /api/favorites/order` on drop.
- Font: `<link>` to Google Fonts Figtree 400, 500, 600, 700; `font-family: Figtree, system-ui, sans-serif`. CSS tokens on `:root`. No `font-size` under 14 px for text; tags use 14 px with reduced padding.
- After each toggle show the banner "Claude Code applies this at the next session" once per page load.

- [ ] **Step 1: Build the shell and the five catalog pages against the real server with a fake home** (recipe in `storehouse-verify`).

- [ ] **Step 2: Chrome check items 1 to 6 and 9, 10 from `storehouse-verify`. Paste evidence.**

- [ ] **Step 3: Ask the user, then commit** `feat: ui shell and catalog pages`

---

### Task 12: Drawer, editor, activity, undo

**Files:**
- Modify: `public/app.js`, `public/index.html`, `public/app.css`

**Interfaces:**
- Consumes: `GET/PUT/DELETE /api/file`, `GET /api/backups`, `POST /api/restore`, `POST /api/fork`, `POST /api/open`, `GET /api/activity`, `POST /api/undo`.
- Drawer for skill and agent: tabs SKILL.md (textarea, disabled when `readOnly`), Preview (headings and paragraphs only), Files (folder listing from `GET /api/file?path=<dir>` which returns `{entries}` for a directory). Buttons: Save, Open in VS Code, Reveal in Finder, Copy path, Delete (confirm), Fork to local (plugin skills only). Unsaved marker and discard confirm on close and Escape.
- Drawer for plugin: included skills and agents with disabled switches, files list.
- Activity panel in sidebar from `GET /api/activity`, each entry with undo when `canUndo`.

- [ ] **Step 1: Build.**

- [ ] **Step 2: Chrome check items 7, 8, 9 plus: plugin skill drawer is read-only and shows Fork; fork creates `<fakeHome>/.claude/skills/<name>`; delete moves to trash folder.**

- [ ] **Step 3: Ask the user, then commit** `feat: drawer editor and undo`

---

### Task 13: Hooks, MCP, Settings, CLAUDE.md pages

**Files:**
- Modify: `public/app.js`, `public/index.html`, `public/app.css`

**Interfaces:**
- Consumes: `POST/DELETE /api/hook`, `POST/DELETE /api/mcp`, `POST /api/create`, `PUT /api/file`.
- Hooks table with scope tag, switch (disabled for plugin), delete with confirm, add form (scope, event, matcher, command). Row click opens the drawer with the hook JSON.
- MCP table with the same pattern, add form (scope, name, transport, command or url, env as `KEY=VALUE` lines).
- Settings page: global form (model, effortLevel, outputStyle, theme, autoMode, skipDangerousModePermissionPrompt) and raw JSON tab; backups list with restore; project `settings.json` and `settings.local.json` panels with create, edit, save, delete.
- CLAUDE.md page: global and project panels with Edit, Save, Cancel, Create from template or empty, Delete; also `CLAUDE.local.md` and `.claude/CLAUDE.md` rows.

- [ ] **Step 1: Build.**

- [ ] **Step 2: Chrome check: add hook appears in `<fakeHome>/.claude/settings.json`; add MCP appears in `.mcp.json` for project scope; settings form save keeps every other key; CLAUDE.md create and save write the file; console clean.**

- [ ] **Step 3: Ask the user, then commit** `feat: hooks mcp settings claude.md pages`

---

### Task 14: Final verification

- [ ] **Step 1: `npm test` all green. Paste the summary line.**
- [ ] **Step 2: Full `storehouse-verify` Chrome check list against a fresh fake home copied from the real `~/.claude`. Paste pass or fail per item.**
- [ ] **Step 3: `npx .` from a different folder opens the dashboard for that folder.**
- [ ] **Step 4: Run agent `agent-skills:code-reviewer` on the whole branch. Fix blocking findings.**
- [ ] **Step 5: Ask the user, then commit** `chore: final verification`
