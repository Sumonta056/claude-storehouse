import { HOLDER, holderKey } from '../core/dom.js'
import { state } from '../core/state.js'
import { render } from './nav.js'

function menuButtonFor(key) {
  const page = document.querySelector('.page:not([hidden])')
  return page
    ? ([...page.querySelectorAll('[data-act="menu"]')].find(
        (b) => holderKey(b.closest(HOLDER)) === key && (b.closest('[data-rows]')?.dataset.rows ?? '') === state.menuCtx
      ) ?? null)
    : null
}

export function closeMenu(refocus = true) {
  if (!state.menuKey) return
  const btn = refocus ? menuButtonFor(state.menuKey) : null
  state.menuKey = null
  if (btn) btn.focus({ preventScroll: true })
  render()
}

export function openMenu(key, ctx = '') {
  state.menuKey = state.menuKey === key && state.menuCtx === ctx ? null : key
  state.menuCtx = ctx
  render()
  if (state.menuKey)
    document.querySelector('.page:not([hidden]) .menu [role="menuitem"]')?.focus({ preventScroll: true })
}

export function menuKeys(e) {
  const menu = document.activeElement?.closest?.('.menu')
  if (!menu) return false
  const list = [...menu.querySelectorAll('[role="menuitem"]')]
  const at = list.indexOf(document.activeElement)
  let next = null
  if (e.key === 'ArrowDown') next = list[(at + 1) % list.length]
  else if (e.key === 'ArrowUp') next = list[(at - 1 + list.length) % list.length]
  else if (e.key === 'Home') next = list[0]
  else if (e.key === 'End') next = list[list.length - 1]
  if (!next) return false
  e.preventDefault()
  next.focus()
  return true
}
