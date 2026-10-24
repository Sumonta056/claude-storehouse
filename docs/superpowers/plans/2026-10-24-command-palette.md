# Plan 7: Command palette (Cmd+K)

Demo: tab 7 of https://claude.ai/artifact/MFhfHLDRDFf8FLwAACxft6#palette

## Goal

Press `⌘K` (macOS) or `Ctrl+K` (Linux, Windows) on any page. Type part of a name. Then open, switch, or star any item, go to any page, or run an action, all with the keyboard.

## Why

- With 110+ skills, it is slow to scroll a page and find one row.
- The palette uses only data that is already in the browser. It has no server change and little risk.

## Scope

In scope:

1. A dialog that opens with `⌘K` / `Ctrl+K` and closes with `Esc` or a click outside.
2. Three result groups: **Items** (skills, agents, plugins, hooks, MCP servers), **Pages**, and **Actions**.
3. Keys:

| Key             | Result                                                            |
| --------------- | ----------------------------------------------------------------- |
| `↑` `↓`         | move the selection                                                |
| `↵`             | open the item in the drawer, or go to the page, or run the action |
| `⌘↵` / `Ctrl+↵` | switch the item on or off                                         |
| `⇧↵`            | star or unstar the item                                           |
| `Esc`           | close and return focus to the element that had it                 |

4. With an empty query, the palette shows the last 5 items that the user opened in this tab.
5. Actions in version 1: set scope to All, Global, or Project; go to each page; "Show Duplicates conflicts".

Out of scope:

- Actions that change many items at once.
- A help overlay for shortcuts.
- Custom key bindings.

## Design

All changes are in `public/`. Pick each layer with skill `storehouse-ui-structure`.

| Part                                                                           | File                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Dialog markup: `div.cmdk` with `input role="combobox"` and `ul role="listbox"` | `public/index.html`                                                                |
| `paletteResults(query)` and `scoreMatch(text, query)`: pure, no DOM            | `public/logic/palette.js`                                                          |
| `openPalette()`, `closePalette()`, result HTML, and the keys inside the dialog | `public/ui/palette.js`                                                             |
| The global `⌘K` / `Ctrl+K` listener                                            | one branch in `wire` in `public/app.js` that calls `openPalette()`                 |
| `.cmdk` styles from the demo                                                   | new `public/css/palette.css`, linked after `lists.css` and before `responsive.css` |

### Match

`scoreMatch()` is a small subsequence match:

- A prefix match scores highest, then a word-start match, then letters in order.
- Match against name, plugin name, and description. A name match always ranks above a description match.
- Show at most 8 items, 5 pages, and 3 actions.

### Reuse

- Open uses the function that opens the drawer.
- Switch uses `toggle(item)`. The toast, the banner, the Activity entry, and undo work as they do now. The palette stays open and updates the row state.
- Star uses `starItem()`. If the favorite popover needs a category, the palette closes and the popover opens on the item row.
- A row without a switch (a plugin skill) shows "via plugin X". `⌘↵` does nothing on it, and the palette says why.

### Access

- `aria-activedescendant` on the input points to the selected option.
- The focus trap uses `trapTab()`, which already exists.
- The `/` key still focuses the page search. `⌘K` does not affect it.
- The `⌘K` handler ignores the key when the drawer editor has focus and the text has unsaved changes.

## Rule changes

- `ui.md` → Behavior: add "`⌘K` / `Ctrl+K` opens the command palette."

## Tests

Unit tests (recipe in skill `storehouse-ui-structure`, section 4):

- `test/public/palette.test.js`: `scoreMatch` order (prefix, then word start, then letters in order), name above description, the 8 / 5 / 3 caps.
- `test/public/palette-view.test.js`: result HTML escapes names, marks the selected option, and says "via plugin X" on a row without a switch.

Then verify in Chrome (skill `storehouse-verify`):

1. `⌘K` opens the palette. `Esc` closes it and focus goes back.
2. "debu" shows both `debugging` skills. The global one is first.
3. `⌘↵` switches the skill. The toast names the file. Undo in Activity works.
4. `⇧↵` stars the item. The Favorites count changes.
5. `↵` on "Duplicates" goes to that page.
6. Keyboard only: the full flow works with no mouse. No console errors.
7. Light and dark themes, and a 400 px window.

## Tasks

1. Add the markup and styles.
2. Add `scoreMatch()` and `paletteResults()`. Test them by hand in the console on the demo data.
3. Add the key handling and connect to `toggle`, `starItem`, and the drawer.
4. Add recent items, kept in memory for this tab only.
5. Run `npm run check` and the Chrome check above.
6. Run `storehouse-website`: README shortcut table, site feature list, and live demo.
7. Update `ui.md`. Delete this plan.

## Done when

- All 7 Chrome checks pass.
- No server file changed.
