# plot.md — development setup for claude-storehouse

This file is the index of everything that is in place before the build starts.

## Documents

| File | Purpose |
|---|---|
| `Requirements.md` | The original request |
| `docs/superpowers/specs/2026-10-23-claude-storehouse-design.md` | Approved design: scope, switch mechanisms, API, write safety, limitations |
| `docs/superpowers/plans/` | Task plan, one task per section, written after design approval |
| `.superpowers/brainstorm/*/content/dashboard-demo-v2.html` | Approved UI mockup. The real UI copies this layout. |
| `CLAUDE.md` | Project rules that Claude Code loads in this folder |

## Project Claude Code setup (`.claude/`)

| Item | Path | Use |
|---|---|---|
| Skill | `.claude/skills/storehouse-config-safety/SKILL.md` | Switch table, write procedure, path allow-list, test rule. Load for any `src/write` or `src/scan` task. |
| Skill | `.claude/skills/storehouse-verify/SKILL.md` | Test command, fake home recipe, 10-point Chrome check. Load before claiming any task done. |
| Agent | `.claude/agents/toggle-reviewer.md` | Read-only reviewer for toggle and scanner code. Run after each `src/write` task. |
| Settings | `.claude/settings.json` | Allows `npm test`, `node --test`, and the CLI. Denies edits to the real `~/.claude/settings.json` and `~/.claude.json`. |

## Global skills and agents that the build uses

| Skill or agent | Source | When |
|---|---|---|
| `superpowers:writing-plans` | superpowers | Writes the task plan from the design |
| `superpowers:executing-plans` or `subagent-driven-development` | superpowers | Runs the plan task by task |
| `superpowers:test-driven-development` | superpowers | Each toggle and scanner: failing test first |
| `pstack:typescript-best-practices` | pstack | Not used, the project is plain JavaScript |
| `agent-skills:frontend-ui-engineering` | agent-skills | UI task: accessibility, 14 px, keyboard |
| `chrome-devtools-mcp:chrome-devtools` | plugin | Manual UI check against a fake home |
| `superpowers:verification-before-completion` | superpowers | Before any "done" claim |
| `superpowers:requesting-code-review` | superpowers | Before the final review |
| `agent-skills:code-reviewer` (agent) | agent-skills | Final five-axis review |

## Fixed decisions

- Node 20, no framework, no build step, dependency `open` only.
- Font Figtree, functional text 14 px minimum.
- Project switches write `.claude/settings.local.json`.
- Plugin skills, agents, hooks follow the plugin switch. No own switch.
- Backups in `~/.claude/backups/storehouse/`. Delete moves to `backups/storehouse/trash/`.
- No comments in code. Ask before any git commit.

## Known limitations (from the design)

1. Plugin skills have no own on/off switch.
2. Agent off is a rename to `.md.disabled`.
3. Hook off parks the entry in `~/.claude/storehouse.json`.
4. Changes apply at the next Claude Code session.
5. `commands`, `rules`, `output-styles` are out of scope for version 1.
