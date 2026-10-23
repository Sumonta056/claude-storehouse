import { mutateJson, Refusal } from './toggles.js'
import { favoriteId, readFavorites } from '../scan/favorites.js'
import { storehousePath } from '../scan/hooks.js'

const KINDS = ['skill', 'agent', 'plugin']

function refuse(message) {
  throw new Refusal(message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mutateStore(home, apply) {
  const file = storehousePath(home)
  mutateJson(file, { home }, (data, { existed }) => {
    if (!existed) {
      data.favorites = []
      data.parkedHooks = []
    }
    if (data.favorites === undefined) data.favorites = []
    if (!Array.isArray(data.favorites)) refuse(`favorites in ${file} is not an array`)
    apply(data)
  })
  return readFavorites(home)
}

function normalize(list) {
  return list
    .filter((f) => isObject(f))
    .map((f, index) => ({ f, index }))
    .sort((a, b) => (Number.isFinite(a.f.order) ? a.f.order : a.index) - (Number.isFinite(b.f.order) ? b.f.order : b.index))
    .map(({ f }, order) => ({ ...f, order }))
}

export function loadStore(home) {
  const file = storehousePath(home)
  let data
  mutateJson(file, { home }, (stored, { existed }) => {
    if (!existed) {
      stored.favorites = []
      stored.parkedHooks = []
    }
    data = stored
  })
  return {
    favorites: readFavorites(home),
    parkedHooks: Array.isArray(data.parkedHooks) ? data.parkedHooks : []
  }
}

export function setFavorite({ kind, name, source, favorite }, home) {
  if (!KINDS.includes(kind)) refuse(`favorites support skill, agent, and plugin, got ${kind}`)
  if (typeof name !== 'string' || name === '') refuse('name is required')
  if (typeof source !== 'string' || source === '') refuse('source is required')
  if (typeof favorite !== 'boolean') refuse('favorite must be true or false')
  const id = favoriteId(kind, source, name)
  const same = (f) => isObject(f) && f.kind === kind && f.source === source && f.name === name
  return mutateStore(home, (data) => {
    const exists = data.favorites.some(same)
    if (favorite && !exists) {
      const current = normalize(data.favorites)
      data.favorites = [...current, { id, kind, name, source, order: current.length }]
    } else if (!favorite && exists) {
      data.favorites = normalize(data.favorites.filter((f) => !same(f)))
    }
  })
}

export function reorderFavorites(ids, home) {
  if (!Array.isArray(ids)) refuse('ids must be an array')
  return mutateStore(home, (data) => {
    const current = normalize(data.favorites)
    const rank = new Map(ids.map((id, index) => [id, index]))
    const listed = current.filter((f) => rank.has(favoriteId(f.kind, f.source, f.name)))
    const rest = current.filter((f) => !rank.has(favoriteId(f.kind, f.source, f.name)))
    listed.sort((a, b) => rank.get(favoriteId(a.kind, a.source, a.name)) - rank.get(favoriteId(b.kind, b.source, b.name)))
    data.favorites = [...listed, ...rest].map((f, order) => ({ ...f, order }))
  })
}
