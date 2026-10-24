import { get, send } from '../api.js'
import { ask, showBanner, toast } from './dom.js'
import { baseName, tilde } from './format.js'
import { dr, pending, state } from './state.js'
import { normalize } from '../logic/catalog.js'
import { markStale } from '../logic/config.js'
import { loadActivity } from '../pages/activity.js'
import { drawerOpen } from '../ui/drawer.js'
import { render } from '../ui/nav.js'
import { cliScope, pluginParts } from '../ui/rows.js'

export async function editFavCategory(body, message) {
  if (pending.has('favcat')) return false
  pending.add('favcat')
  try {
    await send('POST', '/api/favorites/category', body)
    toast(`${message} · ~/.claude/storehouse.json`)
    await refresh()
    return true
  } catch (err) {
    toast(`Could not update categories: ${err.message}`, true)
    return false
  } finally {
    pending.delete('favcat')
    loadActivity()
  }
}

export function reveal(item) {
  const file = item.path
  return guarded(`reveal-${item.key}`, async () => {
    try {
      await send('POST', '/api/open', { path: file, app: 'finder' })
      toast(`Revealed ${tilde(file)} in Finder`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

export async function uninstallPlugin(item) {
  const busy = `${item.key}:uninstall`
  if (pending.has(busy)) return
  const parts = pluginParts(item.id)
  const command = `claude plugin uninstall ${item.id} --scope ${cliScope(item.id)}`
  const yes = await ask({
    title: item.missing ? `Remove entry ${item.name}?` : `Uninstall ${item.name}?`,
    message: item.missing
      ? 'The plugin folder is gone. This removes its entry from installed_plugins.json.'
      : `Claude Code stops loading ${parts.length ? `its ${parts.join(', ')}` : 'this plugin'}. You can install it again with /plugin.`,
    ok: item.missing ? 'Remove entry' : 'Uninstall',
    danger: true,
    command
  })
  if (!yes) return
  pending.add(busy)
  try {
    await send('POST', '/api/plugin/uninstall', { id: item.id })
    toast(item.missing ? `Removed entry ${item.id}` : `Uninstalled ${item.id}`)
    await refresh()
  } catch (err) {
    toast(`Could not uninstall ${item.name}: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

export function askReload(file) {
  return ask({
    title: `${baseName(file)} changed on disk`,
    message: 'This file changed on disk. Reload it before you save. Reload discards your unsaved edits.',
    ok: 'Reload (discard mine)',
    danger: true
  })
}

export async function loadProjectFiles() {
  if (!state.inventory?.project?.dir) {
    state.projectFiles = null
    return
  }
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(state.inventory.project.dir)}`)
    state.projectFiles = new Set((res.entries ?? []).map((e) => e.name))
  } catch {
    state.projectFiles = null
  }
}

export async function refresh() {
  const [inv, doc] = await Promise.all([
    get('/api/inventory'),
    get('/api/doctor').catch((err) => ({ error: err.message }))
  ])
  state.inventory = inv
  state.doctor = doc
  state.catalog = normalize(inv)
  markStale()
  render()
}

function toggleBody(item, enabled) {
  if (item.kind === 'plugin') return { kind: 'plugin', name: item.id, scope: item.scope, enabled }
  if (item.kind === 'hook') {
    if (enabled) return { kind: 'hook', name: item.id, scope: item.scope, enabled }
    return {
      kind: 'hook',
      name: item.command,
      scope: item.scope,
      file: item.file,
      event: item.event,
      index: item.index,
      enabled
    }
  }
  if (item.kind === 'mcp') {
    const body = { kind: 'mcp', name: item.name, scope: item.scope, origin: item.origin, enabled }
    if (item.plugin) body.plugin = item.plugin
    return body
  }
  return { kind: item.kind, name: item.name, scope: item.scope, enabled, plugin: item.plugin }
}

export async function toggle(item) {
  const busy = `${item.key}:toggle`
  if (!item.canToggle || pending.has(busy)) return
  pending.add(busy)
  const enabled = !item.enabled
  const body = toggleBody(item, enabled)
  item.enabled = enabled
  render()
  try {
    const res = await send('POST', '/api/toggle', body)
    toast(`Wrote ${tilde(res.file)}${res.backup ? ' · backup saved' : ''}`)
    showBanner()
    await refresh()
    if (item.kind === 'hook' && !drawerOpen()) {
      const moved = state.catalog.hook.find(
        (h) => h.event === item.event && h.command === item.command && h.file === item.file && h.enabled === enabled
      )
      const row = moved
        ? [...document.querySelectorAll('#p-hooks [data-key]')].find((r) => r.dataset.key === moved.key)
        : null
      row?.querySelector('[data-act="toggle"]')?.focus()
    }
  } catch (err) {
    item.enabled = !enabled
    render()
    toast(`Could not switch ${item.name}: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

export async function star(body, message) {
  const busy = `${body.kind}:${body.source}:${body.name}:star`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    await send('POST', '/api/favorite', body)
    toast(`${message} · ~/.claude/storehouse.json`)
    await refresh()
  } catch (err) {
    toast(`Could not update favorites: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

export async function guarded(name, fn) {
  const busy = `${dr.key}:${name}`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    await fn()
  } finally {
    pending.delete(busy)
  }
}

export async function busy(name, fn) {
  if (pending.has(name)) return
  pending.add(name)
  try {
    await fn()
  } finally {
    pending.delete(name)
  }
}

export async function afterWrite() {
  await loadProjectFiles()
  try {
    await refresh()
  } catch {
    render()
  }
  loadActivity()
}

export function deleteRow(item) {
  if (item.kind !== 'hook' && item.kind !== 'mcp') return
  return busy(`del:${item.key}`, async () => {
    const hook = item.kind === 'hook'
    const where = hook && item.parked ? '~/.claude/storehouse.json' : tilde(item.path)
    const yes = await ask({
      title: hook ? `Delete ${item.event} hook?` : `Delete MCP server ${item.name}?`,
      message: `${hook ? item.command : item.name} is removed from ${where}. A backup of the file is written first.`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = hook
        ? await send('DELETE', '/api/hook', { id: item.id })
        : await send('DELETE', '/api/mcp', { scope: item.scope, name: item.name, origin: item.origin })
      toast(`Deleted ${hook ? `${item.event} hook` : `MCP server ${item.name}`} · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
    } catch (err) {
      toast(`Could not delete: ${err.message}`, true)
    }
  })
}
