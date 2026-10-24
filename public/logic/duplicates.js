import { state } from '../core/state.js'
import { pluginLabel } from './catalog.js'

export function dupSource(item) {
  if (item.plugin) return `via plugin ${pluginLabel(item.plugin)}`
  if (item.kind === 'mcp') return item.source
  return item.scope === 'project' ? 'Project' : 'Global'
}

export const DUP_KINDS = [
  ['skill', 'skill'],
  ['agent', 'agent'],
  ['mcp', 'MCP server']
]

export function duplicateGroups() {
  const groups = new Map()
  for (const [kind] of DUP_KINDS)
    for (const item of state.catalog[kind]) {
      const key = `${kind}:${item.name}`
      if (!groups.has(key)) groups.set(key, { key, kind, name: item.name, items: [] })
      groups.get(key).items.push(item)
    }
  return [...groups.values()].filter((g) => g.items.length > 1)
}

export function onCount(group) {
  return group.items.filter((i) => i.enabled).length
}

export function needsAction(group) {
  return onCount(group) > 1
}
