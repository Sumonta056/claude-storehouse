---
paths:
  - 'src/**'
  - 'test/**'
  - 'bin/**'
---

# Config safety

Full detail and the switch table: skill `storehouse-config-safety`.

## Never

- Never write to the real `~/.claude`, `~/.claude.json`, or a real project `.claude` during development or tests. Use a temp HOME and `--home <fakeHome>`.
- Never drop keys from `settings.json` or `~/.claude.json`. Change one key in memory. Do not rebuild the object.
- Never overwrite a file that the server could not parse. Refuse the write and return the parse error.
- Never write to `~/.claude/plugins/cache`. Plugin cache files are read-only.
- Never write `./.claude/settings.json` for a switch. Project switches write `./.claude/settings.local.json`.

## Write procedure

1. Read the file and parse it. On parse failure, refuse.
2. Copy the original to `~/.claude/backups/storehouse/<basename>.<id>.<ISO time>`. `<id>` is the first 12 hex characters of the sha1 of the realpath. Keep the last 20 per file.
3. Serialize with 2-space indent and a trailing newline.
4. Write `<file>.tmp`, then rename it over the original.
5. Return the new content so the UI renders from the file on disk.

A switch on a file that does not exist creates it with `{}` first. For `settings.local.json`, also create `.claude/`.

## Path allow-list

- Allowed: paths under `~/.claude` (except `plugins/cache`, read-only), paths under the project folder, and `~/.claude.json`.
- Check the lexical path and the real path. A symlink target under the home folder is allowed.
- Any other path returns 403.

## Doctor

- Doctor responses hold env key names, never values. `readMcpRaw` in `src/scan/mcp.js` returns the command and `${VAR}` names only. The inventory keeps the masked values.
- Doctor reads files and never writes one or runs a command.

## Server security

- Bind `127.0.0.1` only. Reject a foreign Host header.
- A random token is in the start URL. Every API call must send it, or the server returns 401.
- No CORS.
