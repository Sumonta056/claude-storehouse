import { send } from '../api.js'
import { askReload, deleteRow, guarded, refresh, reveal, toggle, uninstallPlugin } from '../core/actions.js'
import { $, HOLDER, ask, cardKey, holderKey, toast } from '../core/dom.js'
import { ago, baseName, esc, isFolderSkill, parentDir, plural, shortVersion, tilde } from '../core/format.js'
import { ICON, kindIcon } from '../core/icons.js'
import { dr, items } from '../core/state.js'
import {
  KIND_WORD,
  hasSwitch,
  isPluginOwned,
  ownerId,
  ownerPlugin,
  pluginById,
  pluginLabel,
  switchInfo
} from '../logic/catalog.js'
import { loadActivity } from '../pages/activity.js'
import {
  fileBodyHtml,
  formatText,
  jsonBodyHtml,
  loadBackups,
  loadDir,
  loadFile,
  onEditorInput,
  pluginBodyHtml,
  setTab,
  updateDirty
} from './drawer-body.js'
import { starItem } from './fav-popover.js'
import { menuEntries } from './rows.js'

export const TEXT_EXT = /\.(md|json|txt)$/i

export function drawerOpen() {
  return $('dr').classList.contains('open')
}

export function drawerItem() {
  return dr.key ? (items.get(dr.key) ?? null) : null
}

export function isDirty() {
  const txt = $('dr-txt')
  return Boolean(drawerOpen() && txt && dr.editable && txt.value !== dr.loaded)
}

const LOCK_WORD = { skill: 'skill', agent: 'agent', hook: 'hook', mcp: 'MCP server' }

function drawerMetaHtml(item) {
  const parts = [`<b class="k">${esc(item.isMod ? 'Mod' : (KIND_WORD[item.kind] ?? item.kind))}</b>`]
  const add = (text, title) => parts.push(`<span${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`)
  if (item.kind === 'plugin') {
    add(item.dev ? 'in development' : item.source === 'plugin' ? item.scope : item.source)
    const version = pluginById(item.id)?.version ?? item.version
    if (version) add(shortVersion(version), version)
    if (item.modules?.length) add(plural(item.modules.length, 'module'), item.modules.join(', '))
    if (item.dev) add(`session ${item.session.slice(0, 8)}`, item.session)
  } else if (isPluginOwned(item)) {
    add(`via plugin ${pluginLabel(ownerId(item))}`)
  } else if (item.scope) {
    add(item.scope)
  }
  if (item.kind === 'agent') {
    if (item.model) add(item.model)
    if (item.tools?.length) add(plural(item.tools.length, 'tool'), item.tools.join(', '))
  }
  if (item.mtime) add(`changed ${ago(item.mtime)}`)
  return parts.join('<i aria-hidden="true"> · </i>')
}

function stateHtml(item) {
  if (hasSwitch(item)) {
    const sw = switchInfo(item)
    const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
    return `<button type="button" class="sw-pill" role="switch" data-dact="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" aria-describedby="dr-st-file" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}><span class="sw" aria-hidden="true"></span>${item.enabled ? 'On' : 'Off'}</button><span class="sr-only" id="dr-st-file">${esc(sw.title)}</span>`
  }
  if (item.missing) return '<span class="st-chip bad">Missing</span>'
  if (item.dev) return `<span class="st-chip" title="${esc(switchInfo(item).title)}">Read-only</span>`
  const owner = ownerPlugin(item)
  const on = owner ? owner.enabled : item.enabled !== false
  const title = owner ? ` title="${esc(`Follows the plugin ${owner.name}`)}"` : ''
  return `<span class="st-chip ${on ? 'on' : 'off'}"${title}>${on ? 'On' : 'Off'}</span>`
}

function drawerName(item) {
  if (item.kind === 'hook') return `${item.event} · ${item.matcher}`
  return item.name
}

function drawerMenuEntries(item) {
  if (item.kind === 'hook' || item.kind === 'mcp' || isPluginOwned(item)) return []
  return menuEntries(item).filter(([act]) => act !== 'm-open')
}

function headTools(item) {
  const state = stateHtml(item)
  if (item.kind === 'hook' || item.kind === 'mcp') return state
  const starBtn = item.dev
    ? ''
    : `<button type="button" class="icon-btn star" data-dact="star" aria-haspopup="dialog" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>`
  const entries = drawerMenuEntries(item)
  if (!entries.length) return state + starBtn
  const menu = dr.menu
    ? `<div class="menu" role="menu" id="dr-menu" aria-label="${esc(`More actions for ${item.name}`)}">${entries
        .map(
          ([act, text, danger]) =>
            `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-dact="${act}">${esc(text)}</button>`
        )
        .join('')}</div>`
    : ''
  return `${state}${starBtn}<div class="dr-more"><button type="button" class="icon-btn" data-dact="menu" id="dr-menu-btn" aria-haspopup="menu" aria-expanded="${dr.menu ? 'true' : 'false'}"${dr.menu ? ' aria-controls="dr-menu"' : ''} aria-label="More actions">${ICON.dots}</button>${menu}</div>`
}

function lockHtml(item) {
  const p = ownerPlugin(item)
  const actions = p
    ? `<div class="lock-a">
        <button type="button" class="btn soft" data-dact="plugin-toggle"${p.canToggle ? '' : ' disabled'}>${p.enabled ? 'Switch off plugin' : 'Switch on plugin'}</button>
        <button type="button" class="btn danger" data-dact="plugin-uninstall">Uninstall plugin…</button>
        <button type="button" class="btn-link" data-dact="plugin-open">Open plugin <span aria-hidden="true">→</span></button>
      </div>`
    : ''
  return `<div class="dr-note" role="note">
      <div class="lock-t">${ICON.lock}<p><b>You cannot delete this ${LOCK_WORD[item.kind] ?? item.kind}.</b> It is part of the plugin <b>${esc(pluginLabel(ownerId(item)))}</b>. To remove it, switch off or uninstall the plugin.</p></div>
      ${actions}
    </div>`
}

function noteHtml(item) {
  if (item.kind === 'plugin' && item.missing) {
    return `<div class="dr-note bad" role="note"><div class="lock-t">${ICON.warn}<p><b>Plugin folder missing.</b> ${esc(item.id)} is listed in installed_plugins.json, but its folder is gone. Remove the entry to clean up.</p></div></div>`
  }
  if (item.dev) {
    return `<div class="dr-note" role="note"><div class="lock-t">${ICON.lock}<p><b>Development mod.</b> It is not in installed_plugins.json, so it has no switch here.</p></div></div>`
  }
  return isPluginOwned(item) ? lockHtml(item) : ''
}

function pathHtml() {
  return `<div class="f-path"><code class="path"><bdo dir="ltr" id="dr-path"></bdo></code><button type="button" class="icon-btn sm" data-dact="copy" id="dr-copy" aria-label="Copy path">${ICON.copy}</button></div>`
}

function barHtml(item) {
  const finder = '<button type="button" class="btn" data-dact="finder">Reveal in Finder</button>'
  const editor = '<button type="button" class="btn p" data-dact="editor">Open in editor</button>'
  let left = ''
  let right = finder + editor
  if (item.kind === 'plugin' && item.dev) {
    left = ''
  } else if (item.kind === 'plugin') {
    left = `<button type="button" class="btn danger ghost" data-dact="uninstall">${item.missing ? 'Remove entry…' : 'Uninstall plugin…'}</button>`
    if (item.missing) right = ''
  } else if (isPluginOwned(item)) {
    if (item.kind === 'skill') {
      left = '<span class="bar-hint">Want your own version?</span>'
      right = `${finder}<button type="button" class="btn p" data-dact="fork">Copy to my skills</button>`
    }
  } else if (!item.readOnly) {
    left = '<button type="button" class="btn danger ghost" data-dact="delete">Delete…</button>'
  }
  return `<div class="bar-l">${left}</div><div class="bar-r">${right}</div>`
}

function drawerFocusAct() {
  const el = document.activeElement
  if (!el || !$('dr').contains(el) || ($('dr-body').contains(el) && !$('dr-status')?.contains(el))) return null
  return el.dataset?.dact ?? null
}

export function syncDrawerHead() {
  if (!drawerOpen()) return
  const item = drawerItem()
  if (!item) return forceClose()
  const focused = drawerFocusAct()
  $('dr').dataset.kind = item.kind
  $('dr-icon').innerHTML = kindIcon(item.kind)
  $('dr-name').textContent = drawerName(item)
  $('dr-meta').innerHTML = drawerMetaHtml(item)
  $('dr-tools').innerHTML = headTools(item)
  if ($('dr-desc')) $('dr-desc').textContent = item.description || 'No description.'
  if ($('dr-status')) $('dr-status').innerHTML = noteHtml(item)
  $('dr-facts').innerHTML = pathHtml()
  $('dr-bar').innerHTML = barHtml(item)
  if (focused)
    document
      .querySelector(
        `#dr .dr-top [data-dact="${focused}"], #dr-status [data-dact="${focused}"], #dr .dr-bar [data-dact="${focused}"]`
      )
      ?.focus()
  if (item.kind !== 'plugin' && item.path !== dr.mainFile) {
    const wasMain = dr.file === dr.mainFile
    dr.mainFile = item.path
    if (wasMain) dr.file = item.path
  }
  showPath()
}

export function closeDrawerMenu(refocus) {
  if (!dr.menu) return
  dr.menu = false
  syncDrawerHead()
  if (refocus) $('dr-menu-btn')?.focus()
}

export function showPath() {
  const box = $('dr-path')
  if (!box) return
  box.textContent = dr.file ? tilde(dr.file) : dr.root ? tilde(dr.root) : ''
  box.parentElement.title = box.textContent
}

function openerKey(item) {
  const el = document.activeElement
  if (el && $('dr').contains(el) && dr.opener) return dr.opener
  const usable = el && el !== document.body && !$('dr').contains(el)
  return { key: (usable && cardKey(el)) || item.key, el: usable ? el : null }
}

export function openDrawer(item) {
  dr.opener = openerKey(item)
  dr.key = item.key
  dr.kind = item.kind
  dr.seq++
  dr.menu = false
  dr.dir = null
  dr.loaded = ''
  dr.editable = false
  if (item.kind === 'plugin') {
    dr.mainFile = null
    dr.root = item.path
    dr.file = null
    dr.tab = 'overview'
    $('dr-body').innerHTML = pluginBodyHtml(item)
  } else if (item.kind === 'hook' || item.kind === 'mcp') {
    dr.mainFile = item.path
    dr.root = null
    dr.file = item.path
    dr.tab = 'json'
    $('dr-body').innerHTML = jsonBodyHtml(item)
  } else {
    dr.mainFile = item.path
    dr.root = isFolderSkill(item) ? parentDir(item.path) : null
    dr.file = item.path
    dr.tab = 'preview'
    $('dr-body').innerHTML = fileBodyHtml(item, isFolderSkill(item))
  }
  const txt = $('dr-txt')
  if (txt) {
    txt.addEventListener('input', onEditorInput)
    txt.addEventListener('scroll', () => {
      if ($('dr-hl')) $('dr-hl').scrollTop = txt.scrollTop
    })
  }
  const box = $('dr')
  box.classList.add('open')
  box.setAttribute('aria-hidden', 'false')
  box.inert = false
  document.querySelector('.app').inert = true
  $('dr-scrim').hidden = false
  syncDrawerHead()
  setTab(dr.tab)
  if (item.kind !== 'plugin' && item.kind !== 'hook' && item.kind !== 'mcp') loadFile(item.path, { main: true })
  $('dr-close').focus()
}

function forceClose() {
  const box = $('dr')
  if (!box.classList.contains('open')) return
  box.classList.remove('open')
  box.setAttribute('aria-hidden', 'true')
  box.inert = true
  document.querySelector('.app').inert = false
  $('dr-scrim').hidden = true
  dr.seq++
  dr.key = null
  dr.menu = false
  const opener = dr.opener
  dr.opener = null
  let target = null
  if (opener?.key) {
    const page = document.querySelector('.page:not([hidden])')
    const holder = [...(page?.querySelectorAll(HOLDER) ?? [])].find((h) => holderKey(h) === opener.key)
    target = holder?.querySelector('[data-act="open"]') ?? null
  }
  if (!target && opener?.el && document.contains(opener.el)) target = opener.el
  ;(target ?? $('title')).focus()
}

export async function closeDrawer() {
  if (!drawerOpen()) return
  if (isDirty()) {
    const discard = await ask({
      title: 'Discard changes?',
      message: `You have unsaved edits in ${baseName(dr.file)}. Close and lose them?`,
      ok: 'Discard',
      danger: true
    })
    if (!discard) return
  }
  forceClose()
}

async function confirmLeaveFile() {
  if (!isDirty()) return true
  return ask({
    title: 'Discard changes?',
    message: `You have unsaved edits in ${baseName(dr.file)}. Open another file and lose them?`,
    ok: 'Discard',
    danger: true
  })
}

export function saveFile() {
  return guarded('save', async () => {
    if (!dr.editable || !isDirty()) return
    const file = dr.file
    const seq = dr.seq
    const sent = $('dr-txt').value
    try {
      const res = await send('PUT', '/api/file', { path: file, content: sent, stamp: dr.stamp ?? null })
      if (seq === dr.seq && dr.file === file) {
        dr.loaded = res.content
        dr.stamp = res.stamp
        if ($('dr-txt').value === sent) $('dr-txt').value = res.content
        updateDirty()
        if (dr.tab === 'backups') loadBackups()
      }
      toast('Saved · backup written')
      await refresh().catch(() => {})
    } catch (err) {
      if (err.status === 409) {
        toast(`Not saved: ${baseName(file)} changed on disk. Reload it before you save.`, true)
        if (await askReload(file)) {
          if (seq === dr.seq && dr.file === file) await loadFile(file, { main: file === dr.mainFile })
        }
        return
      }
      toast(`Could not save ${baseName(file)}: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

function openIn(app) {
  const file = dr.file ?? dr.root
  return guarded(`open-${app}`, async () => {
    try {
      await send('POST', '/api/open', { path: file, app })
      toast(app === 'editor' ? `Opened ${tilde(file)} in your editor` : `Revealed ${tilde(file)} in Finder`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

async function copyPath() {
  const text = dr.file ?? dr.root ?? ''
  try {
    await navigator.clipboard.writeText(text)
    toast('Path copied')
  } catch {
    const range = document.createRange()
    range.selectNodeContents($('dr-path'))
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    toast('Path selected · press Cmd+C to copy')
  }
}

function deleteItem() {
  const item = drawerItem()
  if (!item || item.readOnly || item.kind === 'plugin') return
  const target = isFolderSkill(item) ? parentDir(item.path) : item.path
  return guarded('delete', async () => {
    const yes = await ask({
      title: `Delete ${item.kind} ${item.name}?`,
      message: `${tilde(target)} moves to ~/.claude/backups/storehouse/trash. You can move it back from there.`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('DELETE', '/api/file', { path: target })
      forceClose()
      toast(`Moved to ${tilde(res.trashPath ?? 'trash')}`)
      await refresh().catch(() => {})
      if (!document.activeElement || document.activeElement === document.body) $('title').focus()
    } catch (err) {
      toast(`Could not delete ${item.name}: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

function forkItem() {
  const item = drawerItem()
  if (!item || item.kind !== 'skill' || item.scope !== 'plugin') return
  const name = baseName(parentDir(item.path))
  return guarded('fork', async () => {
    try {
      const res = await send('POST', '/api/fork', { name, plugin: item.plugin })
      toast(`Copied to ${tilde(res.path)}`)
      await refresh().catch(() => {})
    } catch (err) {
      if (err.status === 409) toast(`${name} already exists in ~/.claude/skills. Open it from the Skills page.`, true)
      else toast(`Could not copy ${name}: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

function restoreBackupFile(backup) {
  const file = dr.file
  return guarded('restore', async () => {
    const yes = await ask({
      title: 'Restore this backup?',
      message: `${tilde(file)} is replaced with the backup. The current file is backed up first.${isDirty() ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Restore',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('POST', '/api/restore', { backup, path: file })
      if (dr.file === file) {
        dr.loaded = res.content
        dr.stamp = res.stamp
        $('dr-txt').value = res.content
        updateDirty()
        setTab('file')
        $('dr-txt').focus()
      }
      toast(`Restored ${baseName(file)} from backup`)
      await refresh().catch(() => {})
    } catch (err) {
      toast(`Could not restore: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

export async function onDrawerClick(e) {
  if (dr.menu && !e.target.closest('#dr-menu, [data-dact="menu"]')) closeDrawerMenu(false)
  const tab = e.target.closest('[data-tab]')
  if (tab) return setTab(tab.dataset.tab)
  const b = e.target.closest('[data-dact]')
  if (!b || b.disabled) return
  const act = b.dataset.dact
  const item = drawerItem()
  if (!item) return
  if (act === 'menu') {
    dr.menu = !dr.menu
    syncDrawerHead()
    if (dr.menu) $('dr-menu')?.querySelector('[role="menuitem"]')?.focus()
    return
  }
  if (act.startsWith('m-')) {
    closeDrawerMenu(true)
    if (act === 'm-toggle') return void toggle(item)
    if (act === 'm-finder') return void reveal(item)
    if (act === 'm-uninstall') return void uninstallPlugin(item)
    return
  }
  const owner = ownerPlugin(item)
  if (act === 'toggle') return void toggle(item)
  if (act === 'star') return void starItem(item, b)
  if (act === 'copy') return void copyPath()
  if (act === 'uninstall') return void uninstallPlugin(item)
  if (act === 'plugin-toggle' && owner) return void toggle(owner)
  if (act === 'plugin-uninstall' && owner) return void uninstallPlugin(owner)
  if (act === 'plugin-open' && owner) return openDrawer(owner)
  if (act === 'save') return void saveFile()
  if (act === 'fmt') return formatText(b.dataset.fmt)
  if (act === 'jump') return $(b.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (act === 'editor' || act === 'finder') return void openIn(act)
  if (act === 'delete') return void (item.kind === 'hook' || item.kind === 'mcp' ? deleteRow(item) : deleteItem())
  if (act === 'fork') return void forkItem()
  if (act === 'restore') return void restoreBackupFile(b.dataset.path)
  if (act === 'dir') return void loadDir(b.dataset.path)
  if (act === 'sub') {
    const sub = items.get(b.dataset.key)
    if (sub) openDrawer(sub)
    return
  }
  if (act === 'main' || act === 'open-file') {
    if (!(await confirmLeaveFile())) return
    const file = act === 'main' ? dr.mainFile : b.dataset.path
    setTab('file')
    await loadFile(file, { main: file === dr.mainFile })
    $('dr-txt').focus()
  }
}
