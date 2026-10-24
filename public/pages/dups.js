import { toggle } from '../core/actions.js'
import { $ } from '../core/dom.js'
import { esc, plural, slug } from '../core/format.js'
import { ICON } from '../core/icons.js'
import { chipFilter, groupOpen, items } from '../core/state.js'
import { pluginLabel, visible } from '../logic/catalog.js'
import { DUP_KINDS, duplicateGroups, needsAction, onCount } from '../logic/duplicates.js'
import { chipsHtml } from '../ui/chips.js'
import { empty, nothingMatches, rowHtml } from '../ui/rows.js'

function dupGroupHtml(g) {
  const word = new Map(DUP_KINDS).get(g.kind)
  const on = onCount(g)
  const bad = on > 1
  const gk = `dup:${g.key}`
  const open = groupOpen.has(gk) ? groupOpen.get(gk) : bad
  const panel = `gp-dup-${slug(g.key)}`
  const first = g.items[0].description
  const notes = []
  if (bad)
    notes.push(
      `Claude Code sees ${on} ${word}s named <code>${esc(g.name)}</code>. Switch off the ones you do not want.`
    )
  if (first && g.items.every((i) => i.description === first))
    notes.push(`<b>Same description.</b> One ${word} looks like a copy of the other.`)
  for (const i of g.items.filter((i) => bad && i.enabled && !i.canToggle && i.plugin))
    notes.push(
      `<code>${esc(i.name)}</code> follows the plugin <b>${esc(pluginLabel(i.plugin))}</b>. Switch the plugin off on the Plugins page, or keep it.`
    )
  const rows = g.items
    .map((i) => rowHtml(i, 'dups', { keep: i.enabled && g.items.some((o) => o !== i && o.enabled && o.canToggle) }))
    .join('')
  const pill = bad
    ? `<span class="gstate bad">Conflict · ${on} on</span>`
    : `<span class="gstate ok">OK · ${on} on</span>`
  return `<div class="pgroup">
    <h3 class="ghead"><button type="button" class="gbtn" id="gb-dup-${slug(g.key)}" data-group="${esc(gk)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panel}">${ICON.chev}<span class="gname">${esc(g.name)}</span><span class="gcount">${esc(plural(g.items.length, word))}</span>${pill}</button></h3>
    <div class="gbody" id="${panel}"${open ? '' : ' hidden'}>${open ? `<ul class="rows" data-rows="dups">${rows}</ul>${notes.map((n) => `<p class="dnote">${n}</p>`).join('')}` : ''}</div>
  </div>`
}

export function renderDups() {
  const found = duplicateGroups()
  const all = found.filter((g) => g.items.some(visible))
  const shown = all.filter((g) => chipFilter.dups === 'all' || needsAction(g))
  const note =
    'Skills, agents, or MCP servers of one type that use the same name. Claude Code loads each one that is on. A group needs action when more than one item in it is on.'
  let body
  if (shown.length)
    body = `<h2>Same name <span class="pill">${shown.length}</span><span class="hint">Conflict groups open first.</span></h2><div class="groups">${shown.map(dupGroupHtml).join('')}</div>`
  else if (!found.length) body = empty('No duplicates. Each skill, agent, and MCP server has its own name.')
  else if (all.length) body = empty('No group needs action. In each group, only one item is on.')
  else body = nothingMatches()
  $('p-dups').innerHTML = chipsHtml('dups', all, note) + body
}

export async function keepOnly(item) {
  const group = duplicateGroups().find((g) => g.items.includes(item))
  const keys = group ? group.items.filter((i) => i !== item && i.enabled && i.canToggle).map((i) => i.key) : []
  for (const key of keys) {
    const other = items.get(key)
    if (other?.enabled) await toggle(other)
  }
}
