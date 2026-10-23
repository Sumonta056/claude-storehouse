import { mutateJson, Refusal } from './toggles.js'
import { categoriesOf, favoriteId, readCategories, readFavorites } from '../scan/favorites.js'
import { storehousePath } from '../scan/hooks.js'

const KINDS = ['skill', 'agent', 'plugin']
const MAX_NAME = 40

function refuse(message) {
  throw new Refusal(message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function writeStore(home, apply) {
  const file = storehousePath(home)
  const result = mutateJson(file, { home }, (data, { existed }) => {
    if (!existed) {
      data.favorites = []
      data.parkedHooks = []
    }
    if (data.favorites === undefined) data.favorites = []
    if (!Array.isArray(data.favorites)) refuse(`favorites in ${file} is not an array`)
    if (data.favoriteCategories !== undefined && !Array.isArray(data.favoriteCategories))
      refuse(`favoriteCategories in ${file} is not an array`)
    const had = Object.hasOwn(data, 'favoriteCategories')
    data.favoriteCategories = categoriesOf(data)
    apply(data)
    if (!had && data.favoriteCategories.length === 0) delete data.favoriteCategories
  })
  return result.backup ?? null
}

function mutateStore(home, apply) {
  writeStore(home, apply)
  return readFavorites(home)
}

function normalize(list) {
  return list
    .filter((f) => isObject(f))
    .map((f, index) => ({ f, index }))
    .sort(
      (a, b) => (Number.isFinite(a.f.order) ? a.f.order : a.index) - (Number.isFinite(b.f.order) ? b.f.order : b.index)
    )
    .map(({ f }, order) => ({ ...f, order }))
}

function withCategory(fav, category) {
  const next = { ...fav }
  if (category === null) delete next.category
  else next.category = category
  return next
}

function validName(value, categories, except = null) {
  if (typeof value !== 'string') refuse('category name must be a string')
  const name = value.trim()
  if (name === '') refuse('category name is required')
  if (name.length > MAX_NAME) refuse(`category name must be ${MAX_NAME} characters or fewer`)
  if (name.toLowerCase() === 'uncategorized') refuse('Uncategorized is a reserved name')
  if (categories.some((c) => c !== except && c.toLowerCase() === name.toLowerCase()))
    refuse(`category ${name} already exists`)
  return name
}

function resolveCategory(data, category, create) {
  if (category === null) return null
  if (typeof category !== 'string') refuse('category must be a string or null')
  const found = data.favoriteCategories.find((c) => c.toLowerCase() === category.trim().toLowerCase())
  if (found) return found
  if (!create) refuse(`category ${category} does not exist`)
  const name = validName(category, data.favoriteCategories)
  data.favoriteCategories.push(name)
  return name
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

export function setFavorite({ kind, name, source, favorite, category }, home) {
  if (!KINDS.includes(kind)) refuse(`favorites support skill, agent, and plugin, got ${kind}`)
  if (typeof name !== 'string' || name === '') refuse('name is required')
  if (typeof source !== 'string' || source === '') refuse('source is required')
  if (typeof favorite !== 'boolean') refuse('favorite must be true or false')
  const id = favoriteId(kind, source, name)
  const same = (f) => isObject(f) && f.kind === kind && f.source === source && f.name === name
  return mutateStore(home, (data) => {
    const exists = data.favorites.some(same)
    if (favorite) {
      const target = category === undefined ? undefined : resolveCategory(data, category, true)
      const current = normalize(data.favorites)
      if (!exists) {
        data.favorites = [...current, withCategory({ id, kind, name, source, order: current.length }, target ?? null)]
      } else if (target !== undefined) {
        data.favorites = current.map((f) => (same(f) ? withCategory(f, target) : f))
      }
    } else if (exists) {
      data.favorites = normalize(data.favorites.filter((f) => !same(f)))
    }
  })
}

export function editCategory({ op, name, newName }, home) {
  if (!['create', 'rename', 'delete'].includes(op)) refuse(`op must be create, rename, or delete, got ${op}`)
  const backup = writeStore(home, (data) => {
    const list = data.favoriteCategories
    if (op === 'create') {
      list.push(validName(name, list))
      return
    }
    const old = typeof name === 'string' ? list.find((c) => c.toLowerCase() === name.trim().toLowerCase()) : undefined
    if (old === undefined) refuse(`category ${name} does not exist`)
    const next = op === 'rename' ? validName(newName, list, old) : null
    data.favoriteCategories = next === null ? list.filter((c) => c !== old) : list.map((c) => (c === old ? next : c))
    data.favorites = data.favorites.map((f) =>
      isObject(f) && typeof f.category === 'string' && f.category.trim() === old ? withCategory(f, next) : f
    )
  })
  return { favorites: readFavorites(home), categories: readCategories(home), backup }
}

export function reorderFavorites(ids, home, move) {
  if (!Array.isArray(ids)) refuse('ids must be an array')
  if (move !== undefined && (!isObject(move) || typeof move.id !== 'string' || !Object.hasOwn(move, 'category')))
    refuse('move must be { id, category }')
  return mutateStore(home, (data) => {
    if (
      move !== undefined &&
      !data.favorites.some((f) => isObject(f) && favoriteId(f.kind, f.source, f.name) === move.id)
    )
      refuse(`favorite ${move.id} does not exist`)
    const target = move === undefined ? undefined : resolveCategory(data, move.category, false)
    const current = normalize(data.favorites).map((f) =>
      target !== undefined && favoriteId(f.kind, f.source, f.name) === move.id ? withCategory(f, target) : f
    )
    const rank = new Map(ids.map((id, index) => [id, index]))
    const listed = current.filter((f) => rank.has(favoriteId(f.kind, f.source, f.name)))
    const rest = current.filter((f) => !rank.has(favoriteId(f.kind, f.source, f.name)))
    listed.sort(
      (a, b) => rank.get(favoriteId(a.kind, a.source, a.name)) - rank.get(favoriteId(b.kind, b.source, b.name))
    )
    data.favorites = [...listed, ...rest].map((f, order) => ({ ...f, order }))
  })
}
