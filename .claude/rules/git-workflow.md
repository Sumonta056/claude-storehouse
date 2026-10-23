# Git workflow

## Commits

- Commit messages follow Conventional Commits: `type(scope): subject`. Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `ci`, `build`, `style`, `revert`.
- A breaking change uses `type!:` or a `BREAKING CHANGE:` footer.
- `/release-tag` picks the semver bump from these types. A wrong type gives a wrong version.
- Direct commits to `main` are allowed. Feature branches and PRs are optional.
- Ask before `git commit` or `git push`.

## Hooks (Husky)

| Hook         | Runs                                                       |
| ------------ | ---------------------------------------------------------- |
| `pre-commit` | `lint-staged`: ESLint `--fix` and Prettier on staged files |
| `commit-msg` | `commitlint`                                               |
| `pre-push`   | `npm test`                                                 |

Never bypass a hook with `--no-verify`. Fix the cause.

## CI (`.github/workflows/ci.yml`)

Runs on each push to `main` and each PR: lint, commitlint, tests on Node 20 and 22 on Ubuntu and macOS, CLI smoke test, and a packed-tarball install check.

## Format

- Prettier config: `.prettierrc.json`. `lint-staged` formats only the files in a commit.
- A full reformat waits until branch `feat/favorite-categories` is merged. Then run `npm run format` in 1 `style:` commit, add `npm run format:check` to the `check` script, and add a format step to the `lint` job in `ci.yml`. Then delete this item.

## Release

1. Run `/release-tag` on `main`. It bumps `package.json`, writes `CHANGELOG.md`, pushes tag `vX.Y.Z`, and creates the GitHub Release.
2. The tag starts `.github/workflows/release.yml`. It runs lint and tests, checks that the tag equals the `package.json` version and that `CHANGELOG.md` has the version, then publishes to npm with provenance and attaches the tarball to the GitHub Release.
3. A version with `-` (for example `1.0.0-rc.1`) publishes with the npm tag `next`.

npm publish uses trusted publishing (OIDC). There is no npm token secret. On npmjs.com, the package `claude-storehouse` trusts repo `Sumonta056/claude-storehouse`, workflow `release.yml`, environment `npm`.
