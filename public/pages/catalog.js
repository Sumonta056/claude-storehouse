import { $ } from '../core/dom.js'
import { esc, plural, slug } from '../core/format.js'
import { ICON } from '../core/icons.js'
import { chipFilter, groupOpen, state } from '../core/state.js'
import { visible } from '../logic/catalog.js'
import { keepChip } from '../logic/chips.js'
import { sortRows } from '../logic/usage.js'
import { chipsHtml } from '../ui/chips.js'
import { empty, nothingMatches, rowsHtml } from '../ui/rows.js'

const SECTIONS = {
  plugins: [
    ['global', 'Global · installed for your user', ''],
    ['project', 'Project · installed for this folder', '']
  ],
  mods: [
    ['global', 'Global · installed for your user', ''],
    ['project', 'Project · installed for this folder', ''],
    ['dev', 'Development · ~/.claude/dev-mods', 'Read-only. These mods have no switch.']
  ],
  skills: [
    ['global', 'Global · ~/.claude/skills', 'The switch writes skillOverrides in ~/.claude/settings.json'],
    ['project', 'Project · ./.claude/skills', 'The switch writes .claude/settings.local.json']
  ],
  agents: [
    ['global', 'Global · ~/.claude/agents', 'Off renames name.md to name.md.disabled'],
    ['project', 'Project · ./.claude/agents', 'Off renames name.md to name.md.disabled']
  ]
}

function pluginGroupsHtml(page, list) {
  const kind = page === 'skills' ? 'skill' : 'agent'
  const shown = list.filter((i) => i.scope === 'plugin' && visible(i) && keepChip(page, i))
  if (!shown.length) return ''
  const byPlugin = new Map()
  for (const i of shown) {
    const id = i.plugin ?? i.source
    if (!byPlugin.has(id)) byPlugin.set(id, [])
    byPlugin.get(id).push(i)
  }
  const body = [...byPlugin]
    .map(([id, rows]) => {
      const plugin = state.catalog.plugin.find((p) => p.id === id)
      const gk = `${kind}:${id}`
      const open = groupOpen.has(gk) ? groupOpen.get(gk) : Boolean(state.query.trim())
      const name = plugin?.name ?? id
      const panel = `gp-${kind}-${slug(id)}`
      const stateText = plugin?.enabled ? 'Plugin on' : 'Plugin off'
      const notice = plugin
        ? `<div class="pnote" role="note" data-key="${esc(plugin.key)}">${ICON.lock}<span class="pnote-t">These ${kind}s are part of the plugin <b>${esc(name)}</b>. You cannot delete or switch them one by one.</span><span class="pnote-a"><button type="button" class="btn" data-act="toggle">${plugin.enabled ? 'Switch off plugin' : 'Switch on plugin'}</button><button type="button" class="btn danger" data-act="uninstall">Uninstall plugin…</button></span></div>`
        : ''
      return `<div class="pgroup${plugin?.enabled ? '' : ' off'}">
        <h3 class="ghead"><button type="button" class="gbtn" id="gb-${kind}-${slug(id)}" data-group="${esc(gk)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panel}">${ICON.chev}<span class="gname">${esc(name)}</span><span class="gcount">${esc(plural(rows.length, kind))}</span><span class="gstate${plugin?.enabled ? ' on' : ''}">${stateText}</span></button></h3>
        <div class="gbody" id="${panel}"${open ? '' : ' hidden'}>${open ? notice + rowsHtml(sortRows(rows)) : ''}</div>
      </div>`
    })
    .join('')
  return `<h2>From plugins <span class="pill">${shown.length}</span><span class="hint">Grouped by plugin. These ${kind}s follow their plugin switch.</span></h2><div class="groups">${body}</div>`
}

function catalogBody(page, list) {
  if (!list.length) return empty(`No ${page} found in ~/.claude or ./.claude.`)
  const own = SECTIONS[page]
    .map(([scope, title, hint]) => {
      const shown = list.filter((i) => i.scope === scope && visible(i) && keepChip(page, i))
      if (!shown.length) return ''
      return `<h2>${esc(title)} <span class="pill">${shown.length}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</h2>${rowsHtml(sortRows(shown))}`
    })
    .join('')
  const html = own + (page === 'plugins' || page === 'mods' ? '' : pluginGroupsHtml(page, list))
  if (html) return html
  if (chipFilter[page] !== 'all' && list.some(visible)) return empty(`No ${page} match this filter.`)
  return nothingMatches()
}

export function renderCatalog(page, list, note) {
  $(`p-${page}`).innerHTML = chipsHtml(page, list, note) + catalogBody(page, list)
}
