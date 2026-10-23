---
name: storehouse-website
description: Update the GitHub Pages website (site/), its live demo, its screenshots, and README.md after a user-visible change ships. Use after any feature, page, switch, setting, CLI flag, or UI change, when asked to "update the website", "update the README", "refresh screenshots", or "add this feature to the site", and before a release.
---

# Update the website, demo, and README

The website lives in `site/`. `.github/workflows/pages.yml` deploys it to `https://sumonta056.github.io/claude-storehouse/` after CI passes on `main`.

The live demo is the real `public/` code. `site/build.js` copies `public/` into `_site/demo/`, adds `site/demo/demo-api.js` before `app.js`, and writes `demo-data.json`. To make that file, the build creates the fake home from `scripts/demo-home.js`, starts the real server on it, and records every GET response. Home paths become `/Users/demo`.

So a UI change shows in the demo without work. This skill covers what does not update by itself: sample data, fake write routes, screenshots, and text.

Plan the edits and get approval before you change files. Ask before you commit.

## 1. Find what changed

- `git log --oneline <last site or README commit>..HEAD` and `CHANGELOG.md` → `[Unreleased]` list the user-visible changes.
- `git diff <that commit>..HEAD -- .claude/rules/business-logic.md .claude/rules/ui.md public/` shows new behavior.
- Ignore tests, refactors, and CI. The site and README describe what a user sees.

## 2. Map each change to the places it shows

| Area changed                      | Website (`site/index.html`)                                                                               | Screenshot       | README.md section                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- |
| Dashboard, usage band             | feature "Dashboard and usage"                                                                             | `dashboard.png`  | Features › Dashboard and usage      |
| Skills, agents, fork              | feature "Skills and agents"                                                                               | `skills.png`     | Features › Skills and agents        |
| Favorites, categories             | feature "Favorites"                                                                                       | `favorites.png`  | Features › Favorites                |
| Plugins, mods, uninstall          | feature "Plugins and mods"                                                                                | `plugins.png`    | Features › Plugins and mods         |
| Hooks, MCP servers                | feature "Hooks and MCP servers"                                                                           | `mcp.png`        | Features › Hooks and MCP servers    |
| Drawer, editor, activity, backups | feature "Edit in place, undo anything"                                                                    | `editor.png`     | Features › Edit in place            |
| A switch mechanism                | section "How on / off works" rows                                                                         | —                | How on/off works table              |
| New page                          | new `.feature` block (alternate `flip`), demo tab in `.demo-tabs`, name in `PAGE_NAMES` in `site/site.js` | new `<page>.png` | new Features subsection             |
| CLI flag                          | "CLI options" panel                                                                                       | —                | CLI options                         |
| Keyboard shortcut                 | "Keyboard shortcuts" table                                                                                | —                | Keyboard shortcuts                  |
| Safety rule                       | "Safety and privacy" panel                                                                                | —                | Safety and privacy                  |
| File layout                       | —                                                                                                         | —                | How it works tree                   |
| Version                           | JSON-LD `softwareVersion` in `<head>`                                                                     | —                | Changelog (owned by `/release-tag`) |

The "Things to try" chips in `#demo` must name items that exist in the demo data.

## 3. Give the demo what it needs

- **Sample data.** A feature that needs data (a new item type, a mod, a parked hook) gets it in `scripts/demo-home.js`. The screenshots use the same data. Never put strings that look like keys or tokens in it: a security hook blocks the write.
- **New GET route.** If `public/app.js` calls a new `GET /api/...`, record it in `record()` in `site/build.js` and serve it in `route()` in `site/demo/demo-api.js`.
- **New write route.** Add a case to `route()` that changes `db` in memory the way the server changes the files, and return the same JSON shape as the handler in `src/api*.js`. Add an `undo` function to the activity entry if the real one can undo. A write that cannot work in a browser (open in editor, uninstall, delete) falls to the `default` case, which returns 501 with a "not available in the live demo" message. The UI then shows that message as a toast.
- **Changed response shape.** Update the matching function in `demo-api.js`. `test/site.test.js` checks the build, not each route, so test the route in Chrome (step 4).

## 4. Build and look

```sh
npm run site
python3 -I -m http.server 8811 --bind 127.0.0.1 -d _site
```

Use Chrome DevTools MCP. Open your own tab and close it at the end.

1. Open `http://127.0.0.1:8811/demo/#<page>` for each changed page. The console has no errors.
2. Use the new feature by clicks. Each write shows a toast, the page updates, and Activity lists it with Undo where the real app has Undo.
3. Open `http://127.0.0.1:8811/`. The demo tabs switch pages, **Reset demo** reloads, and each "Try it in the demo" link opens the right page.

## 5. Recapture the screenshots that changed

Never screenshot the real `~/.claude`. Take every shot from the demo at 1440 × 900, scale 2. The result is 2880 × 1800, the size the `<img>` tags declare.

For a page with no clicks, use headless Chrome. Use a new profile folder for each shot:

```sh
P=$(mktemp -d <scratchpad>/chrome.XXXXXX)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --user-data-dir="$P" \
  --hide-scrollbars --force-device-scale-factor=2 --window-size=1440,900 --virtual-time-budget=4000 \
  --screenshot="$PWD/docs/images/<name>.png" "http://127.0.0.1:8811/demo/#<page>"
```

For a state that needs clicks (a drawer, an Edit tab, a toggle), use the MCP tab: `emulate` with viewport `1440x900x2`, drive the state with `evaluate_script`, then `take_screenshot` with `filePath` = `docs/images/<name>.png`. Do not use `resize_page`: it gives 1612 px height.

Read each new image. It shows the feature, has no hover marks or focus rings by chance, and has no half-loaded parts. `docs/images/icon.png` is the 256 px render of `public/icon.svg`. Make it again only when the icon changes.

## 6. Write the text

- The site and the README use the same words for the same thing. Sentence case, plain verbs, short sentences.
- Each feature block on the site: 1 `<h3>`, 1 or 2 sentences, at most 4 list items, 1 "Try it in the demo →" link with `data-demo="<page>"`.
- README: add the feature to its Features subsection, at most 5 bullets. A subsection with a screenshot puts it after the bullets. Do not edit the Changelog section. `/release-tag` owns it.
- Every README image and repo link is an absolute URL (`https://raw.githubusercontent.com/Sumonta056/claude-storehouse/main/...` or `https://github.com/Sumonta056/claude-storehouse/blob/main/...`). npm does not resolve relative paths.
- New screenshots get a real `alt` text that says what the picture shows.
- If the feature changes what the product is, update `<meta name="description">`, `og:description`, `twitter:description`, and the JSON-LD `description` in `site/index.html`.
- Check every claim against the code and `.claude/rules/business-logic.md`. Never list a removed feature.

## 7. Check

1. `npm run format`, then `npm run check`. Show the output.
2. `npm run site` succeeds. `test/site.test.js` is part of `npm test`.
3. Open the site at 1440 px and at 390 px: no sideways scroll, every image loads, the console has no errors.
4. Publish the changed demo page or the site as an Artifact link for the user, and say which screenshots changed and what you could not check.

Ask before you commit. Use `docs(site): ...` for text and screenshots, `feat(site): ...` for new site or demo behavior, and `docs(readme): ...` for README-only changes.
