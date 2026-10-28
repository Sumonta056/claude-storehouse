# Storehouse feature checklist

The full regression list for section 5 of this skill. Each line: ID | feature | what to do | what must be true. "On disk" means read the file in the demo home. Run each line on `main` and on the branch.

Known old issues (fail on `main` too, not regressions): A6 back after a nav click, A15 arrow keys on rows.

## Group A: shell, Dashboard, Skills, Agents, Context

A1 | Dashboard counts | open #dash | stat tiles for Skills, Agents, Plugins, Hooks, MCP show total, on, off
A2 | Usage band | open #dash | cost, model bar, 4 tiles show; period switch "This month"/"All time" changes the numbers; reload keeps the choice (localStorage storehouse.usagePeriod)
A2b | Top projects and Projects page | open #dash, click a top project card | 3 cards ranked by tokens follow the period switch; the card opens #projects on that project's session table; "← All projects" shows the list; search filters project names; switch to All time changes the rows
A3 | Recent and files | open #dash | recent changes list and "files this project has" list render
A4 | Scope filter | click All / Global / Project | counts and lists change; nav counts change
A5 | Search | press `/` | focus moves to #q; typing filters rows on every page; clearing restores them
A6 | Nav and hash routing | click each nav item; set `location.hash`, then go back | page, URL hash, and `aria-current` change; back returns after a hash change. A nav click uses `history.replaceState`, so back after a click does not return (old issue)
A7 | Skill switch | switch a global skill off, then on | on disk `skillOverrides[name]="off"`, then key removed; toast names the file; banner "Claude Code applies this at the next session."; switch title names the file before the click
A8 | Project skill switch | switch a project skill off | on disk `<project>/.claude/settings.local.json` gets the key (never `.claude/settings.json`)
A9 | Agent switch | switch an agent off, then on | file renamed to `name.md.disabled`, then back
A10 | Plugin skill row | open "From plugins" on #skills | no own switch; says it follows the plugin
A11 | Use chips and Unused | open #skills | 30-day use chips show; Unused 30 d chip filters; sort Most used / Least used / Name works and is kept after reload (storehouse.usageSort)
A12 | Switch off N unused | click "Switch off N" | confirm dialog; after Yes each item is off and each has its own Activity entry
A13 | Token chip | open #skills | rows show a token chip
A14 | Context page | open #context | total, bar by type, chips by type, Off chip lists off items with "Saves NN tok while off"; switching an item off lowers the total
A15 | Keyboard list nav | open a row "…" menu, press ↓ ↑ Home End | focus moves and wraps between menu items. Arrow keys on a focused row do nothing (old issue; the README says they move between items)

## Group B: Plugins, Mods, Duplicates, Doctor, Favorites

B1 | Plugins list | open #plugins | each plugin shows marketplace, version, counts
B2 | Plugin switch | switch a plugin off, then on | on disk `enabledPlugins[id]` false then true; its skills show off on #skills
B3 | Uninstall button | open the row menu of a plugin | Uninstall entry exists and opens a confirm dialog; press Cancel (do not run it)
B4 | Mods page | open #mods | installed mods and dev mods render (empty state is fine if the demo has none)
B5 | Duplicates | open #dups | groups by name; Conflict when more than one is on; nav count = Conflict groups
B6 | Keep only this | click Keep only this in a Conflict group | the other items with a switch go off; group shows OK
B7 | Doctor | open #doctor | rows with severity chips (Errors, Warnings, Info) filter the list; nav count = errors + warnings
B8 | Doctor actions | click Open on a row; click Check again | drawer or file opens; toast after Check again
B9 | Star | star an item from its row | it shows on #fav; on disk `storehouse.json` favorites has it
B10 | Favorite categories | create a category, rename it, delete it | each works; Activity has undo for rename and delete
B11 | Favorite popover | open the star popover on a starred item | pick a category; filter the list by typing; Esc closes it
B12 | Drag reorder | drag a favorite above another | order changes and stays after reload
B13 | Favorite that is off | switch a starred item off | it stays on #fav with the off state

## Group C: Hooks, MCP, Settings, CLAUDE.md

C1 | Hooks list | open #hooks | hooks grouped by event with matcher and source
C2 | Hook switch | switch a hook off, then on | on disk the entry moves to `storehouse.json` parkedHooks, then back
C3 | Add hook | open the Add form, submit a hook, then remove it | entry appears in the settings file; remove asks to confirm and deletes it
C4 | MCP list | open #mcp | transport, command, source, use; secrets masked
C5 | MCP switch | switch a global MCP off | on disk `~/.claude.json` projects.<dir>.disabledMcpServers has the name
C6 | Add MCP | add a stdio server with env `A=1`, then remove it | entry appears; remove works
C7 | Settings Files view | open #settings | numbered file list 1 Global, 2 Project, 3 Project local; form with model, effort, mode fields
C8 | Settings form save | change `model`, save | on disk only that key changed; other keys stay; toast
C9 | Raw JSON tab | switch to Raw JSON, edit, save; then Cancel an edit | file changes; Cancel restores the text
C10 | Effective view | switch to Effective | table of keys, winning file tag, overridden values
C11 | Create missing file | on a missing settings file click Create | file is created
C12 | Panel backups | open Backups of a settings file, restore one | confirm dialog; file restored
C13 | CLAUDE.md page | open #claudemd | list of CLAUDE.md files; edit and save one; preview renders markdown
C14 | Unsaved change guard | edit CLAUDE.md, switch to another file | confirm dialog about unsaved changes

## Group D: Drawer, editor, Activity, shell UI

D1 | Open drawer | click a local skill row | drawer with Preview, Edit, Files, Backups tabs; path shown
D2 | Preview | Preview tab | markdown rendered, front matter card shown
D3 | Edit and save | edit text, press ⌘S / Ctrl+S | on disk changed; backup exists; toast
D4 | Editor format | select text, press ⌘B and ⌘I | ** and * inserted
D5 | Files tab | Files tab of a folder skill | lists files with sizes; click opens one
D6 | Backups tab | Backups tab after a save | lists the backup; Restore asks to confirm and restores
D7 | Copy path, Open in | copy icon next to the path; bottom bar | Copy path gives the toast "Path copied"; "Reveal in Finder" and "Open in editor" exist. Never click those two
D8 | Fork plugin skill | open a plugin skill, Fork to local | copy appears in `~/.claude/skills`; toast
D9 | Delete | Delete a local skill, confirm | moves to `backups/storehouse/trash`; row gone
D10 | Read-only plugin file | open a plugin skill | editor read-only, lock note shown
D11 | Plugin overview | open a plugin | overview with its skills, agents, hooks, MCP cards
D12 | Dirty guard | edit in drawer, press Esc | confirm about unsaved changes
D13 | Esc and focus | open drawer and press Esc | drawer closes; focus returns to the row that opened it
D14 | Activity | open #activity | every action of this test shows; Undo on a switch and on a save works on disk
D15 | Toast and banner | any write | toast shows; banner Dismiss hides it and it stays hidden for the session
D16 | Console | whole session | no errors or warnings in the console
D17 | Font size | any page | all visible functional text is 14 px or larger
D18 | Command palette | press ⌘P / Ctrl+P, type "debu", press ⌘↵, then ⇧↵, then Esc | palette opens with focus in it; global `debugging` first; `skillOverrides` on disk changes; Favorites count changes; Esc returns focus
D19 | Palette shortcut | palette footer Change, press ⌘⇧K, reload, press ⌘⇧K; then Reset | header button shows ⌘⇧K; ⌘P no longer opens it; Reset brings back ⌘P
