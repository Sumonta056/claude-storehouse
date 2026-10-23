---
name: storehouse-release
description: Release claude-storehouse to GitHub and npm, and keep the npm package page current. Use when the user asks to release, publish, cut a version, tag, update the npm page, update the README, or refresh the screenshots.
---

# Storehouse release

A release has 4 parts that must agree: `package.json` version, a `CHANGELOG.md` section, tag `vX.Y.Z` on `main`, and a GitHub Release. The tag push publishes to npm through `.github/workflows/release.yml`.

## 1. Before the release

1. `git status` is clean except for files the user keeps out on purpose. `main` equals `origin/main`.
2. `npm run check` passes. Show the last lines.
3. The last CI run on `main` is green: `gh run list --workflow ci.yml --limit 1`.
4. If the UI changed since the last release, refresh the screenshots (section 3).
5. If features changed, update `README.md` (section 2).

## 2. npm package page

npm builds the page from `README.md` and `package.json` only.

- `package.json` holds `description`, `keywords`, `author`, `license`, `repository`, `homepage`, `bugs`, `engines`, and `files`. Keep the description to 1 sentence. Keep `files` to `bin`, `src`, `public`, `LICENSE`, `README.md`, `CHANGELOG.md`.
- In `README.md`, every image and link to a repo file uses an absolute URL. npm does not resolve relative paths.
  - Images: `https://raw.githubusercontent.com/Sumonta056/claude-storehouse/main/docs/images/<name>.png`
  - Files: `https://github.com/Sumonta056/claude-storehouse/blob/main/<path>`
- The README image updates on npm only when the image is on `main`. Push the images before the tag.
- The README text on npm updates only with a new published version.
- Check every README claim against the code and `.claude/rules/business-logic.md`. Never list a removed feature.
- Check the result: `npm pack --dry-run` lists the files. After publish, open `https://www.npmjs.com/package/claude-storehouse`.

## 3. Screenshots

Never screenshot the real `~/.claude`. It holds private config.

```
S=<scratchpad>/demo
rm -rf "$S" && node scripts/demo-home.js "$S"
node bin/storehouse.js --dir "$S/home/acme-api" --home "$S/home" --no-open --port 4818
```

The project lives inside the fake home, so the page shows `~/acme-api`. Take each page at 1440x900, scale 2:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --user-data-dir=<scratchpad>/chrome --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1440,900 --virtual-time-budget=4000 \
  --screenshot=docs/images/<name>.png "<url with token>#<page>"
```

Pages: `dash`, `fav`, `skills`, `agents`, `plugins`, `hooks`, `mcp`, `settings`, `claudemd`. Use a new `--user-data-dir` for each shot. The token is in the URL, and the app moves it to session storage. The README uses `dashboard.png`, `skills.png`, `mcp.png`. Look at each image before you keep it. Stop the server when done.

If the demo data needs a change, edit `scripts/demo-home.js`. Favorites use `{ kind, name, source }`. `source` is `local` for global items and `<plugin>@<market>` for plugin items. Do not put strings that look like keys or tokens in it: a security hook blocks the write.

## 4. Cut the release

Run `/release-tag`. It picks the version from Conventional Commits, writes `CHANGELOG.md`, bumps `package.json` with `npm version <x.y.z> --no-git-tag-version`, tags, and creates the GitHub Release.

This repo has 1 extra limit: a branch-protection hook from a Claude Code plugin blocks Claude's `git commit` and `git push` on `main`. The hook also blocks any Bash command that contains the word "commit" next to `main`. Give the user each command to run with the `!` prefix:

```
! git add package.json package-lock.json CHANGELOG.md README.md docs/images && git commit -m "chore(release): X.Y.Z" && git push origin main
```

`commitlint` limits each body line to 100 characters. Pass a long body as several `-m` parts. After the push, run step 1 of `/release-tag` again, then the tag and the GitHub Release.

## 5. After the tag

1. Watch the release workflow: `gh run list --workflow release.yml --limit 1`, then `gh run watch <id> --exit-status`.
2. Check npm: `npm view claude-storehouse version dist-tags`. `latest` equals the new version.
3. Check the GitHub Release has the tarball: `gh release view vX.Y.Z`.
4. Check the npm page shows the new README and images.

## When the release workflow fails

| Error                                    | Cause                                                               | Fix                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag does not match package.json          | Version bump not committed before the tag                           | Do not move the tag. Fix `main` and release the next patch.                                                                                                       |
| CHANGELOG has no section                 | `CHANGELOG.md` heading is not `## [X.Y.Z]`                          | Same as above.                                                                                                                                                    |
| npm 404 or 403 on publish with OIDC      | Trusted publisher not set up, or wrong workflow or environment name | On npmjs.com, package settings, Trusted Publisher: repo `Sumonta056/claude-storehouse`, workflow `release.yml`, environment `npm`. Then run the failed job again. |
| Cannot publish over the previous version | Version already on npm                                              | Release the next patch.                                                                                                                                           |

Never delete or force-push a published tag without the user's approval of that exact action.
