---
name: storehouse-ui-structure
description: Where new browser code goes in claude-storehouse public/ and how to test it. Use for any task that adds or changes code in public/ (a page, a switch, a chip, a drawer tab, a form, a style), before you write the code. Covers the layer table, the steps to add a page, a stylesheet, or shared state, the test recipe per layer, and what not to do.
---

# Storehouse UI structure

`public/` is native ES modules with no build step. `index.html` loads `app.js` as the only module entry and the 15 files in `public/css/` in a fixed order. The full folder table is in `.claude/rules/ui.md`.

## 1. Pick the layer before you write code

Ask these questions in order. The first "yes" gives the file.

| #   | Question                                                                                                                 | Put it in                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | Is it a rule or a calculation that does not need the page? (a filter, a count, a key, a token estimate, a parse, a sort) | `public/logic/<topic>.js`                                                                      |
| 2   | Is it a text helper used by more than one module? (escape, plural, date, size, path)                                     | `public/core/format.js`                                                                        |
| 3   | Is it a value that more than one module reads or changes?                                                                | a field on `state` in `public/core/state.js`                                                   |
| 4   | Does it call the API and then refresh? (a switch, a star, a delete)                                                      | `public/core/actions.js`                                                                       |
| 5   | Is it a generic DOM helper? (`$`, toast, confirm dialog, focus)                                                          | `public/core/dom.js`                                                                           |
| 6   | Does only one page use it?                                                                                               | `public/pages/<page>.js`                                                                       |
| 7   | Do 2 or more pages use it? (rows, chips, drawer, menu, nav)                                                              | `public/ui/<part>.js`                                                                          |
| 8   | Is it a click, key, or input handler for the whole page?                                                                 | one `data-act` branch in `wire` in `public/app.js` that calls a function from the right module |

A function in `logic/` gets its input from arguments or from `state`. It returns a value. It never reads `document`, `window`, `localStorage`, `location`, `history`, or `navigator`, and it never imports `core/dom.js`, `ui/`, `pages/`, `api.js`, or `app.js`. ESLint fails otherwise.

## 2. Recipes

### Add a page

1. Add the key and title to `PAGES` in `public/logic/catalog.js`.
2. Add `<section class="page" id="p-<key>"></section>` next to the other page sections, and a nav `<button type="button" data-p="<key>">`, in `public/index.html`.
3. Write `public/pages/<key>.js` with `export function render<Key>()` and its `*Html` builders.
4. Add the branch to `renderPage` in `public/ui/nav.js`.
5. Put the page rules (filters, counts) in `public/logic/<key>.js`.
6. Put the styles in a new `public/css/<key>.css` (see the next recipe), or in the topic file that already holds similar rules.
7. Add the page to the Pages list in `.claude/rules/ui.md` and to the checklist in `.claude/skills/storehouse-verify/features.md`.

### Add a stylesheet

1. Create `public/css/<topic>.css`.
2. Add `<link rel="stylesheet" href="css/<topic>.css" />` in `public/index.html`. The position sets the cascade: a later file wins over an earlier file at the same specificity. Put a new page after `lists.css` and before `responsive.css`, so that the media queries in `responsive.css` still apply to it.
3. `test/public/index-html.test.js` fails until the link exists.

### Add shared state

1. Add the field with its start value to the `state` object in `public/core/state.js`.
2. Read and write it as `state.<name>` in every module.
3. Never add a module-level `let` that another module must change. An ES module cannot reassign an imported binding, so the other module gets a stale copy.
4. A per-browser preference (like `storehouse.usageSort`) reads `localStorage` in a function with `try`/`catch`, the same as `readSort` in `core/state.js`.

### Add a switch, chip, or row action

1. The rule for which file the switch writes goes in `switchInfo` in `public/logic/catalog.js`. It must match the switch table in `.claude/rules/business-logic.md`.
2. The HTML goes in `rowHtml` or `cellSwitch` in `public/ui/rows.js`.
3. The click goes through `toggle` in `public/core/actions.js`. Do not call `send` directly from a page.

## 3. Size budget

- Keep each JS file in `public/` at 500 lines or fewer, and each CSS file in `public/css/` at 600 lines or fewer. When a file passes its budget, split it by topic in the same task. `css/lists.css` is at 571 lines. `ui/drawer.js` is at 497 lines: a new drawer feature goes in `ui/drawer-body.js` or in a new `ui/drawer-<topic>.js`.
- `public/app.js` holds only `start` and `wire`. Do not add rendering or rules to it.
- Check with: `wc -l $(find public -name '*.js' -o -name '*.css') | sort -n | tail -5`

## 4. Test recipe per layer

All browser tests are in `test/public/`, one file per module, named after the module (`<module>.test.js`, or `<module>-view.test.js` / `<module>-page.test.js` when a logic file has the same name). `npm test` runs them.

| Layer                       | How to test                                                                                                                                                                                                                                                                              | Example                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `core/format.js`, `logic/*` | Import the module and call it. Set the `state` fields you need and restore them in `finally`.                                                                                                                                                                                            | `test/public/usage.test.js`      |
| catalog items               | Build them with `normalize(inventory)` from `logic/catalog.js`. Plugin records need `skills`, `agents`, `hooks`, and `mcp` arrays. For a realistic inventory, use `scanAll` with `makeFixture()` and a temp `managedDir`.                                                                | `test/public/catalog.test.js`    |
| `pages/*`, `ui/*`           | `api.js` reads `location` when it loads. Set `globalThis.location` first, then `await import(...)`. Give `globalThis.document` a fake `getElementById` that returns plain objects, call `render<Page>()`, and read the `innerHTML`. Replace `globalThis.fetch` when the code loads data. | `test/public/hooks-page.test.js` |
| `core/state.js`             | Load a new copy with `import('../../public/core/state.js?fresh=N')` after you set `globalThis.localStorage`.                                                                                                                                                                             | `test/public/state.test.js`      |

Assert what a user sees: the text, escaped user values, `aria-checked`, `aria-label`, the `title` tooltip that names the file a switch writes, `data-act` buttons, `disabled` and `readonly`. Use `includes` or a regex. Do not compare full HTML snapshots.

Each test that writes HTML from user data also checks that `<script>` or `<img onerror>` comes out escaped.

## 5. Do not

- Do not put DOM code in `logic/`.
- Do not add a module-level `let` for shared values.
- Do not grow `app.js`.
- Do not add a bundler, a framework, or a runtime dependency. The only runtime dependency is `open`.
- Do not change the order of the `<link>` tags without a screenshot comparison (skill `storehouse-verify`, section 5).
- Do not write comments in code.

## 6. Before you claim the task is done

1. `npm run lint` and `npm test` pass.
2. Run agent `ui-structure-reviewer` on the changed files.
3. Run the Chrome check in skill `storehouse-verify`.
