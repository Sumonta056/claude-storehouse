import { esc, plural, shortVersion, slug, tok } from '../core/format.js'
import { ICON } from '../core/icons.js'
import { cfg, state } from '../core/state.js'
import { pluginById, pluginLabel, switchInfo } from '../logic/catalog.js'
import { listingTokens, tokensOf } from '../logic/context.js'
import { dupSource } from '../logic/duplicates.js'
import { USAGE_PAGES, isUnused, lastText, sharedWith, useOf } from '../logic/usage.js'

export function scopeTag(scope) {
  return `<span class="tag ${esc(scope)}">${esc(scope)}</span>`
}

export function empty(text) {
  return `<div class="empty">${esc(text)}</div>`
}

export function nothingMatches() {
  return empty(state.query ? `Nothing matches "${state.query}" in this scope.` : 'Nothing in this scope.')
}

export function useChips(item) {
  if (!USAGE_PAGES.has(state.page)) return ''
  const u = useOf(item)
  if (!u) return ''
  const unused = isUnused(item)
  const bits = []
  if (u.count30) bits.push(`<span class="mchip">Used ${u.count30}× in 30 d</span>`)
  if (u.last)
    bits.push(
      `<span class="mchip${unused ? ' warnc' : ''}" title="${esc(new Date(u.last).toLocaleString())}">last: ${esc(lastText(u.last))}</span>`
    )
  else if (unused) bits.push('<span class="mchip warnc">Never used</span>')
  const shared = u.last ? sharedWith(item) : 0
  if (shared) bits.push(`<span class="mchip">${esc(`Shared with ${plural(shared, 'item')} of this name`)}</span>`)
  return bits.join('')
}

export function useFlag(item) {
  return USAGE_PAGES.has(state.page) && isUnused(item) ? '<span class="flag bad">Unused 30 d</span>' : ''
}

export function pluginParts(id) {
  const p = pluginById(id)
  if (!p) return []
  const parts = [
    [p.skills.length, 'skill'],
    [p.agents.length, 'agent'],
    [p.hooks.length, 'hook']
  ]
    .filter(([n]) => n)
    .map(([n, w]) => plural(n, w))
  if (p.mcp.length) parts.push(`${p.mcp.length} MCP`)
  return parts
}

export function cliScope(id) {
  const s = pluginById(id)?.installScope
  return ['user', 'project', 'local'].includes(s) ? s : 'user'
}

function rowSource(item) {
  if (item.kind === 'plugin') return item.source === 'plugin' ? '' : item.source
  if (item.plugin) return ''
  return item.source === 'local' || item.source === 'project' ? '' : item.source
}

function leadHtml(item) {
  const sw = switchInfo(item)
  if (item.kind === 'plugin' && item.missing) {
    return `<span class="lead-ic bad" role="img" aria-label="Plugin folder missing" title="${esc(sw.title)}">${ICON.warn}</span>`
  }
  if (!item.canToggle) {
    return `<span class="lead-ic" role="img" aria-label="${esc(sw.title)}" title="${esc(sw.title)}">${ICON.lock}</span>`
  }
  const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
  return `<button type="button" class="sw" role="switch" data-act="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" title="${esc(sw.title)}"></button>`
}

export function menuEntries(item) {
  if (item.kind === 'plugin' && item.missing)
    return [
      ['m-open', 'Open details'],
      ['m-uninstall', 'Remove entry', true]
    ]
  const list = [['m-open', 'Open details']]
  if (item.canToggle) list.push(['m-toggle', item.enabled ? 'Switch off' : 'Switch on'])
  if (item.path) list.push(['m-finder', 'Reveal in Finder'])
  if (item.kind === 'plugin' && !item.dev) list.push(['m-uninstall', 'Uninstall plugin…', true])
  return list
}

function menuHtml(item) {
  const entries = menuEntries(item)
  const html = entries
    .map(
      ([act, text, danger]) =>
        `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-act="${act}">${esc(text)}</button>`
    )
    .join('')
  return `<div class="menu" role="menu" id="menu-${slug(item.key)}" aria-label="${esc(`More actions for ${item.name}`)}">${html}</div>`
}

function metaHtml(item) {
  if (item.kind === 'plugin' && item.modules?.length && (item.dev || state.page === 'mods')) {
    const bits = item.modules.map((m) => `<span class="mchip">${esc(m)}</span>`)
    if (item.dev) bits.push(`<span class="mchip">session ${esc(item.session.slice(0, 8))}</span>`)
    return `<p class="meta chips-s">${bits.join('')}</p>`
  }
  if (item.kind === 'plugin') {
    if (item.missing) return '<p class="meta muted">Use “Remove entry” to clean up installed_plugins.json.</p>'
    const parts = pluginParts(item.id)
    return `<p class="meta${parts.length ? '' : ' muted'}">${esc(parts.length ? parts.join(' · ') : 'No skills, agents, hooks, or MCP servers found')}</p>`
  }
  const bits = []
  if (item.kind === 'agent') {
    if (item.model) bits.push(`<span class="mchip">model: ${esc(item.model)}</span>`)
    if (item.tools?.length) bits.push(`<span class="mchip">${esc(item.tools.join(' · '))}</span>`)
  }
  const use = useChips(item)
  if (use) bits.push(use)
  return bits.length ? `<p class="meta chips-s">${bits.join('')}</p>` : ''
}

const FAV_KINDS = new Set(['skill', 'agent', 'plugin'])

function tokChip(item) {
  if (!['skills', 'agents'].includes(state.page) || (item.kind !== 'skill' && item.kind !== 'agent')) return ''
  const n = listingTokens(item)
  const title = `About ${tok(n)} in every session for the name and description. The full file, about ${tok(tokensOf(item.size ?? 0))}, loads on use.`
  return `<span class="tokc" title="${esc(title)}">${esc(tok(n))}</span>`
}

export function rowHtml(item, ctx = '', { draggable = false, cat = null, keep = false, right = '', note = '' } = {}) {
  const open = state.menuKey === item.key && state.menuCtx === ctx
  const src =
    ctx === 'dups'
      ? dupSource(item)
      : ctx === 'fav' && item.plugin
        ? `via plugin ${pluginLabel(item.plugin)}`
        : rowSource(item)
  const off = item.canToggle && !item.enabled
  const desc = item.missing
    ? 'Listed in installed_plugins.json, but the plugin folder is gone.'
    : item.description || 'No description'
  const fullVer = item.kind === 'plugin' ? (pluginById(item.id)?.version ?? item.version ?? '') : ''
  const ver = shortVersion(fullVer)
  const cls = ['lrow', off ? 'off' : '', item.missing ? 'missing' : '', item.canToggle ? '' : 'locked']
    .filter(Boolean)
    .join(' ')
  return `<li class="${cls}" data-key="${esc(item.key)}"${draggable ? ' draggable="true"' : ''}>
    <div class="lead">${leadHtml(item)}</div>
    <div class="body">
      <div class="l1"><button type="button" class="name btn-plain" data-act="open">${esc(item.name)}</button>${src ? `<span class="src">${esc(src)}</span>` : ''}${cat ? `<span class="cat-tag">${esc(cat)}</span>` : ''}${item.isMod && state.page !== 'mods' ? '<span class="flag">Mod</span>' : ''}${item.missing ? '<span class="flag bad">Folder missing</span>' : ''}${off ? '<span class="flag">Off</span>' : ''}${useFlag(item)}${tokChip(item)}</div>
      <p class="desc">${esc(desc)}</p>
      ${metaHtml(item)}${note}
    </div>
    ${right}${ver ? `<span class="ver" title="${esc(fullVer)}">${esc(ver)}</span>` : ''}
    <div class="tail">
      ${item.missing ? '<button type="button" class="btn danger" data-act="uninstall">Remove entry</button>' : ''}
      ${keep ? '<button type="button" class="btn" data-act="keep">Keep only this</button>' : ''}
      ${item.dev || !FAV_KINDS.has(item.kind) ? '' : `<button type="button" class="star" data-act="star" aria-haspopup="dialog" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>`}
      <button type="button" class="icon-btn" data-act="menu" aria-haspopup="menu" aria-expanded="${open ? 'true' : 'false'}"${open ? ` aria-controls="menu-${slug(item.key)}"` : ''} aria-label="${esc(`More actions for ${item.name}`)}">${ICON.dots}</button>
    </div>
    ${open ? menuHtml(item) : ''}
  </li>`
}

export function rowsHtml(list, ctx = '') {
  return `<ul class="rows" data-rows="${ctx}">${list.map((i) => rowHtml(i, ctx)).join('')}</ul>`
}

export function invalidAttr(form, field) {
  return cfg[form].invalid === field ? ' aria-invalid="true"' : ''
}

function rowSwitch(item, label) {
  const sw = switchInfo(item)
  const text = item.enabled ? 'Switch off' : 'Switch on'
  return `<span class="sw-wrap">${sw.text ? `<span class="via" title="${esc(sw.title)}">${esc(sw.text)}</span>` : ''}<button type="button" class="sw" role="switch" data-act="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(`${text} ${label}`)}" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}></button></span>`
}

export function cellSwitch(item, label) {
  if (item.plugin && !item.canToggle) {
    const sw = switchInfo(item)
    return `<span class="lead-ic" role="img" aria-label="${esc(sw.title)}" title="${esc(sw.title)}">${ICON.lock}</span>`
  }
  return rowSwitch(item, label)
}

export function viaPlugin(item) {
  const name = pluginLabel(item.plugin)
  return `<span class="via-lock" title="${esc(`Follows the plugin ${name}. Switch or uninstall it on the Plugins page.`)}">${ICON.lock}<span>via plugin ${esc(name)}</span></span>`
}

export function pageBar(note, actions) {
  return `<div class="pagebar"><p class="note">${note}</p><div class="pb-a">${actions}</div></div>`
}

export function addButton(name, label) {
  const open = cfg[name].open
  const id = name === 'hook' ? 'hf' : 'mf'
  return `<button type="button" class="btn${open ? '' : ' p'}" id="${id}-open" data-c="${id}-open" aria-expanded="${open}" aria-controls="${name}-form">${open ? 'Close form' : label}</button>`
}
