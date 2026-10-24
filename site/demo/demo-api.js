;(() => {
  const realFetch = window.fetch.bind(window)
  const NOT_IN_DEMO = 'not available in the live demo. Run npx claude-storehouse to use it on your own setup'
  let db = null
  const ready = realFetch('demo-data.json')
    .then((res) => res.json())
    .then((data) => {
      db = data
      db.activity = []
      db.nextId = 1
      db.backups = {}
    })

  const clone = (value) => JSON.parse(JSON.stringify(value))
  const favId = (kind, source, name) => `${kind}:${source}:${name}`
  const claudeDir = () => `${db.home}/.claude`
  const projectDir = () => db.inventory.project.dir
  const storeFile = () => `${claudeDir()}/storehouse.json`
  const stampFor = (content) => `${Date.now()}:${content.length}`

  class DemoError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  }

  function lookup() {
    const inv = db.inventory
    const map = new Map()
    for (const s of inv.skills) map.set(favId('skill', s.source, s.name), s)
    for (const a of inv.agents) map.set(favId('agent', a.source, a.name), a)
    for (const p of inv.plugins) map.set(favId('plugin', 'plugin', p.id), p)
    return map
  }

  function inventory() {
    const inv = db.inventory
    const items = lookup()
    const ids = new Set(db.store.favorites.map((f) => favId(f.kind, f.source, f.name)))
    for (const [id, item] of items) item.favorite = ids.has(id)
    inv.favoriteCategories = [...db.store.favoriteCategories]
    inv.favorites = db.store.favorites.map((f, order) => {
      const id = favId(f.kind, f.source, f.name)
      const item = items.get(id)
      return {
        id,
        kind: f.kind,
        name: f.name,
        source: f.source,
        order,
        category: f.category ?? null,
        exists: Boolean(item),
        enabled: item ? item.enabled === true : false,
        scope: item ? item.scope : null,
        description: item?.description ?? ''
      }
    })
    return clone(inv)
  }

  function record(entry) {
    const full = { id: String(db.nextId++), time: new Date().toISOString(), undone: false, isUndo: false, ...entry }
    db.activity.push(full)
    return view(full)
  }

  function latestSave(file) {
    return [...db.activity].reverse().find((e) => e.kind === 'save' && e.file === file && !e.isUndo && !e.undone)
  }

  function canUndo(entry) {
    if (entry.isUndo || entry.undone || !entry.undo) return false
    return entry.kind !== 'save' || latestSave(entry.file) === entry
  }

  function view(entry) {
    const { id, time, file, message, kind } = entry
    return { id, time, file, message, kind, canUndo: canUndo(entry) }
  }

  function targetFile(item) {
    if (item.kind === 'agent') return item.path
    if (item.kind === 'hook') return storeFile()
    if (item.kind === 'mcp') {
      return item.origin === 'mcpjson' ? `${projectDir()}/.claude/settings.local.json` : `${db.home}/.claude.json`
    }
    return item.scope === 'project' ? `${projectDir()}/.claude/settings.local.json` : `${claudeDir()}/settings.json`
  }

  function findToggleItem(body) {
    const inv = db.inventory
    if (body.kind === 'plugin') return { ...inv.plugins.find((p) => p.id === body.name), kind: 'plugin' }
    if (body.kind === 'skill')
      return inv.skills.find((s) => s.name === body.name && s.scope === body.scope && !s.plugin)
    if (body.kind === 'agent')
      return inv.agents.find((a) => a.name === body.name && a.scope === body.scope && !a.plugin)
    if (body.kind === 'mcp') return inv.mcp.find((m) => m.name === body.name && m.scope === body.scope)
    if (body.kind === 'hook') {
      return inv.hooks.find((h) =>
        body.enabled ? h.id === body.name : h.command === body.name && h.event === body.event
      )
    }
    return null
  }

  function setEnabled(kind, key, enabled) {
    const inv = db.inventory
    if (kind === 'plugin') {
      const plugin = inv.plugins.find((p) => p.id === key)
      plugin.enabled = enabled
      for (const list of [inv.skills, inv.agents, inv.hooks, inv.mcp]) {
        for (const child of list) if (child.plugin === key) child.enabled = enabled
      }
      return
    }
    const list = { skill: inv.skills, agent: inv.agents, mcp: inv.mcp, hook: inv.hooks }[kind]
    const item = list.find((i) => i === key)
    item.enabled = enabled
    if (kind === 'hook') item.parked = !enabled
  }

  function toggle(body) {
    const item = findToggleItem(body)
    if (!item || (!item.canToggle && body.kind !== 'plugin')) throw new DemoError(400, `no ${body.kind} ${body.name}`)
    const key = body.kind === 'plugin' ? item.id : item
    const label = body.kind === 'hook' ? `${item.event} hook · ${item.matcher}` : `${body.kind} ${body.name}`
    setEnabled(body.kind, key, body.enabled)
    const file = targetFile({ ...item, kind: body.kind })
    const entry = record({
      kind: 'toggle',
      file,
      message: `Switched ${label} ${body.enabled ? 'on' : 'off'}`,
      undo: () => setEnabled(body.kind, key, !body.enabled)
    })
    return { ok: true, file, backup: null, entry }
  }

  function setFavorite({ kind, name, source, favorite, category }) {
    const list = db.store.favorites
    const index = list.findIndex((f) => f.kind === kind && f.name === name && f.source === source)
    if (favorite) {
      if (category !== undefined && category !== null && !db.store.favoriteCategories.includes(category)) {
        db.store.favoriteCategories.push(category)
      }
      if (index === -1) list.push({ kind, name, source, category: category ?? null })
      else if (category !== undefined) list[index].category = category
    } else if (index !== -1) {
      list.splice(index, 1)
    }
  }

  function favorite(body) {
    const before = db.store.favorites.find(
      (f) => f.kind === body.kind && f.name === body.name && f.source === body.source
    )
    const previous = before ? { ...before } : null
    setFavorite(body)
    const label = `${body.kind} ${body.name}`
    const message =
      body.favorite && previous
        ? body.category === undefined
          ? `Kept ${label} as a favorite`
          : `Moved ${label} to ${body.category ?? 'Uncategorized'}`
        : `${body.favorite ? 'Starred' : 'Unstarred'} ${label}`
    const entry = record({
      kind: body.favorite && previous ? 'save' : 'favorite',
      file: storeFile(),
      message,
      undo: () => {
        if (previous) setFavorite({ ...previous, favorite: true, category: previous.category ?? null })
        else setFavorite({ ...body, favorite: false })
      }
    })
    return { ok: true, ...favoritesOut(), entry }
  }

  function favoritesOut() {
    const inv = inventory()
    return { favorites: inv.favorites, favoriteCategories: inv.favoriteCategories }
  }

  function category({ op, name, newName }) {
    const before = clone(db.store)
    const cats = db.store.favoriteCategories
    const clean = String(name ?? '').trim()
    if (op === 'create') {
      if (!clean) throw new DemoError(400, 'category name is required')
      if (cats.some((c) => c.toLowerCase() === clean.toLowerCase()))
        throw new DemoError(400, `category ${clean} already exists`)
      cats.push(clean)
    } else {
      const old = cats.find((c) => c.toLowerCase() === clean.toLowerCase())
      if (!old) throw new DemoError(400, `category ${name} does not exist`)
      const next = op === 'rename' ? String(newName ?? '').trim() : null
      if (op === 'rename' && !next) throw new DemoError(400, 'category name is required')
      db.store.favoriteCategories =
        next === null ? cats.filter((c) => c !== old) : cats.map((c) => (c === old ? next : c))
      for (const f of db.store.favorites) if (f.category === old) f.category = next
    }
    const message =
      op === 'rename'
        ? `Renamed category ${clean} to ${String(newName).trim()}`
        : `${op === 'create' ? 'Added' : 'Deleted'} category ${clean}`
    const entry = record({ kind: 'save', file: storeFile(), message, undo: () => (db.store = before) })
    return { ok: true, ...favoritesOut(), entry }
  }

  function order(body) {
    const ids = Array.isArray(body) ? body : body.ids
    const move = Array.isArray(body) ? undefined : body.move
    const before = clone(db.store)
    const rank = new Map(ids.map((id, i) => [id, i]))
    const list = db.store.favorites
    if (move) {
      const target = list.find((f) => favId(f.kind, f.source, f.name) === move.id)
      if (target) target.category = move.category
    }
    const listed = list.filter((f) => rank.has(favId(f.kind, f.source, f.name)))
    const rest = list.filter((f) => !rank.has(favId(f.kind, f.source, f.name)))
    listed.sort((a, b) => rank.get(favId(a.kind, a.source, a.name)) - rank.get(favId(b.kind, b.source, b.name)))
    db.store.favorites = [...listed, ...rest]
    const entry = record({
      kind: 'save',
      file: storeFile(),
      message: move ? 'Moved and reordered favorites' : 'Reordered favorites',
      undo: () => (db.store = before)
    })
    return { ok: true, ...favoritesOut(), entry }
  }

  function getFile(file) {
    const found = db.files[file]
    if (!found) throw new DemoError(404, `${file} not found`)
    return clone(found)
  }

  function writeContent(file, content) {
    db.files[file] = { ...db.files[file], content, stamp: stampFor(content) }
    const settings = Object.values(db.inventory.settings).find((s) => s.path === file)
    if (settings) {
      try {
        settings.data = JSON.parse(content)
      } catch {}
    }
    const memory = Object.values(db.inventory.claudeMd).find((m) => m.path === file)
    if (memory) memory.size = content.length
  }

  function putFile({ path, content, stamp }) {
    const current = db.files[path]
    if (!current || current.entries) throw new DemoError(404, `${path} not found`)
    if (current.readOnly) throw new DemoError(403, `${path} is read-only`)
    if (path.endsWith('.json')) {
      try {
        JSON.parse(content)
      } catch (err) {
        throw new DemoError(400, `invalid JSON: ${err.message}`)
      }
    }
    if (stamp != null && stamp !== current.stamp)
      throw new DemoError(409, `${path} changed on disk since it was loaded`)
    const previous = current.content
    const backup = `${path}.demo-backup-${db.nextId}`
    db.backups[path] = [
      { path: backup, time: new Date().toISOString(), content: previous },
      ...(db.backups[path] ?? [])
    ]
    writeContent(path, content)
    const name = path.split('/').pop()
    const entry = record({
      kind: 'save',
      file: path,
      message: `Saved ${name}`,
      undo: () => writeContent(path, previous)
    })
    return { ok: true, backup, content, stamp: db.files[path].stamp, entry }
  }

  function restore({ path, backup }) {
    const found = (db.backups[path] ?? []).find((b) => b.path === backup)
    if (!found) throw new DemoError(404, `${backup} not found`)
    writeContent(path, found.content)
    const entry = record({ kind: 'save', file: path, message: `Restored ${path.split('/').pop()} from backup` })
    return { ok: true, backup: null, content: found.content, stamp: db.files[path].stamp, entry }
  }

  function undo({ entryId }) {
    const entry = db.activity.find((e) => e.id === String(entryId))
    if (!entry || !canUndo(entry)) throw new DemoError(400, 'this change can no longer be undone')
    entry.undo()
    entry.undone = true
    const recorded = record({ kind: entry.kind, file: entry.file, message: `Undid: ${entry.message}`, isUndo: true })
    return { ok: true, file: entry.file, entry: recorded }
  }

  function route(method, url, body) {
    const key = `${method} ${url.pathname}`
    const query = url.searchParams
    switch (key) {
      case 'GET /api/inventory':
        return inventory()
      case 'GET /api/usage':
        return clone(db.usage)
      case 'GET /api/doctor':
        return clone(db.doctor)
      case 'GET /api/file':
        return getFile(query.get('path'))
      case 'GET /api/backups':
        return { backups: (db.backups[query.get('path')] ?? []).map(({ path, time }) => ({ path, time })) }
      case 'GET /api/activity':
        return { entries: db.activity.map(view).reverse() }
      case 'POST /api/toggle':
        return toggle(body)
      case 'POST /api/favorite':
        return favorite(body)
      case 'POST /api/favorites/category':
        return category(body)
      case 'PUT /api/favorites/order':
        return order(body)
      case 'PUT /api/file':
        return putFile(body)
      case 'POST /api/restore':
        return restore(body)
      case 'POST /api/undo':
        return undo(body)
      default:
        throw new DemoError(501, `${method === 'DELETE' ? 'Delete is' : 'This action is'} ${NOT_IN_DEMO}`)
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init)
    await ready
    const method = (init.method ?? 'GET').toUpperCase()
    const body = init.body ? JSON.parse(init.body) : {}
    let status = 200
    let json
    try {
      json = route(method, url, body)
    } catch (err) {
      status = err.status ?? 500
      json = { error: err.message }
    }
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
  }
})()
