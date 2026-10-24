# Plan 8: Usage extras

Demo: tab 8 of https://claude.ai/artifact/MFhfHLDRDFf8FLwAACxft6#billing

## Goal

Add three views under the usage band on the Dashboard:

1. **Current 5-hour block**: the cost so far, the burn rate, the time until reset, and the projected cost at the end of the block.
2. **Cost per day**: a bar chart of the last 14 days.
3. **Cost by project**: sessions, tokens, and cost for each project this month.

## Why

- Users on a subscription plan get a 5-hour limit window. They want to know where they are in it.
- ccusage shows this in the terminal. Storehouse already has the data and can show it in one view.
- The scan already reads every transcript, so this needs no extra file reads.

## Scope

In scope: the three views above, and a "Refresh" button on the band.

Out of scope:

- The real subscription limit. Anthropic does not write it to disk. The block card shows cost and tokens, not "percent of limit".
- Alerts and notifications.
- A date range picker.

## Design

### Server: extend `src/scan/usage.js`

1. `recordOf()` also keeps:
   - `time`: `Date.parse(entry.timestamp)`
   - `cwd`: `entry.cwd` when it is a string. The folder name under `~/.claude/projects` loses information (`-Users-me-my-app`), so `cwd` gives the real path.
2. `summarize()` returns three new fields:

```
days:      [{ date: "2026-10-24", cost, tokens }]          last 14 local days, oldest first, zero days included
byProject: [{ project: "~/acme-api", sessions, tokens, cost }]   this month, sorted by cost
block:     { start, end, cost, tokens, burnPerHour, projected } | null
```

3. Block rule (same rule as ccusage):
   - Sort the records by `time`.
   - A block starts at the first record, rounded down to the full hour, and lasts 5 hours.
   - A record after the block end starts a new block.
   - `block` is the last block if `now < end`. Otherwise it is `null`, and the card says "No active block".
   - `burnPerHour = cost / hours since start`. `projected = cost + burnPerHour × hours left`.
4. Show project paths with `~` in place of the home folder. Use the `tilde` rule from the browser.
5. The cache, the dedupe, and the symlink rules do not change.

`GET /api/usage` returns the new fields. There is no new route.

### Browser

Pick each layer with skill `storehouse-ui-structure`.

| Part                                                                                              | Where                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `blockHtml()`, `dailyHtml()`, `projectsHtml()` under `usageHtml()`                                | `public/pages/dash.js`                                                                                                               |
| Block math, daily buckets, project totals that do not need the page (if the browser computes any) | `public/logic/usage.js`                                                                                                              |
| `.blk`, `.card`, `.prog`, `.daily`, `.ptable` from the demo                                       | `public/css/top.css` (it holds the usage band); a new `public/css/usage.css` linked right after it if `top.css` would pass 600 lines |
| Tests for the new HTML                                                                            | `test/public/dash-view.test.js`                                                                                                      |

- The chart is inline SVG. Use one y scale. Label $0, the middle value, and the max. Color text with the theme tokens. Today's bar uses the accent color, and the other bars use the soft accent. Follow skill `dataviz` before you draw.
- "Refresh" calls `loadUsage()` again. The usage rule in `ui.md` changes from "one time per page load" to "one time per page load, and again on Refresh".
- An unpriced model counts tokens and no cost. This is the same as the band.

## Rule changes

- `business-logic.md` → Usage band: add the block rule, "days use local time", and "project = `cwd` from the transcript, else the folder name".
- `ui.md`: the Refresh rule.

## Tests

`test/scan/usage.test.js`, with a fixed `now`:

1. Records at 13:10, 14:30, and 17:59 make one block that starts at 13:00 and ends at 18:00.
2. A record at 18:20 starts a new block at 18:00.
3. When `now` is after the last block end, `block` is `null`.
4. `days` has 14 entries, and the days with no use have zero.
5. Two sessions with one `cwd` in different project folders make one project row.
6. A record with no `cwd` uses the folder name.
7. `burnPerHour` and `projected` match a hand calculation.

## Tasks

1. TDD: `time` and `cwd` in `recordOf()`.
2. TDD: `days`, `byProject`, `block`.
3. Update `test/server.test.js` for the new fields.
4. Run agent `toggle-reviewer` (scanner change).
5. UI: three views and the Refresh button.
6. Make sure that `scripts/demo-home.js` writes transcripts with `timestamp` and `cwd` near "now", so the live demo shows an active block. Rebuild the site.
7. Run `storehouse-verify`, then `storehouse-website`.
8. Update the rule files. Delete this plan.

## Done when

- The sum of `byProject` cost equals the month cost in the band.
- The sum of the `days` cost for this month equals the month cost when the month started less than 14 days ago.
- A full scan of 3 GB is not more than 10% slower than before.

## Risks

- The 5-hour block is an estimate of Anthropic's window. The card label says "estimate".
- Time zones: all day math uses local time, the same as "this month".
