import { drawerOpen } from '../app.js'
import { star } from '../core/actions.js'
import { $, HOLDER, holderKey } from '../core/dom.js'
import { esc } from '../core/format.js'
import { state } from '../core/state.js'
import { favBody, favNameError, favOf, favPopOptions, itemLabel } from '../logic/catalog.js'

function favPopListHtml() {
  const { options, active, current } = state.favPop
  return options
    .map((o, i) => {
      const cls = ['fp-opt', i === active ? 'active' : '', o.create ? 'create' : ''].filter(Boolean).join(' ')
      const text = o.create ? `+ Create "${o.create}"` : o.label
      const cur = !o.create && o.value === current ? '<span class="fp-cur" aria-label="current">✓</span>' : ''
      return `<li role="option" id="fp-opt-${i}" class="${cls}" data-i="${i}" aria-selected="${i === active}"><span>${esc(text)}</span>${cur}</li>`
    })
    .join('')
}

function favPopHtml(item, fav) {
  return `<form data-form="favpop">
    <h3 id="favpop-t">${fav ? 'Change category' : 'Add to favorites'}</h3>
    <p class="sub">${esc(itemLabel(item))}</p>
    <input type="text" name="newcat" maxlength="40" placeholder="Search or create a category" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="favpop-list" aria-label="Category">
    <ul class="fp-list" id="favpop-list" role="listbox" aria-label="Categories"></ul>
    <p class="err" role="alert" hidden></p>
    <div class="bar">${fav ? '<button type="button" class="btn danger ghost" data-pop="remove">Remove</button>' : '<button type="button" class="btn ghost" data-pop="cancel">Cancel</button>'}<button type="submit" class="btn p">Save</button></div>
  </form>`
}

function drawFavPopList() {
  const { el, options, active } = state.favPop
  el.querySelector('.fp-list').innerHTML = favPopListHtml()
  el.querySelector('input[name="newcat"]').setAttribute(
    'aria-activedescendant',
    options.length ? `fp-opt-${active}` : ''
  )
  el.querySelector(`#fp-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
}

function filterFavPop(query) {
  const options = favPopOptions(query)
  const q = query.trim().toLowerCase()
  const exact = options.findIndex((o) => !o.create && o.label.toLowerCase() === q)
  const current = q ? -1 : options.findIndex((o) => o.value === state.favPop.current)
  state.favPop.options = options
  state.favPop.active = Math.max(0, exact, current)
  state.favPop.el.querySelector('.err').hidden = true
  drawFavPopList()
}

export function placeFavPop() {
  if (!state.favPop) return
  const { el, trigger } = state.favPop
  if (!trigger?.isConnected) return closeFavPop(false)
  const r = trigger.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight
  el.style.left = `${Math.max(16, Math.min(r.right - w, innerWidth - w - 16))}px`
  el.style.top = `${r.bottom + 6 + h > innerHeight - 16 ? Math.max(16, r.top - h - 6) : r.bottom + 6}px`
}

function openFavPop(item, trigger) {
  closeFavPop(false)
  const fav = favOf(item)
  const el = document.createElement('div')
  el.className = 'favpop'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-labelledby', 'favpop-t')
  el.innerHTML = favPopHtml(item, fav)
  document.body.append(el)
  state.favPop = {
    el,
    item,
    trigger,
    inDrawer: Boolean(trigger?.closest('#dr')),
    current: fav ? (fav.category ?? '') : '',
    options: [],
    active: 0
  }
  filterFavPop('')
  placeFavPop()
  const input = el.querySelector('input[name="newcat"]')
  input.focus()
  input.addEventListener('input', () => filterFavPop(input.value))
  input.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (!step || !state.favPop.options.length) return
    e.preventDefault()
    state.favPop.active = (state.favPop.active + step + state.favPop.options.length) % state.favPop.options.length
    drawFavPopList()
  })
  el.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-i]')
    if (opt) {
      state.favPop.active = Number(opt.dataset.i)
      return submitFavPop(el.querySelector('form'))
    }
    const act = e.target.closest('[data-pop]')?.dataset.pop
    if (act === 'cancel') closeFavPop()
    else if (act === 'remove') {
      closeFavPop()
      star(favBody(item, false), `Unstarred ${item.name}`)
    }
  })
  el.addEventListener('submit', (e) => {
    e.preventDefault()
    submitFavPop(e.target)
  })
}

export function closeFavPop(refocus = true) {
  if (!state.favPop) return
  const { el, item, trigger, inDrawer } = state.favPop
  state.favPop = null
  el.remove()
  if (!refocus) return
  if (trigger?.isConnected) return trigger.focus({ preventScroll: true })
  const scope = inDrawer && drawerOpen() ? $('dr') : document.querySelector('.page:not([hidden])')
  const btn = inDrawer
    ? scope?.querySelector('[data-dact="star"]')
    : [...(scope?.querySelectorAll('[data-act="star"]') ?? [])].find((b) => holderKey(b.closest(HOLDER)) === item.key)
  btn?.focus({ preventScroll: true })
}

function submitFavPop(form) {
  const { item, options, active } = state.favPop
  const choice = options[active]
  const fav = favOf(item)
  const fail = (message) => {
    const p = form.querySelector('.err')
    p.textContent = message
    p.hidden = false
    form.elements.newcat.focus()
  }
  if (!choice) return fail('Type a category name.')
  if (choice.create) {
    const error = favNameError(choice.create)
    if (error) return fail(error)
  } else if (fav && (fav.category ?? '') === choice.value) return closeFavPop()
  const category = choice.create ?? (choice.value || null)
  const label = category ?? 'Uncategorized'
  closeFavPop()
  star(favBody(item, true, category), fav ? `Moved ${item.name} to ${label}` : `Starred ${item.name} in ${label}`)
}

export function starItem(item, trigger) {
  if (state.favPop && state.favPop.item.key === item.key && state.favPop.trigger === trigger) return closeFavPop()
  openFavPop(item, trigger)
}
