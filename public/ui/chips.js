import { render } from '../app.js'
import { toggle } from '../core/actions.js'
import { ask } from '../core/dom.js'
import { esc, plural, tok } from '../core/format.js'
import { SORTS, SORT_KEY, chipFilter, items, state } from '../core/state.js'
import { PAGES, switchable, visible } from '../logic/catalog.js'
import { CHIPS, chipCounts } from '../logic/chips.js'
import { listingTokens } from '../logic/context.js'
import { USE_WORD, isUnused, useReady } from '../logic/usage.js'

export function setSort(value) {
  state.usageSort = value
  try {
    localStorage.setItem(SORT_KEY, value)
  } catch {}
  render()
}

function sortHtml() {
  if (!useReady()) return ''
  const buttons = SORTS.map(
    ([k, text]) =>
      `<button type="button" data-usort="${k}" aria-pressed="${k === state.usageSort ? 'true' : 'false'}">${text}</button>`
  ).join('')
  return `<div class="usort"><span>Sort</span><div class="scope" role="group" aria-label="Sort by use">${buttons}</div></div>`
}

function unusedBanner(page, list) {
  const unused = list.filter((i) => visible(i) && isUnused(i))
  if (!unused.length) return ''
  const can = unused.filter((i) => i.canToggle && switchable(page, i))
  const cost = page === 'mcp' ? 0 : unused.reduce((sum, i) => sum + listingTokens(i), 0)
  const show =
    chipFilter[page] === 'unused' ? '' : '<button type="button" class="btn" data-unused="show">Show them</button>'
  const off = can.length
    ? `<button type="button" class="btn p" data-unused="off">Switch off ${can.length}</button>`
    : ''
  const typed = page === 'skills' ? ' Skills you start by typing /name do not count as use.' : ''
  return `<div class="ubanner" role="note"><p><b>${esc(`${plural(unused.length, USE_WORD[page])} had no use in 30 days.`)}</b>${cost ? ` Together they add ${esc(tok(cost))} to every session.` : ''}${typed}</p><div class="acts">${show}${off}</div></div>`
}

export async function switchOffUnused() {
  const page = state.page
  const list = { skills: state.catalog.skill, agents: state.catalog.agent, mcp: state.catalog.mcp }[page]
  if (!list) return
  const targets = list.filter((i) => visible(i) && isUnused(i) && i.canToggle && switchable(page, i))
  if (!targets.length) return
  const yes = await ask({
    title: `Switch off ${plural(targets.length, USE_WORD[page])}?`,
    message: `${targets.map((i) => i.name).join(', ')}. Claude did not call these in 30 days.${page === 'skills' ? ' Skills you start by typing /name do not count as use.' : ''} Each switch gets its own Activity entry that you can undo.`,
    ok: `Switch off ${targets.length}`
  })
  if (!yes) return
  for (const t of targets) {
    const item = items.get(t.key)
    if (item?.enabled) await toggle(item)
  }
}

export function chipsHtml(page, list, note) {
  const n = chipCounts(page, list)
  const buttons = CHIPS[page]
    .filter(([k]) => k !== 'unused' || useReady())
    .map(([k, label]) => {
      const on = chipFilter[page] === k
      const bad = (k === 'broken' || k === 'error' || k === 'unused') && n[k] ? ' bad' : ''
      return `<button type="button" class="chip${bad}" id="chip-${page}-${k}" data-chip="${k}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)} <span class="n">${n[k]}</span></button>`
    })
    .join('')
  const extra = USE_WORD[page] ? sortHtml() : ''
  const banner = USE_WORD[page] ? unusedBanner(page, list) : ''
  return `<div class="chipbar"><div class="chips" role="group" aria-label="${esc(`Filter ${PAGES[page].toLowerCase()}`)}">${buttons}</div>${extra}<p class="note">${note}</p></div>${banner}`
}
