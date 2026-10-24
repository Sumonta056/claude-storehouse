import { state } from './state.js'
import { drawerOpen } from '../ui/drawer.js'

export const HOLDER = '.recent, tr[data-key], .lrow, .pnote'

export const $ = (id) => document.getElementById(id)

export function holderKey(h) {
  return h ? (h.dataset.key ?? h.dataset.fav ?? null) : null
}

export function focusMark() {
  const el = document.activeElement
  const page = el?.closest?.('.page')
  if (!el || !page) return null
  const holder = el.dataset?.act ? el.closest(HOLDER) : null
  if (holder) {
    const key = holderKey(holder)
    const same = [...page.querySelectorAll(`[data-act="${el.dataset.act}"]`)].filter(
      (b) => holderKey(b.closest(HOLDER)) === key
    )
    return {
      key,
      act: el.dataset.act,
      index: Math.max(0, same.indexOf(el)),
      pos: [...page.querySelectorAll(HOLDER)].indexOf(holder)
    }
  }
  if (el.id) return { id: el.id, start: el.selectionStart ?? null, end: el.selectionEnd ?? null, scroll: el.scrollTop }
  return null
}

export function focusRestore(mark) {
  if (!mark) return
  const page = document.querySelector('.page:not([hidden])')
  if (!page) return
  if (mark.id) {
    const el = $(mark.id)
    if (!el || el.disabled || !page.contains(el)) return
    el.focus({ preventScroll: true })
    if (mark.start !== null && typeof el.setSelectionRange === 'function') {
      try {
        el.setSelectionRange(mark.start, mark.end)
      } catch {}
    }
    if (mark.scroll) el.scrollTop = mark.scroll
    return
  }
  const same = [...page.querySelectorAll(`[data-act="${mark.act}"]`)].filter(
    (b) => holderKey(b.closest(HOLDER)) === mark.key
  )
  let target = same[mark.index] ?? same[0]
  if (!target && mark.pos >= 0) {
    const holders = [...page.querySelectorAll(HOLDER)]
    const h = holders[Math.min(mark.pos, holders.length - 1)]
    target =
      h?.querySelector(`[data-act="${mark.act}"]:not([disabled])`) ?? h?.querySelector('[data-act="open"]') ?? null
  }
  if (target) target.focus({ preventScroll: true })
}

export function toast(message, isError = false) {
  const t = $('toast')
  t.textContent = message
  t.classList.toggle('err', isError)
  t.classList.add('show')
  clearTimeout(state.toastTimer)
  state.toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 3000)
}

export function showBanner() {
  if (state.bannerDismissed || state.bannerShown) return
  state.bannerShown = true
  $('banner').hidden = false
}

export function ask({ title, message, ok = 'OK', danger = false, command = '' }) {
  if (state.confirmState) state.confirmState.done(false)
  return new Promise((resolve) => {
    const box = $('cf')
    $('cf-title').textContent = title
    $('cf-msg').textContent = message
    $('cf-cmd').textContent = command
    $('cf-cmd-box').hidden = !command
    const yes = $('cf-yes')
    yes.textContent = ok
    yes.classList.toggle('danger', danger)
    const back = document.activeElement
    const layer = drawerOpen() ? $('dr') : document.querySelector('.app')
    layer.inert = true
    box.hidden = false
    state.confirmState = {
      done(answer) {
        state.confirmState = null
        box.hidden = true
        layer.inert = false
        if (back && document.contains(back)) back.focus()
        resolve(answer)
      }
    }
    $('cf-no').focus()
  })
}

export function trapTab(e, container) {
  const nodes = [
    ...container.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')
  ].filter((el) => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0)
  if (!nodes.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  if (!container.contains(document.activeElement)) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

export function insertText(txt, text) {
  txt.focus()
  if (!document.execCommand('insertText', false, text)) {
    txt.setRangeText(text, txt.selectionStart, txt.selectionEnd, 'end')
    txt.dispatchEvent(new Event('input'))
  }
}

export async function waitFor(check) {
  for (let i = 0; i < 20 && !check(); i++) await new Promise((r) => setTimeout(r, 50))
}

export function cardKey(el) {
  return holderKey(el.closest(HOLDER))
}
