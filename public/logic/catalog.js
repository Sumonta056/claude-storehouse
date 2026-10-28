import { keyOf } from '../core/format.js'
import { items, state } from '../core/state.js'

export const PAGES = {
  dash: 'Dashboard',
  fav: 'Favorites',
  dups: 'Duplicates',
  doctor: 'Doctor',
  context: 'Context',
  projects: 'Projects',
  skills: 'Skills',
  agents: 'Agents',
  plugins: 'Plugins',
  mods: 'Mods',
  hooks: 'Hooks',
  mcp: 'MCP servers',
  settings: 'Settings',
  claudemd: 'CLAUDE.md',
  activity: 'Activity'
}

export const SETTINGS_FILE = {
  global: '~/.claude/settings.json',
  project: '.claude/settings.json',
  projectLocal: '.claude/settings.local.json'
}

const MCP_ORIGIN = { user: '~/.claude.json', local: '~/.claude.json · this folder', mcpjson: '.mcp.json' }

export function pluginById(id) {
  return state.inventory.plugins.find((p) => p.id === id)
}

export function pluginLabel(id) {
  return pluginById(id)?.name ?? id
}

export function normalize(inv) {
  items.clear()
  const out = { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [] }
  for (const s of inv.skills) {
    const item = { ...s, key: keyOf('skill', s.source, s.name) }
    items.set(item.key, item)
    out.skill.push(item)
  }
  for (const a of inv.agents) {
    const item = { ...a, key: keyOf('agent', a.source, a.name) }
    items.set(item.key, item)
    out.agent.push(item)
  }
  for (const p of inv.plugins) {
    const parts = [p.version ? `v${p.version}` : '', `${p.skills.length} skills`, `${p.agents.length} agents`]
    if (p.hooks.length) parts.push(`${p.hooks.length} hooks`)
    if (p.mcp.length) parts.push(`${p.mcp.length} MCP`)
    const item = {
      kind: 'plugin',
      key: keyOf('plugin', 'plugin', p.id),
      id: p.id,
      name: p.name,
      source: p.marketplace || 'plugin',
      favSource: 'plugin',
      description: p.description,
      meta: parts.filter(Boolean).join(' · '),
      scope: p.scope,
      path: p.installPath,
      enabled: p.enabled,
      missing: p.missing,
      canToggle: !p.missing,
      favorite: p.favorite,
      mtime: p.mtime ?? null,
      isMod: Boolean(p.isMod),
      modules: p.modules ?? []
    }
    items.set(item.key, item)
    out.plugin.push(item)
    if (item.isMod) out.mod.push(item)
  }
  for (const m of inv.devMods ?? []) {
    const item = {
      kind: 'plugin',
      dev: true,
      key: keyOf('plugin', 'dev', m.id),
      id: m.id,
      name: m.name,
      source: 'dev',
      description: m.description,
      scope: 'dev',
      path: m.path,
      enabled: true,
      missing: false,
      canToggle: false,
      favorite: false,
      mtime: m.mtime ?? null,
      version: m.version,
      session: m.session,
      isMod: true,
      modules: m.modules ?? []
    }
    items.set(item.key, item)
    out.mod.push(item)
  }
  for (const h of inv.hooks) {
    const item = {
      ...h,
      kind: 'hook',
      key: `hook:${h.id}:${h.file}:${h.index?.group}:${h.index?.hook}${h.parked ? ':parked' : ''}`,
      name: String(h.command ?? ''),
      description: `${h.event} · ${h.matcher}`,
      source: h.plugin ? pluginLabel(h.plugin) : h.parked ? 'parked' : (SETTINGS_FILE[h.file] ?? h.file)
    }
    items.set(item.key, item)
    out.hook.push(item)
  }
  for (const m of inv.mcp) {
    const item = {
      ...m,
      kind: 'mcp',
      key: `mcp:${m.origin}:${m.plugin ?? ''}:${m.name}`,
      description: m.command ?? m.url ?? '',
      source: m.plugin ? pluginLabel(m.plugin) : (MCP_ORIGIN[m.origin] ?? m.origin)
    }
    items.set(item.key, item)
    out.mcp.push(item)
  }
  return out
}

function inScope(scope) {
  if (state.scope === 'all') return true
  if (state.scope === 'global') return scope === 'global' || scope === 'plugin' || scope === 'dev'
  return scope === 'project'
}

export function matches(item) {
  const q = state.query.trim().toLowerCase()
  if (!q) return true
  return [item.name, item.description, item.source, item.plugin, item.id, item.model, item.tools?.join(' ')].some((v) =>
    String(v ?? '')
      .toLowerCase()
      .includes(q)
  )
}

export function visible(item) {
  return inScope(item.scope) && matches(item)
}

export function switchInfo(item) {
  if (item.kind === 'plugin') {
    if (item.dev)
      return {
        disabled: true,
        text: 'dev mod',
        title: `Development mod in ~/.claude/dev-mods/${item.session}. It has no switch here.`
      }
    if (item.missing)
      return { disabled: true, text: 'not installed', title: `${item.id} is listed but its folder is missing` }
    const file = item.scope === 'project' ? '.claude/settings.local.json' : '~/.claude/settings.json'
    return { disabled: false, title: `Writes enabledPlugins["${item.id}"] in ${file}` }
  }
  if (item.kind === 'hook' && !item.plugin) {
    if (!item.canToggle)
      return {
        disabled: true,
        text: 'cannot switch',
        title: 'This hook has no command string, so it cannot be parked.'
      }
    const file = SETTINGS_FILE[item.file] ?? item.file
    return {
      disabled: false,
      title: item.enabled
        ? `Off moves this hook from ${file} to ~/.claude/storehouse.json`
        : `On puts this hook back in ${file}`
    }
  }
  if (item.kind === 'mcp') {
    if (!item.canToggle)
      return { disabled: true, text: 'cannot switch', title: `${item.name} cannot be switched here.` }
    return {
      disabled: false,
      title:
        item.origin === 'mcpjson'
          ? 'Writes enabledMcpjsonServers or disabledMcpjsonServers in .claude/settings.local.json'
          : 'Writes disabledMcpServers for this folder in ~/.claude.json'
    }
  }
  if (!item.canToggle) {
    const name = item.plugin ? pluginLabel(item.plugin) : ''
    return {
      disabled: true,
      text: name ? `via plugin ${name}` : `via plugin ${item.source}`,
      title: `Follows the plugin ${item.plugin ?? item.source}. Switch the plugin on the Plugins page.`
    }
  }
  if (item.kind === 'agent') {
    const file = item.path.split(/[\\/]/).pop()
    return {
      disabled: false,
      title: item.enabled
        ? `Renames ${file} to ${file}.disabled`
        : `Renames ${file} back to ${file.replace(/\.disabled$/, '')}`
    }
  }
  const file = item.scope === 'project' ? '.claude/settings.local.json' : '~/.claude/settings.json'
  return { disabled: false, title: `Writes skillOverrides["${item.name}"] in ${file}` }
}

export function favoriteEntries() {
  return state.inventory.favorites.map((f) => ({ fav: f, item: items.get(f.id) ?? null }))
}

export function counts(list) {
  const shown = list.filter(visible)
  return { total: shown.length, on: shown.filter((i) => i.enabled).length }
}

export function otherCounts(list) {
  const shown = list.filter(
    (i) => inScope(i.scope) && matches({ name: i.name ?? i.command, description: i.event, source: i.plugin })
  )
  return { total: shown.length, on: shown.filter((i) => i.enabled).length }
}

export function favCats() {
  return state.inventory.favoriteCategories ?? []
}

export function favOf(item) {
  return state.inventory.favorites.find((f) => f.id === item.key) ?? null
}

export function favNameError(name) {
  if (name === '') return 'Type a category name.'
  if (name.length > 40) return 'Use 40 characters or fewer.'
  if (name.toLowerCase() === 'uncategorized') return 'Uncategorized is a reserved name.'
  return null
}

export function itemLabel(item) {
  return item.plugin ? `${item.name} · via plugin ${pluginLabel(item.plugin)}` : item.name
}

export function favPopOptions(query) {
  const q = query.trim().toLowerCase()
  const all = [{ value: '', label: 'Uncategorized' }, ...favCats().map((c) => ({ value: c, label: c }))]
  const shown = q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all
  if (q && !all.some((o) => o.label.toLowerCase() === q)) shown.push({ create: query.trim() })
  return shown
}

export function favBody(item, favorite, category) {
  const body = {
    kind: item.kind,
    name: item.kind === 'plugin' ? item.id : item.name,
    source: item.kind === 'plugin' ? 'plugin' : item.source,
    favorite
  }
  if (category !== undefined) body.category = category
  return body
}

export function switchable(page, item) {
  return page === 'mcp' ? item.canToggle : item.scope !== 'plugin'
}

export function projectOn() {
  return Boolean(state.inventory?.project?.dir)
}

export const KIND_WORD = { skill: 'Skill', agent: 'Agent', plugin: 'Plugin', hook: 'Hook', mcp: 'MCP server' }

export function isPluginOwned(item) {
  return item.kind !== 'plugin' && Boolean(item.plugin || item.scope === 'plugin')
}

export function ownerId(item) {
  return item.plugin ?? item.source
}

export function ownerPlugin(item) {
  return isPluginOwned(item) ? (state.catalog.plugin.find((p) => p.id === ownerId(item)) ?? null) : null
}

export function hasSwitch(item) {
  return !item.missing && !item.dev && !isPluginOwned(item) && item.kind !== 'hook' && item.kind !== 'mcp'
}
