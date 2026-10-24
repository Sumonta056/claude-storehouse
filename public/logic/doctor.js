import { items, state } from '../core/state.js'

export const DOC_SEVERITY = [
  ['error', 'Errors', 'Claude Code cannot read these files.'],
  ['warning', 'Warnings', 'These items do not work as the file says.'],
  ['info', 'Info', 'These items work, but can be better.']
]

export const DOC_KIND = {
  file: 'Config file',
  hook: 'Hook',
  mcp: 'MCP server',
  plugin: 'Plugin',
  skill: 'Skill',
  agent: 'Agent',
  claudemd: 'CLAUDE.md'
}

export function doctorIssues() {
  return state.doctor?.issues ?? []
}

export function doctorItem(target) {
  if (!target?.kind) return null
  if (target.kind === 'hook') return state.catalog.hook.find((h) => h.id === target.id) ?? null
  if (target.kind === 'mcp') return items.get(`mcp:${target.origin}:${target.plugin ?? ''}:${target.name}`) ?? null
  return (
    (state.catalog[target.kind] ?? []).find(
      (i) => i.name === target.name && i.scope === target.scope && (i.plugin ?? null) === (target.plugin ?? null)
    ) ?? null
  )
}

export function doctorMatches(issue) {
  const q = state.query.trim().toLowerCase()
  if (!q) return true
  return [issue.name, issue.message, issue.file].some((v) =>
    String(v ?? '')
      .toLowerCase()
      .includes(q)
  )
}
