---
name: storehouse-verify
description: How to prove a claude-storehouse task is done. Use before claiming any task complete, before a commit, and after any UI change. Covers npm test, a safe fake home for the server, and the Chrome check list.
---

# Storehouse verify

## 1. Tests

```
npm test
```

Paste the last lines of the output in the reply. A task with a failing or skipped test is not done.

## 2. Fake home for manual checks

Never point the server at the real `~/.claude`. Build a copy:

```
FAKE=$(mktemp -d)/home
mkdir -p "$FAKE"
cp -R ~/.claude "$FAKE/.claude"
cp ~/.claude.json "$FAKE/.claude.json"
node bin/storehouse.js --dir "$PWD" --home "$FAKE" --no-open
```

The server prints the URL with its token.

## 3. Chrome check list

Open your own tab with `new_page`, call `select_page` before each action, close the tab when done.

1. Dashboard loads with non-zero counts for skills, agents, plugins.
2. Scope filter Global and Project changes the counts.
3. Search filters cards on every page.
4. One switch on a local skill: toggle off, read `$FAKE/.claude/settings.json`, confirm `skillOverrides`. Toggle on, confirm the key is gone. Confirm a backup file exists.
5. One switch on a plugin: confirm `enabledPlugins` in the file.
6. One plugin skill card shows a disabled switch with "via plugin".
7. One file edit and save in the drawer: confirm the file on disk and the backup.
8. One undo from the activity log.
9. Console has no errors. Use `list_console_messages`.
10. All functional text is 14 px or larger. Check one card, one table row, one tag with `get_css_styles`.

Report each item as pass or fail with the evidence. Then remove the fake home.
