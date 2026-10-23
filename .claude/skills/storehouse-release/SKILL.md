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
4. If features or the UI changed since the last release, run skill `storehouse-website`. It updates the website, the live demo data, the screenshots, and `README.md`.

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

Skill `storehouse-website` owns the screenshots. It takes them from the live demo build, which uses the sample data in `scripts/demo-home.js`. Never screenshot the real `~/.claude`.

## 4. Cut the release

Run `/release-tag`. It picks the version from Conventional Commits, writes `CHANGELOG.md`, bumps `package.json` with `npm version <x.y.z> --no-git-tag-version`, tags, and creates the GitHub Release.

This repo has 1 extra limit: a branch-protection hook from a Claude Code plugin blocks Claude's `git commit` and `git push` on `main`. The hook also blocks any Bash command that contains the word "commit" next to `main`. Give the user each command to run with the `!` prefix:

```
! git add package.json package-lock.json CHANGELOG.md README.md docs/images site && git commit -m "chore(release): X.Y.Z" && git push origin main
```

`commitlint` limits each body line to 100 characters. Pass a long body as several `-m` parts. After the push, run step 1 of `/release-tag` again, then the tag and the GitHub Release.

## 5. After the tag

1. Watch the release workflow: `gh run list --workflow release.yml --limit 1`, then `gh run watch <id> --exit-status`.
2. Check npm without cache: `curl -s -H 'Cache-Control: no-cache' "https://registry.npmjs.org/claude-storehouse?t=$(date +%s)"`. `dist-tags.latest` equals the new version. `npm view` can show an old cached value for minutes.
3. Check the GitHub Release has the tarball: `gh release view vX.Y.Z`.
4. Check the npm page shows the new README and images.
5. Install test in an empty scratch folder: `npm install claude-storehouse@X.Y.Z --prefer-online`, then `npx claude-storehouse --version`.

## When the release workflow fails

| Error                                    | Cause                                                                                                                                               | Fix                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag does not match package.json          | Version bump not committed before the tag                                                                                                           | Do not move the tag. Fix `main` and release the next patch.                                                                                                                                                                                                                                                                                                                                                             |
| CHANGELOG has no section                 | `CHANGELOG.md` heading is not `## [X.Y.Z]`                                                                                                          | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                          |
| npm 404 or 403 on publish with OIDC      | npm found no trusted publisher that matches the run. The log shows `NODE_AUTH_TOKEN: XXXXX-...`: npm fell back to the setup-node placeholder token. | Check the GitHub side first: `gh api repos/Sumonta056/claude-storehouse/environments` and the run `path`. Then the user checks npmjs.com, package Settings, Trusted Publisher: owner `Sumonta056` with a capital S (the match is case-sensitive; `sumonta056` fails), repo `claude-storehouse`, workflow `release.yml`, environment `npm`. A new setting can take a minute to apply. Then `gh run rerun <id> --failed`. |
| Cannot publish over the previous version | Version already on npm                                                                                                                              | Release the next patch.                                                                                                                                                                                                                                                                                                                                                                                                 |

## Fallback: publish from the local machine

Use this when trusted publishing still fails and the user wants the version live now.

1. Check that `HEAD` equals the tag: `git rev-parse HEAD vX.Y.Z^{commit}`. Check that `npm pack --dry-run` shows the right version.
2. npm needs 2FA. A `!` command in Claude Code has no terminal, so npm cannot wait for a browser approval and prints the login URL masked as `***`. The user must run the publish in a real terminal window:
   ```
   cd /Users/cefalo_1/Documents/Projects/claude-storehouse
   npx -y npm@11 publish --access public --auth-type=web
   ```
   With an authenticator app, `! npm publish --access public --otp=<6 digits>` also works from Claude Code.
3. Check the registry (section 5, step 2). Then attach the tarball, because the workflow did not reach that step: `npm pack --pack-destination <scratchpad>`, then `gh release upload vX.Y.Z <scratchpad>/claude-storehouse-X.Y.Z.tgz --clobber`.
4. This version has no provenance. Fix trusted publishing before the next release.

Never delete or force-push a published tag without the user's approval of that exact action.
