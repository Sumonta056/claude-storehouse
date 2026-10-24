import { chipFilter } from '../core/state.js'
import { switchable, visible } from './catalog.js'
import { keepCtx } from './context.js'
import { needsAction } from './duplicates.js'
import { isUnused } from './usage.js'

export const CHIPS = {
  context: [
    ['all', 'All'],
    ['claudemd', 'CLAUDE.md'],
    ['rules', 'Rules'],
    ['skills', 'Skills'],
    ['agents', 'Agents'],
    ['mcp', 'MCP'],
    ['off', 'Off']
  ],
  dups: [
    ['all', 'All'],
    ['needs', 'Needs action']
  ],
  doctor: [
    ['all', 'All'],
    ['error', 'Errors'],
    ['warning', 'Warnings'],
    ['info', 'Info']
  ],
  plugins: [
    ['all', 'All'],
    ['on', 'On'],
    ['off', 'Off'],
    ['broken', 'Broken']
  ],
  skills: [
    ['all', 'All'],
    ['on', 'On'],
    ['off', 'Off'],
    ['plugin', 'From plugins'],
    ['unused', 'Unused 30 d']
  ],
  agents: [
    ['all', 'All'],
    ['on', 'On'],
    ['off', 'Off'],
    ['plugin', 'From plugins'],
    ['unused', 'Unused 30 d']
  ],
  hooks: [
    ['all', 'All'],
    ['on', 'On'],
    ['off', 'Off'],
    ['plugin', 'From plugins']
  ],
  mcp: [
    ['all', 'All'],
    ['on', 'On'],
    ['off', 'Off'],
    ['plugin', 'From plugins'],
    ['unused', 'Unused 30 d']
  ],
  mods: [
    ['all', 'All'],
    ['on', 'On'],
    ['off', 'Off'],
    ['dev', 'Dev']
  ]
}

export function keepChip(page, item) {
  const f = chipFilter[page]
  if (f === 'all') return true
  if (page === 'mods') return f === 'dev' ? Boolean(item.dev) : !item.dev && (f === 'on') === Boolean(item.enabled)
  if (page === 'plugins')
    return f === 'broken' ? Boolean(item.missing) : !item.missing && (f === 'on') === Boolean(item.enabled)
  if (f === 'plugin') return item.scope === 'plugin'
  if (f === 'unused') return isUnused(item)
  return switchable(page, item) && (f === 'on') === Boolean(item.enabled)
}

export function chipCounts(page, list) {
  if (page === 'dups') return { all: list.length, needs: list.filter(needsAction).length }
  if (page === 'doctor')
    return Object.fromEntries(
      CHIPS.doctor.map(([k]) => [k, k === 'all' ? list.length : list.filter((i) => i.severity === k).length])
    )
  if (page === 'context')
    return Object.fromEntries(CHIPS.context.map(([k]) => [k, list.filter((e) => keepCtx(e, k)).length]))
  const shown = list.filter(visible)
  if (page === 'mods') {
    const own = shown.filter((m) => !m.dev)
    return {
      all: shown.length,
      on: own.filter((m) => m.enabled).length,
      off: own.filter((m) => !m.enabled).length,
      dev: shown.length - own.length
    }
  }
  if (page === 'plugins') {
    const ok = shown.filter((p) => !p.missing)
    return {
      all: shown.length,
      on: ok.filter((p) => p.enabled).length,
      off: ok.filter((p) => !p.enabled).length,
      broken: shown.length - ok.length
    }
  }
  const own = shown.filter((i) => switchable(page, i))
  return {
    all: shown.length,
    on: own.filter((i) => i.enabled).length,
    off: own.filter((i) => !i.enabled).length,
    plugin: shown.filter((i) => i.scope === 'plugin').length,
    unused: shown.filter(isUnused).length
  }
}
