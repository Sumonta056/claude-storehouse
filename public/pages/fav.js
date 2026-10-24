import { send } from '../api.js'
import { editFavCategory, refresh } from '../core/actions.js'
import { $, ask, toast } from '../core/dom.js'
import { esc, plural } from '../core/format.js'
import { ICON } from '../core/icons.js'
import { favOpen, state } from '../core/state.js'
import { favCats, favNameError, favoriteEntries, matches, visible } from '../logic/catalog.js'
import { loadActivity } from './activity.js'
import { render } from '../ui/nav.js'
import { empty, nothingMatches, rowHtml } from '../ui/rows.js'

function missingFavRowHtml(fav) {
  return `<li class="lrow missing" data-fav="${esc(fav.id)}" draggable="true">
    <div class="lead"><span class="lead-ic bad" role="img" aria-label="Missing">${ICON.warn}</span></div>
    <div class="body">
      <div class="l1"><span class="name">${esc(fav.name)}</span><span class="src">${esc(fav.kind)} · ${esc(fav.source)}</span><span class="flag bad">Missing</span></div>
      <p class="desc">This ${esc(fav.kind)} is no longer on disk.</p>
    </div>
    <div class="tail"><button type="button" class="btn danger" data-act="unfav">Remove</button></div>
  </li>`
}

function favHeadHtml(cat, label, count, open, index) {
  if (cat !== null && state.favEditing === cat) {
    return `<form class="fav-edit" data-form="cat-rename" data-cat="${esc(cat)}">
      <input type="text" id="fav-rename" name="n" value="${esc(state.favRenameValue)}" maxlength="40" required aria-label="${esc(`New name for ${cat}`)}">
      <button type="submit" class="btn p">Rename</button>
      <button type="button" class="btn ghost" data-fc="cancel">Cancel</button>
    </form>`
  }
  const tools =
    cat === null
      ? ''
      : `<span class="fav-tools"><button type="button" class="icon-btn" data-fc="rename" data-cat="${esc(cat)}" aria-label="${esc(`Rename category ${cat}`)}">${ICON.pen}</button><button type="button" class="icon-btn del" data-fc="delete" data-cat="${esc(cat)}" aria-label="${esc(`Delete category ${cat}`)}">${ICON.bin}</button></span>`
  return `<button type="button" class="fav-tog${cat === null ? ' uncat' : ''}" data-fc="collapse" data-cat="${esc(cat ?? '')}" aria-expanded="${open}" aria-controls="favsec-${index}">${ICON.chev}<span class="fav-name">${esc(label)}</span><span class="pill">${count}</span></button>${tools}`
}

function favSectionHtml(cat, list, index) {
  const label = cat ?? 'Uncategorized'
  const open = favOpen.get(cat ?? '') !== false
  const rows = list
    .map((e) => (e.item ? rowHtml(e.item, 'fav', { draggable: true }) : missingFavRowHtml(e.fav)))
    .join('')
  const body = list.length
    ? `<ul class="rows" data-rows="fav">${rows}</ul>`
    : `<div class="empty fav-drop">No favorites here. Drag a row here, or pick ${esc(label)} from a star.</div>`
  return `<section class="fav-sec" data-cat="${esc(cat ?? '')}" aria-label="${esc(label)}">
    <div class="fav-h">${favHeadHtml(cat, label, list.length, open, index)}</div>
    <div id="favsec-${index}"${open ? '' : ' hidden'}>${body}</div>
  </section>`
}

export function renderFav() {
  const cats = favCats()
  const entries = favoriteEntries()
  const shown = entries.filter((e) => (e.item ? visible(e.item) : matches({ name: e.fav.name, source: e.fav.source })))
  const groups = [
    ...cats.map((c) => [c, shown.filter((e) => e.fav.category === c)]),
    [null, shown.filter((e) => e.fav.category === null)]
  ]
  const top = `<div class="fav-top">
    <div class="warn">Favorites and categories live in <code>~/.claude/storehouse.json</code>. They do not change Claude Code. Drag a row to reorder it or to move it to another category.</div>
    <form class="fav-new" data-form="cat-new">
      <input type="text" id="fav-newcat" name="n" value="${esc(state.favNewName)}" maxlength="40" placeholder="New category" aria-label="New category name">
      <button type="submit" class="btn p">Add category</button>
    </form>
  </div>`
  let body
  if (!entries.length && !cats.length) body = empty('No favorites yet. Click the star on any row and pick a category.')
  else if (state.query) {
    const hits = groups.map((g, i) => [...g, i]).filter(([, list]) => list.length)
    body = hits.length ? hits.map(([c, list, i]) => favSectionHtml(c, list, i)).join('') : nothingMatches()
  } else body = groups.map(([c, list], i) => favSectionHtml(c, list, i)).join('')
  $('p-fav').innerHTML = top + body
}

function focusFavTool(cat, tool) {
  document.querySelector(`#p-fav [data-fc="${tool}"][data-cat="${CSS.escape(cat)}"]`)?.focus({ preventScroll: true })
}

function startRename(cat) {
  state.favEditing = cat
  state.favRenameValue = cat
  render()
  const input = $('fav-rename')
  input?.focus()
  input?.select()
}

export function cancelRename() {
  const cat = state.favEditing
  state.favEditing = null
  render()
  if (cat !== null) focusFavTool(cat, 'rename')
}

export async function onFavCat(el) {
  const act = el.dataset.fc
  const cat = el.dataset.cat ?? ''
  if (act === 'collapse') {
    favOpen.set(cat, el.getAttribute('aria-expanded') !== 'true')
    render()
    return focusFavTool(cat, 'collapse')
  }
  if (act === 'rename') return startRename(cat)
  if (act === 'cancel') return cancelRename()
  if (act === 'delete') {
    const n = state.inventory.favorites.filter((f) => f.category === cat).length
    const yes = await ask({
      title: `Delete category ${cat}?`,
      message: n
        ? `Its ${plural(n, 'favorite')} move to Uncategorized. They stay favorites. You can undo this from the activity log.`
        : 'This category is empty.',
      ok: 'Delete',
      danger: true
    })
    if (yes) await editFavCategory({ op: 'delete', name: cat }, `Deleted category ${cat}`)
  }
}

export async function submitNewCat() {
  const name = state.favNewName.trim()
  const error = favNameError(name)
  if (error) return toast(error, true)
  if (favCats().some((c) => c.toLowerCase() === name.toLowerCase()))
    return toast(`Category ${name} already exists.`, true)
  if (await editFavCategory({ op: 'create', name }, `Added category ${name}`)) {
    state.favNewName = ''
    render()
    $('fav-newcat')?.focus()
  }
}

export async function submitRename(form) {
  const old = form.dataset.cat
  const name = state.favRenameValue.trim()
  if (name === old) return cancelRename()
  const error = favNameError(name)
  if (error) return toast(error, true)
  state.favEditing = null
  if (await editFavCategory({ op: 'rename', name: old, newName: name }, `Renamed ${old} to ${name}`))
    return focusFavTool(name, 'rename')
  state.favEditing = old
  render()
  $('fav-rename')?.focus()
}

export function placeFav(fromKey, cat, toKey, after) {
  const favs = state.inventory.favorites
  const from = favs.find((f) => f.id === fromKey)
  if (!from || toKey === fromKey) return null
  const ids = favs.map((f) => f.id).filter((id) => id !== fromKey)
  const target = toKey ? ids.indexOf(toKey) : -1
  let at = ids.length
  if (target >= 0) at = target + (after ? 1 : 0)
  else {
    const last = favs.filter((f) => f.id !== fromKey && f.category === cat).at(-1)
    if (last) at = ids.indexOf(last.id) + 1
  }
  ids.splice(at, 0, fromKey)
  const move = from.category === cat ? undefined : { id: fromKey, category: cat }
  if (!move && ids.every((id, i) => id === favs[i].id)) return null
  return { ids, move }
}

export async function saveOrder({ ids, move }) {
  const byId = new Map(state.inventory.favorites.map((f) => [f.id, f]))
  state.inventory.favorites = ids
    .map((id) => byId.get(id))
    .map((f) => (move && f.id === move.id ? { ...f, category: move.category } : f))
  render()
  try {
    await send('PUT', '/api/favorites/order', move ? { ids, move } : { ids })
    toast(
      move
        ? `Moved ${byId.get(move.id).name} to ${move.category ?? 'Uncategorized'} · ~/.claude/storehouse.json`
        : 'Saved order · ~/.claude/storehouse.json'
    )
  } catch (err) {
    toast(`Could not save order: ${err.message}`, true)
  }
  await refresh().catch(() => {})
  loadActivity()
}
