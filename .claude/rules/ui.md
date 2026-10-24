---
paths:
  - 'public/**'
---

# UI rules

- Vanilla JS as native ES modules, no framework, no build step. `public/index.html` loads `app.js` as the only module entry and the stylesheets in `public/css/` in a fixed order.
- Layout of `public/`:

  | Folder or file                    | Holds                                                                                                      | May use the DOM        |
  | --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------- |
  | `app.js`                          | `start` and `wire`: the event delegation for the whole page                                                | yes                    |
  | `api.js`                          | `get` and `send` with the token                                                                            | yes                    |
  | `core/state.js`                   | the one `state` object and the shared Maps and objects (`items`, `dr`, `cfg`, `eds`)                       | no                     |
  | `core/format.js`, `core/icons.js` | text helpers (`esc`, `plural`, `tilde`, `ago`) and SVG icons                                               | no                     |
  | `core/dom.js`, `core/actions.js`  | `$`, `toast`, `ask`, focus helpers; write actions (`toggle`, `star`, `refresh`)                            | yes                    |
  | `logic/`                          | pure rules: catalog, usage, chips, duplicates, doctor, context, markdown, hooks, mcp, config, effective    | no, ESLint enforces it |
  | `pages/`                          | one file per page: render and its `*Html` builders                                                         | yes                    |
  | `ui/`                             | parts shared by pages: rows, chips, nav, menu, drawer, favorite popover, config panels, skeletons, palette | yes                    |
  | `css/`                            | 14 stylesheets, one per topic, in cascade order                                                            | —                      |

- Mutable values shared by modules are fields of `state`, never a module-level `let`: an ES module cannot reassign an imported binding.
- A new stylesheet needs a `<link>` in `index.html`. `test/public/index-html.test.js` fails otherwise. Add it where its rules must win in the cascade.
- Each JS file in `public/` has 500 lines or fewer, and each CSS file in `public/css/` has 600 lines or fewer. Split a file by topic in the same task when it passes the budget. `public/app.js` holds only `start` and `wire`.
- Before you write UI code, pick the layer with the decision table in skill `storehouse-ui-structure`.
- Font: Figtree from Google Fonts with a system fallback for offline use.
- All functional text is 14 px or larger.
- Approved layout: `.superpowers/brainstorm/*/content/dashboard-demo-v2.html`.

## Pages

Dashboard, Favorites, Duplicates, Doctor, Context, Skills, Agents, Plugins, Mods, Hooks, MCP, Settings, CLAUDE.md, Activity.

Settings: file list plus one file panel, like CLAUDE.md, and a Files | Effective switch at the top. Details: `business-logic.md` › Settings page.

## Behavior

- Scope filter: All, Global, Project.
- `/` focuses search.
- `⌘P` / `Ctrl+P` opens the command palette (`ui/palette.js`, matching in `logic/palette.js`). It lists items, pages, and actions. `↵` opens, `⌘↵` switches, `⇧↵` stars. The palette stays open after a switch or a star. With an empty query it shows the last 5 items opened in the drawer in this tab.
- The palette key is user-set: the footer has Change and Reset, and the header "Commands" button shows the key. The value is a combo string like `mod+shift+k` (`mod` = `⌘` on macOS, `Ctrl` elsewhere) in `localStorage` key `storehouse.paletteKey`. `comboProblem` in `logic/shortcut.js` rejects a key without `⌘`, `Ctrl`, or `Alt`, and keys that the browser or the dashboard uses (`⌘W`, `⌘T`, `⌘N`, `⌘Q`, `⌘L`, `⌘R`, `⌘H`, `⌘M`, `⌘S`, `⌘Tab`, `⌘↵`). The browser keeps `⌘W` for closing the tab, and a page cannot catch it.
- The palette key does nothing while the drawer editor has focus and has unsaved text.
- Detail drawer with editor, preview, and files tab.
- Activity page with undo. Its nav button comes after CLAUDE.md. The sidebar footer "Made by Sumonta" with GitHub and portfolio links sits at the bottom.
- Until the inventory arrives, `#p-boot` shows a skeleton: the Dashboard shape on the Dashboard, rows on other pages. Until usage arrives, the usage band shows a skeleton. The shimmer stops with `prefers-reduced-motion`.
- Confirm dialog before delete.
- A toast after each write names the file that changed.
- A switch shows the file it writes in a tooltip before the click.
- After any toggle, a banner says: "Claude Code applies this at the next session."
- Plugin skills show a "Fork to local" button.
- MCP secrets are masked.
- All data comes from `GET /api/inventory`, except usage, which the first page that needs it (Dashboard, Skills, Agents, or MCP) loads from `GET /api/usage` one time per page load, at the same time as the inventory when the page opens on one of them, and the Doctor page, which loads `GET /api/doctor` with each inventory refresh. Re-render from the content each write returns.
