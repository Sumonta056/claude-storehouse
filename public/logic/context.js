import { state } from '../core/state.js'

export const TOKEN_BYTES = 4

const DESC_CAP = 1536

export const CTX_TYPES = [
  ['claudemd', 'CLAUDE.md', 'm0'],
  ['skills', 'Skills', 'm1'],
  ['rules', 'Rules', 'm2'],
  ['agents', 'Agents', 'm3']
]

const CTX_FILES = [
  ['global', '~/.claude/CLAUDE.md'],
  ['project', 'CLAUDE.md'],
  ['projectLocal', 'CLAUDE.local.md'],
  ['projectClaudeDir', '.claude/CLAUDE.md']
]

const utf8 = new TextEncoder()

export function tokensOf(bytes) {
  return Math.ceil(bytes / TOKEN_BYTES)
}

export function listingTokens(item) {
  return tokensOf(utf8.encode(`${item.name}: ${String(item.description ?? '').slice(0, DESC_CAP)}`).length)
}

export function sumTokens(list) {
  return list.reduce((sum, e) => sum + e.always, 0)
}

export function contextItems() {
  const m = state.inventory.claudeMd ?? {}
  const out = []
  for (const [k, name] of CTX_FILES) {
    const f = m[k]
    if (!f?.exists) continue
    const scope = k === 'global' ? 'global' : 'project'
    out.push({
      type: 'claudemd',
      kind: 'claudemd',
      key: `ctx:md:${k}`,
      name,
      scope,
      path: f.path,
      description: 'Loads in full at session start.',
      always: tokensOf(f.size),
      onUse: 0,
      enabled: true
    })
  }
  for (const r of m.rules ?? []) {
    const size = tokensOf(r.size)
    out.push({
      type: 'rules',
      kind: 'rule',
      key: `ctx:rule:${r.path}`,
      name: `rules/${r.path.split(/[\\/]rules[\\/]/).pop()}`,
      scope: r.scope,
      path: r.path,
      conditional: r.conditional,
      description: r.conditional
        ? 'Has paths: in its frontmatter. Loads when Claude reads a matching file.'
        : 'Loads in full at session start.',
      always: r.conditional ? 0 : size,
      onUse: r.conditional ? size : 0,
      enabled: true
    })
  }
  for (const [type, list] of [
    ['skills', state.catalog.skill],
    ['agents', state.catalog.agent]
  ])
    for (const item of list) {
      const cost = listingTokens(item)
      out.push({
        type,
        kind: item.kind,
        key: item.key,
        item,
        name: item.name,
        scope: item.scope,
        description: item.description,
        source: item.source,
        plugin: item.plugin,
        cost,
        always: item.enabled ? cost : 0,
        onUse: tokensOf(item.size ?? 0),
        enabled: item.enabled
      })
    }
  for (const item of state.catalog.mcp)
    out.push({
      type: 'mcp',
      kind: 'mcp',
      key: item.key,
      item,
      name: item.name,
      scope: item.scope,
      description: item.description,
      source: item.source,
      always: 0,
      onUse: 0,
      enabled: item.enabled
    })
  return out.sort((a, b) => b.always - a.always || b.onUse - a.onUse || a.name.localeCompare(b.name))
}

function isOff(e) {
  return Boolean(e.item) && !e.enabled
}

export function keepCtx(e, f) {
  if (f === 'off') return isOff(e)
  return !isOff(e) && (f === 'all' || e.type === f)
}
