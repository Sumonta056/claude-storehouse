import { readJson } from '../write/json-file.js'
import { storehousePath } from './hooks.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function favoriteId(kind, source, name) {
  return `${kind}:${source}:${name}`
}

export function readFavorites(home) {
  const result = readJson(storehousePath(home))
  if (!result.ok || !isObject(result.data) || !Array.isArray(result.data.favorites)) return []
  return result.data.favorites
    .filter((f) => isObject(f) && typeof f.kind === 'string' && typeof f.name === 'string' && typeof f.source === 'string')
    .map((f, index) => ({
      id: favoriteId(f.kind, f.source, f.name),
      kind: f.kind,
      name: f.name,
      source: f.source,
      order: Number.isFinite(f.order) ? f.order : index
    }))
    .sort((a, b) => a.order - b.order)
}

export function applyFavorites(inventory, home) {
  const stored = readFavorites(home)
  const ids = new Set(stored.map((f) => f.id))
  const lookup = new Map()
  for (const skill of inventory.skills) lookup.set(favoriteId('skill', skill.source, skill.name), skill)
  for (const agent of inventory.agents) lookup.set(favoriteId('agent', agent.source, agent.name), agent)
  for (const plugin of inventory.plugins) lookup.set(favoriteId('plugin', 'plugin', plugin.id), plugin)
  for (const skill of inventory.skills) skill.favorite = ids.has(favoriteId('skill', skill.source, skill.name))
  for (const agent of inventory.agents) agent.favorite = ids.has(favoriteId('agent', agent.source, agent.name))
  for (const plugin of inventory.plugins) plugin.favorite = ids.has(favoriteId('plugin', 'plugin', plugin.id))
  return stored.map((f) => {
    const item = lookup.get(f.id)
    return {
      ...f,
      exists: Boolean(item),
      enabled: item ? item.enabled === true : false,
      scope: item ? item.scope : null,
      description: item && typeof item.description === 'string' ? item.description : ''
    }
  })
}
