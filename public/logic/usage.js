import { MODEL_CLASSES, ago, modelName } from '../core/format.js'
import { state } from '../core/state.js'
import { pluginLabel } from './catalog.js'

export const USAGE_PAGES = new Set(['dash', 'skills', 'agents', 'mcp'])

export const USE_WORD = { skills: 'skill', agents: 'agent', mcp: 'MCP server' }

const DAY = 86400000

export function modelShares(u) {
  if (!u.cost) return []
  const top = u.models.slice(0, 3).map((m) => ({ name: modelName(m.model), cost: m.cost }))
  const rest = u.cost - top.reduce((sum, m) => sum + m.cost, 0)
  if (rest > 0.005) top.push({ name: 'Other', cost: rest })
  return top.map((m, i) => ({ ...m, share: (m.cost / u.cost) * 100, cls: MODEL_CLASSES[i] }))
}

export function useReady() {
  return Boolean(state.usage?.items && state.usage.all?.responses)
}

function useCovered() {
  return useReady() && typeof state.usage.since === 'number' && state.usage.since <= Date.now() - 30 * DAY
}

function toolName(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '_')
}

function useKeys(item) {
  const p = item.plugin ? String(pluginLabel(item.plugin)).replace(/@.*/, '') : ''
  if (item.kind === 'mcp')
    return [p ? `mcp:plugin:${toolName(p)}:${toolName(item.name)}` : `mcp:${toolName(item.name)}`]
  const bare = `${item.kind}:${item.name}`
  if (!p) return [bare]
  const local = state.catalog[item.kind].some((o) => !o.plugin && o.name === item.name)
  return local ? [`${item.kind}:${p}:${item.name}`] : [`${item.kind}:${p}:${item.name}`, bare]
}

export function useOf(item) {
  if (!useReady() || !['skill', 'agent', 'mcp'].includes(item.kind)) return null
  let count30 = 0
  let last = 0
  for (const key of useKeys(item)) {
    const u = state.usage.items[key]
    if (!u) continue
    count30 += u.count30
    last = Math.max(last, u.last)
  }
  return { count30, last }
}

export function isUnused(item) {
  const u = useOf(item)
  if (!u || u.count30 || !item.enabled || item.disableModelInvocation || !useCovered()) return false
  return typeof item.mtime !== 'number' || item.mtime < Date.now() - 30 * DAY
}

export function sharedWith(item) {
  const mine = useKeys(item)
  return state.catalog[item.kind].filter((o) => o !== item && useKeys(o).some((k) => mine.includes(k))).length
}

export function lastText(ms) {
  const days = Math.floor((Date.now() - ms) / DAY)
  return days >= 1 ? `${days} d ago` : ago(ms)
}

export function sortRows(list) {
  if (!useReady() || !USAGE_PAGES.has(state.page)) return list
  const out = [...list]
  if (state.usageSort === 'name') return out.sort((a, b) => a.name.localeCompare(b.name))
  const dir = state.usageSort === 'most' ? -1 : 1
  const val = (i) => useOf(i) ?? { count30: 0, last: 0 }
  return out.sort((a, b) => {
    const ua = val(a)
    const ub = val(b)
    return dir * (ua.count30 - ub.count30) || dir * (ua.last - ub.last) || a.name.localeCompare(b.name)
  })
}
