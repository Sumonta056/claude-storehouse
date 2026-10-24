import { star, toggle } from '../core/actions.js'
import { $, toast, trapTab } from '../core/dom.js'
import { esc } from '../core/format.js'
import { ICON, kindIcon } from '../core/icons.js'
import { PALETTE_KEY, chipFilter, state } from '../core/state.js'
import { KIND_WORD, PAGES, favBody, favOf, projectOn, switchInfo } from '../logic/catalog.js'
import { paletteResults } from '../logic/palette.js'
import { DEFAULT_COMBO, comboFromKey, comboLabel, comboProblem, matchCombo } from '../logic/shortcut.js'
import { closeDrawer, drawerOpen, isDirty, openDrawer } from './drawer.js'
import { go, render } from './nav.js'

export const IS_MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')

function option(i, sel, inner) {
  return `<li role="option" id="pal-opt-${i}" class="it${i === sel ? ' sel' : ''}" data-i="${i}" aria-selected="${i === sel}">${inner}</li>`
}

function itemInner(item) {
  const info = switchInfo(item)
  const sub = info.disabled && info.text ? info.text : `${KIND_WORD[item.kind] ?? item.kind} · ${item.scope}`
  const fav = favOf(item) ? '<span class="pal-star" aria-label="favorite">★</span>' : ''
  const on = item.enabled ? 'on' : 'off'
  return `<span class="ki">${kindIcon(item.kind, 18)}</span><span class="nm">${esc(item.name)}</span><span class="sb">${esc(sub)}</span><span class="rt">${fav}<span class="tag ${on}">${on}</span></span>`
}

function pageInner(page) {
  return `<span class="ki">${kindIcon('file', 18)}</span><span class="nm">${esc(page.title)}</span><span class="sb">Go to page</span>`
}

function actionInner(action) {
  return `<span class="ki">${ICON.chev}</span><span class="nm">${esc(action.label)}</span>`
}

export function paletteListHtml(results, sel) {
  let i = 0
  const group = (title, list, inner) =>
    list.length
      ? `<li role="presentation" class="grp-h">${title}</li>${list.map((v) => option(i++, sel, inner(v))).join('')}`
      : ''
  const html =
    group('Items', results.items, itemInner) +
    group('Pages', results.pages, pageInner) +
    group('Actions', results.actions, actionInner)
  return html || '<li role="presentation" class="cmdk-none">No match. Try fewer letters.</li>'
}

export function paletteFootHtml(combo, isMac, recording) {
  const kbd = (text) => `<kbd class="kbd">${esc(text)}</kbd>`
  const keys = `<span>${kbd('↑')} ${kbd('↓')} move</span><span>${kbd('↵')} open</span><span>${kbd(isMac ? '⌘↵' : 'Ctrl+↵')} switch</span><span>${kbd(isMac ? '⇧↵' : 'Shift+↵')} star</span>`
  const short = recording
    ? '<span class="pal-rec" tabindex="-1">Press the new shortcut. Esc cancels.</span>'
    : `<span>Open with ${kbd(comboLabel(combo, isMac))}</span><button type="button" class="btn-link" data-pal="change">Change</button><button type="button" class="btn-link" data-pal="reset"${combo === DEFAULT_COMBO ? ' disabled' : ''}>Reset</button>`
  return `<div class="ft-keys">${keys}</div><div class="ft-short">${short}</div>`
}

function actions() {
  const list = [
    { id: 'scope-all', label: 'Scope: All' },
    { id: 'scope-global', label: 'Scope: Global' }
  ]
  if (projectOn()) list.push({ id: 'scope-project', label: 'Scope: Project' })
  list.push({ id: 'dups-needs', label: 'Show Duplicates conflicts' })
  return list
}

function sources() {
  const c = state.catalog
  return {
    items: [...c.skill, ...c.agent, ...c.plugin, ...c.hook, ...c.mcp],
    pages: Object.entries(PAGES).map(([key, title]) => ({ key, title })),
    actions: actions(),
    recent: state.paletteRecent
  }
}

function say(text) {
  $('pal-msg').textContent = text
}

function draw() {
  const p = state.palette
  const r = paletteResults(p.query, sources())
  p.flat = [
    ...r.items.map((v) => ({ type: 'item', v })),
    ...r.pages.map((v) => ({ type: 'page', v })),
    ...r.actions.map((v) => ({ type: 'action', v }))
  ]
  p.sel = Math.min(p.sel, Math.max(0, p.flat.length - 1))
  $('pal-list').innerHTML = paletteListHtml(r, p.sel)
  $('pal-q').setAttribute('aria-activedescendant', p.flat.length ? `pal-opt-${p.sel}` : '')
  $('pal-list').querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
}

function drawFoot() {
  $('pal-ft').innerHTML = paletteFootHtml(state.paletteKey, IS_MAC, Boolean(state.palette?.recording))
}

function syncChip() {
  $('pal-key').textContent = comboLabel(state.paletteKey, IS_MAC)
}

function cover() {
  document.querySelector('.app').inert = true
  $('dr').inert = true
}

export function openPalette() {
  if (state.palette || !state.inventory) return
  cover()
  state.palette = { back: document.activeElement, query: '', sel: 0, flat: [], recording: false }
  $('pal').hidden = false
  $('pal-q').value = ''
  say('')
  draw()
  drawFoot()
  $('pal-q').focus()
}

export function closePalette(refocus = true) {
  const p = state.palette
  if (!p) return
  state.palette = null
  $('pal').hidden = true
  const open = drawerOpen()
  document.querySelector('.app').inert = open
  $('dr').inert = !open
  if (!refocus) return
  const back = p.back && document.contains(p.back) && !p.back.closest?.('[inert]') ? p.back : null
  ;(back ?? (open ? $('dr-close') : $('title')))?.focus({ preventScroll: true })
}

function runAction(id) {
  if (id.startsWith('scope-')) {
    state.scope = id.slice(6)
    return render()
  }
  if (id === 'dups-needs') {
    chipFilter.dups = 'needs'
    go('dups')
  }
}

async function choose(mode) {
  const p = state.palette
  const entry = p.flat[p.sel]
  if (!entry) return
  if (entry.type !== 'item') {
    closePalette()
    await closeDrawer()
    if (drawerOpen()) return
    return entry.type === 'page' ? go(entry.v.key) : runAction(entry.v.id)
  }
  const item = entry.v
  if (mode === 'open') {
    closePalette()
    return openDrawer(item)
  }
  if (mode === 'toggle') {
    if (!item.canToggle) return say(switchInfo(item).title ?? `${item.name} has no switch here.`)
    say('')
    await toggle(item)
  } else {
    const fav = favOf(item)
    await star(favBody(item, !fav), `${fav ? 'Unstarred' : 'Starred'} ${item.name}`)
  }
  if (!state.palette) return
  cover()
  draw()
  $('pal-q').focus()
}

function saveKey(combo) {
  state.paletteKey = combo
  try {
    if (combo === DEFAULT_COMBO) localStorage.removeItem(PALETTE_KEY)
    else localStorage.setItem(PALETTE_KEY, combo)
  } catch {}
  syncChip()
}

function endRecord(message) {
  state.palette.recording = false
  drawFoot()
  say(message)
  $('pal-q').focus()
}

function record(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    return endRecord('')
  }
  const combo = comboFromKey(e, IS_MAC)
  if (!combo) return
  e.preventDefault()
  const problem = comboProblem(combo)
  if (problem) return say(`${comboLabel(combo, IS_MAC)}: ${problem}`)
  saveKey(combo)
  endRecord(`The palette now opens with ${comboLabel(combo, IS_MAC)}.`)
}

function onFoot(e) {
  const act = e.target.closest('[data-pal]')?.dataset.pal
  if (act === 'change') {
    state.palette.recording = true
    drawFoot()
    say('')
    $('pal-ft').querySelector('.pal-rec')?.focus()
  } else if (act === 'reset') {
    saveKey(DEFAULT_COMBO)
    endRecord(`The palette opens with ${comboLabel(DEFAULT_COMBO, IS_MAC)} again.`)
  }
}

export function onPaletteKey(e) {
  const p = state.palette
  if (!p) {
    if (e.isComposing || !matchCombo(state.paletteKey, e, IS_MAC)) return false
    e.preventDefault()
    if (isDirty()) toast('Save or discard your unsaved edits first, then open the palette.')
    else openPalette()
    return true
  }
  if (e.isComposing) return true
  if (p.recording) {
    record(e)
    return true
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
  if (e.key === 'Escape' || matchCombo(state.paletteKey, e, IS_MAC)) {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'Tab') trapTab(e, $('pal'))
  else if (step) {
    e.preventDefault()
    if (p.flat.length) {
      p.sel = (p.sel + step + p.flat.length) % p.flat.length
      draw()
    }
  } else if (e.key === 'Enter' && document.activeElement?.id === 'pal-q') {
    e.preventDefault()
    choose((IS_MAC ? e.metaKey : e.ctrlKey) ? 'toggle' : e.shiftKey ? 'star' : 'open')
  }
  return true
}

export function wirePalette() {
  syncChip()
  $('pal-open').addEventListener('click', () => openPalette())
  $('pal-scrim').addEventListener('click', () => closePalette())
  $('pal-q').addEventListener('input', (e) => {
    state.palette.query = e.target.value
    state.palette.sel = 0
    say('')
    draw()
  })
  $('pal-list').addEventListener('mousedown', (e) => e.preventDefault())
  $('pal-list').addEventListener('click', (e) => {
    const opt = e.target.closest('[data-i]')
    if (!opt) return
    state.palette.sel = Number(opt.dataset.i)
    choose('open')
  })
  $('pal-ft').addEventListener('click', onFoot)
}
