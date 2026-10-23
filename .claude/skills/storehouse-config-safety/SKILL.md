---
name: storehouse-config-safety
description: Rules for any code that reads or writes Claude Code config files (settings.json, settings.local.json, ~/.claude.json, .mcp.json, SKILL.md, agents). Use when writing or reviewing src/write/* or src/scan/*, or when a test needs a fake home folder.
---

# Storehouse config safety

## Where each switch writes

| Item | Scope | File | Key |
|---|---|---|---|
| Plugin | global | `~/.claude/settings.json` | `enabledPlugins["name@marketplace"]` |
| Plugin | project | `./.claude/settings.local.json` | same |
| Local skill | global | `~/.claude/settings.json` | `skillOverrides["name"] = "off"`, on deletes the key |
| Project skill | project | `./.claude/settings.local.json` | same |
| Plugin skill, agent, hook | — | no switch | follows the plugin |
| MCP in `./.mcp.json` | project | `./.claude/settings.local.json` | `enabledMcpjsonServers[]`, `disabledMcpjsonServers[]` |
| MCP global or plugin | per project | `~/.claude.json` → `projects["<abs dir>"].disabledMcpServers[]` | plugin form is `plugin:<plugin>:<server>` |
| Hook | global or project | settings file of that scope | off moves the entry to `~/.claude/storehouse.json` → `parkedHooks` |
| Agent | global or project | agents folder | off renames `name.md` → `name.md.disabled` |

## Write procedure

1. Read the file. Parse. On parse failure return an error and do not write.
2. Change one key in memory. Do not rebuild the object.
3. Copy the original to `~/.claude/backups/storehouse/<basename>.<id>.<ISO time>` (id = first 12 hex of sha1 of the realpath). Keep 20 per file.
4. Serialize with 2-space indent and a trailing newline.
5. Write `<file>.tmp`, then `fs.renameSync` over the original.
6. Return the new content.

If the file does not exist and the write is a switch, create it with `{}` first. For
`settings.local.json` also make sure `.claude/` exists.

## Path allow-list

Read and write are allowed for paths under `~/.claude` (except `plugins/cache`, read-only),
under the project dir, and `~/.claude.json`. Check the lexical path and `fs.realpathSync`.
A symlink target under the home dir is allowed. Everything else is 403.

## Tests

Never use the real home. Build a fixture with `fs.mkdtempSync` and pass it as `home`.
Every toggle test asserts three things: the exact key after the write, the backup file
exists, and an unrelated key in the same file is unchanged.
