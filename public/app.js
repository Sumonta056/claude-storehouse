import { get, send } from './api.js'

const PAGES = {
  dash: 'Dashboard',
  fav: 'Favorites',
  skills: 'Skills',
  agents: 'Agents',
  plugins: 'Plugins',
  hooks: 'Hooks',
  mcp: 'MCP servers',
  settings: 'Settings',
  claudemd: 'CLAUDE.md'
}

const HOLDER = '.card, .recent, tr[data-key], .lrow, .pnote'
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop', 'SessionStart', 'SessionEnd', 'PreCompact']
const SETTINGS_FILE = { global: '~/.claude/settings.json', project: '.claude/settings.json', projectLocal: '.claude/settings.local.json' }
const MCP_ORIGIN = { user: '~/.claude.json', local: '~/.claude.json · this folder', mcpjson: '.mcp.json' }

export const state = { inventory: null, scope: 'all', query: '', page: 'dash' }

const items = new Map()
let projectFiles = null
let bannerDismissed = false
let bannerShown = false
let dragKey = null
const pending = new Set()
let searchTimer = null

const $ = (id) => document.getElementById(id)

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function keyOf(kind, source, name) {
  return `${kind}:${source}:${name}`
}

function home() {
  const dir = state.inventory?.global?.dir ?? ''
  return dir.replace(/[\\/]\.claude$/, '')
}

function tilde(file) {
  const h = home()
  return h && file.startsWith(h) ? `~${file.slice(h.length)}` : file
}

function pluginById(id) {
  return state.inventory.plugins.find((p) => p.id === id)
}

function pluginLabel(id) {
  return pluginById(id)?.name ?? id
}

function normalize(inv) {
  items.clear()
  const out = { skill: [], agent: [], plugin: [], hook: [], mcp: [] }
  for (const s of inv.skills) {
    const item = { ...s, key: keyOf('skill', s.source, s.name) }
    items.set(item.key, item)
    out.skill.push(item)
  }
  for (const a of inv.agents) {
    const item = { ...a, key: keyOf('agent', a.source, a.name) }
    items.set(item.key, item)
    out.agent.push(item)
  }
  for (const p of inv.plugins) {
    const parts = [p.version ? `v${p.version}` : '', `${p.skills.length} skills`, `${p.agents.length} agents`]
    if (p.hooks.length) parts.push(`${p.hooks.length} hooks`)
    if (p.mcp.length) parts.push(`${p.mcp.length} MCP`)
    const item = {
      kind: 'plugin',
      key: keyOf('plugin', 'plugin', p.id),
      id: p.id,
      name: p.name,
      source: p.marketplace || 'plugin',
      favSource: 'plugin',
      description: p.description,
      meta: parts.filter(Boolean).join(' · '),
      scope: p.scope,
      path: p.installPath,
      enabled: p.enabled,
      missing: p.missing,
      canToggle: !p.missing,
      favorite: p.favorite,
      mtime: p.mtime ?? null
    }
    items.set(item.key, item)
    out.plugin.push(item)
  }
  for (const h of inv.hooks) {
    const item = {
      ...h,
      kind: 'hook',
      key: `hook:${h.id}:${h.file}:${h.index?.group}:${h.index?.hook}${h.parked ? ':parked' : ''}`,
      name: String(h.command ?? ''),
      description: `${h.event} · ${h.matcher}`,
      source: h.plugin ? pluginLabel(h.plugin) : h.parked ? 'parked' : SETTINGS_FILE[h.file] ?? h.file
    }
    items.set(item.key, item)
    out.hook.push(item)
  }
  for (const m of inv.mcp) {
    const item = {
      ...m,
      kind: 'mcp',
      key: `mcp:${m.origin}:${m.plugin ?? ''}:${m.name}`,
      description: m.command ?? m.url ?? '',
      source: m.plugin ? pluginLabel(m.plugin) : MCP_ORIGIN[m.origin] ?? m.origin
    }
    items.set(item.key, item)
    out.mcp.push(item)
  }
  return out
}

let catalog = { skill: [], agent: [], plugin: [], hook: [], mcp: [] }

function inScope(scope) {
  if (state.scope === 'all') return true
  if (state.scope === 'global') return scope === 'global' || scope === 'plugin'
  return scope === 'project'
}

function matches(item) {
  const q = state.query.trim().toLowerCase()
  if (!q) return true
  return [item.name, item.description, item.source, item.plugin, item.id, item.model, item.tools?.join(' ')].some((v) => String(v ?? '').toLowerCase().includes(q))
}

function visible(item) {
  return inScope(item.scope) && matches(item)
}

function switchInfo(item) {
  if (item.kind === 'plugin') {
    if (item.missing) return { disabled: true, text: 'not installed', title: `${item.id} is listed but its folder is missing` }
    const file = item.scope === 'project' ? '.claude/settings.local.json' : '~/.claude/settings.json'
    return { disabled: false, title: `Writes enabledPlugins["${item.id}"] in ${file}` }
  }
  if (item.kind === 'hook' && !item.plugin) {
    if (!item.canToggle) return { disabled: true, text: 'cannot switch', title: 'This hook has no command string, so it cannot be parked.' }
    const file = SETTINGS_FILE[item.file] ?? item.file
    return { disabled: false, title: item.enabled ? `Off moves this hook from ${file} to ~/.claude/storehouse.json` : `On puts this hook back in ${file}` }
  }
  if (item.kind === 'mcp') {
    if (!item.canToggle) return { disabled: true, text: 'cannot switch', title: `${item.name} cannot be switched here.` }
    return {
      disabled: false,
      title: item.origin === 'mcpjson' ? 'Writes enabledMcpjsonServers or disabledMcpjsonServers in .claude/settings.local.json' : 'Writes disabledMcpServers for this folder in ~/.claude.json'
    }
  }
  if (!item.canToggle) {
    const name = item.plugin ? pluginLabel(item.plugin) : ''
    return {
      disabled: true,
      text: name ? `via plugin ${name}` : `via plugin ${item.source}`,
      title: `Follows the plugin ${item.plugin ?? item.source}. Switch the plugin on the Plugins page.`
    }
  }
  if (item.kind === 'agent') {
    const file = item.path.split(/[\\/]/).pop()
    return { disabled: false, title: item.enabled ? `Renames ${file} to ${file}.disabled` : `Renames ${file} back to ${file.replace(/\.disabled$/, '')}` }
  }
  const file = item.scope === 'project' ? '.claude/settings.local.json' : '~/.claude/settings.json'
  return { disabled: false, title: `Writes skillOverrides["${item.name}"] in ${file}` }
}

function scopeTag(scope) {
  return `<span class="tag ${esc(scope)}">${esc(scope)}</span>`
}

function cardHtml(item, { draggable = false } = {}) {
  const sw = switchInfo(item)
  const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
  const left = sw.text ? `<span class="via" title="${esc(sw.title)}">${esc(sw.text)}</span>` : `<span class="via">${esc(item.meta ?? item.kind)}</span>`
  const desc = item.description || (item.kind === 'plugin' ? item.meta : 'No description')
  return `<article class="card${item.enabled ? '' : ' off'}" data-key="${esc(item.key)}"${draggable ? ' draggable="true"' : ''}>
    <div class="h">
      <div class="ht">
      <button type="button" class="name btn-plain" data-act="open">${esc(item.name)}</button>
      ${item.source !== item.scope ? `<span class="tag ${item.scope === 'plugin' || item.kind === 'plugin' ? 'plugin' : esc(item.scope)}">${esc(item.source)}</span>` : ''}
      ${scopeTag(item.scope)}
      ${item.missing ? '<span class="tag bad">missing</span>' : ''}
      </div>
      <button type="button" class="star" data-act="star" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>
    </div>
    <div class="d">${esc(desc)}</div>
    <div class="f">
      ${left}
      <span class="sw-wrap state"><button type="button" class="sw" role="switch" data-act="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}></button></span>
    </div>
  </article>`
}

function missingFavHtml(fav) {
  return `<article class="card missing" data-fav="${esc(fav.id)}">
    <div class="h"><div class="ht">
      <span class="name">${esc(fav.name)}</span>
      <span class="tag">${esc(fav.source)}</span>
      <span class="tag bad">missing</span>
    </div></div>
    <div class="d">This ${esc(fav.kind)} is no longer on disk.</div>
    <div class="f"><span>${esc(fav.kind)}</span><button type="button" class="btn danger" data-act="unfav">Remove</button></div>
  </article>`
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`
}

function nothingMatches() {
  return empty(state.query ? `Nothing matches "${state.query}" in this scope.` : 'Nothing in this scope.')
}

function favoriteEntries() {
  return state.inventory.favorites.map((f) => ({ fav: f, item: items.get(f.id) ?? null }))
}

function counts(list) {
  const shown = list.filter(visible)
  return { total: shown.length, on: shown.filter((i) => i.enabled).length }
}

function navIcon(page) {
  return document.querySelector(`#nav [data-p="${page}"] .ic`)?.outerHTML ?? ''
}

function statTile(page, label, c) {
  return `<button type="button" class="stat" data-go="${page}">
    <span class="st-top"><span class="st-ic">${navIcon(page)}</span><span class="l">${esc(label)}</span></span>
    <span class="n">${c.total}</span>
    <span class="s"><span class="on">${c.on} on</span><span class="off">${c.total - c.on} off</span></span>
  </button>`
}

function otherCounts(list) {
  const shown = list.filter((i) => inScope(i.scope) && matches({ name: i.name ?? i.command, description: i.event, source: i.plugin }))
  return { total: shown.length, on: shown.filter((i) => i.enabled).length }
}

function renderDash() {
  const inv = state.inventory
  const tiles = [
    statTile('skills', 'Skills', counts(catalog.skill)),
    statTile('agents', 'Agents', counts(catalog.agent)),
    statTile('plugins', 'Plugins', counts(catalog.plugin)),
    statTile('hooks', 'Hooks', otherCounts(inv.hooks)),
    statTile('mcp', 'MCP servers', otherCounts(inv.mcp))
  ].join('')
  const favs = favoriteEntries().filter((e) => e.item && visible(e.item)).slice(0, 6).map((e) => e.item)
  const favHtml = favs.length ? rowsHtml(favs, 'dfav') : empty(inv.favorites.length ? 'No favorites in this scope.' : 'No favorites yet. Click the star on any row.')
  const more = inv.favorites.length > favs.length && favs.length ? '<button type="button" class="btn-link" data-go="fav">All favorites <span aria-hidden="true">→</span></button>' : ''
  const proj = [...catalog.skill, ...catalog.agent, ...catalog.plugin].filter((i) => i.scope === 'project' && visible(i))
  const projHtml = proj.length ? rowsHtml(proj, 'dproj') : empty(state.query ? `No project items match "${state.query}".` : 'No skills, agents, or plugins in ./.claude.')
  const errors = inv.errors?.length
    ? `<div class="warn"><b>${inv.errors.length} file${inv.errors.length > 1 ? 's' : ''} could not be read.</b> ${inv.errors.map((e) => `<code>${esc(tilde(e.path))}</code>: ${esc(e.error)}`).join('; ')}</div>`
    : ''
  $('p-dash').innerHTML = `${errors}
    <div class="stats">${tiles}</div>
    <div class="two">
      <div><h2>Favorites ${more}</h2>${favHtml}${recentHtml()}</div>
      <div>
        <h2>This project</h2>
        ${projectOn() ? `${filesHtml()}<h2>Project items <span class="pill">${proj.length}</span></h2>${projHtml}` : projectOffHtml()}
      </div>
    </div>`
}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return new Date(ms).toLocaleDateString()
}

function recentHtml() {
  const all = [...catalog.skill, ...catalog.agent, ...catalog.plugin]
  if (!all.some((i) => typeof i.mtime === 'number')) return ''
  const recent = all
    .filter((i) => typeof i.mtime === 'number' && visible(i))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
  const body = recent.length
    ? `<ul class="clist">${recent
        .map(
          (i) => `<li class="recent" data-key="${esc(i.key)}"><button type="button" class="btn-plain name" data-act="open">${esc(i.name)}</button><span class="ck">${esc(KIND_WORD[i.kind] ?? i.kind)} · ${esc(i.scope)}</span><span class="when" title="${esc(new Date(i.mtime).toLocaleString())}">${esc(ago(i.mtime))}</span></li>`
        )
        .join('')}</ul>`
    : nothingMatches()
  return `<h2>Recently changed</h2>${body}`
}

function filesHtml() {
  const inv = state.inventory
  const rows = [
    ['CLAUDE.md', inv.claudeMd?.project?.exists, 'claudemd'],
    ['.claude/settings.json', inv.settings?.project?.exists, 'settings'],
    ['.claude/settings.local.json', inv.settings?.projectLocal?.exists, 'settings'],
    ['.mcp.json', projectFiles ? projectFiles.has('.mcp.json') : inv.mcp.some((m) => m.origin === 'mcpjson'), 'mcp']
  ]
  return `<ul class="clist files">${rows
    .map(
      ([name, yes, page]) =>
        `<li><span class="dot${yes ? ' yes' : ''}" aria-hidden="true"></span><button type="button" class="btn-plain fname" data-go="${page}" aria-label="${esc(`${name}, ${yes ? 'present' : 'not found'}. Open ${PAGES[page]}`)}">${esc(name)}</button><span class="${yes ? 'yes' : 'no'}">${yes ? 'present' : 'not found'}</span></li>`
    )
    .join('')}</ul>`
}

function renderFav() {
  const entries = favoriteEntries()
  const intro = '<div class="warn">Favorites live in <code>~/.claude/storehouse.json</code>. They do not change Claude Code. Drag a card to reorder.</div>'
  if (!entries.length) {
    $('p-fav').innerHTML = intro + empty('No favorites yet. Click the star on any card.')
    return
  }
  const shown = entries.filter((e) => (e.item ? visible(e.item) : matches({ name: e.fav.name, source: e.fav.source })))
  const html = shown.map((e) => (e.item ? cardHtml(e.item, { draggable: true }) : missingFavHtml(e.fav))).join('')
  $('p-fav').innerHTML = intro + (shown.length ? `<div class="grid" id="favgrid">${html}</div>` : nothingMatches())
}

const ICON = {
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  warn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5"/><path d="M12 18h.01"/></svg>',
  dots: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
}

const CHIPS = {
  plugins: [['all', 'All'], ['on', 'On'], ['off', 'Off'], ['broken', 'Broken']],
  skills: [['all', 'All'], ['on', 'On'], ['off', 'Off'], ['plugin', 'From plugins']],
  agents: [['all', 'All'], ['on', 'On'], ['off', 'Off'], ['plugin', 'From plugins']]
}

const SECTIONS = {
  plugins: [['global', 'Global · installed for your user', ''], ['project', 'Project · installed for this folder', '']],
  skills: [
    ['global', 'Global · ~/.claude/skills', 'The switch writes skillOverrides in ~/.claude/settings.json'],
    ['project', 'Project · ./.claude/skills', 'The switch writes .claude/settings.local.json']
  ],
  agents: [
    ['global', 'Global · ~/.claude/agents', 'Off renames name.md to name.md.disabled'],
    ['project', 'Project · ./.claude/agents', 'Off renames name.md to name.md.disabled']
  ]
}

const chipFilter = { plugins: 'all', skills: 'all', agents: 'all' }
const groupOpen = new Map()
let menuKey = null
let menuCtx = ''

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function shortVersion(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^[0-9a-f]{8,}$/i.test(s)) return s.slice(0, 7)
  return /^v\d/i.test(s) ? s : /^\d/.test(s) ? `v${s}` : s
}

function pluginParts(id) {
  const p = pluginById(id)
  if (!p) return []
  const parts = [[p.skills.length, 'skill'], [p.agents.length, 'agent'], [p.hooks.length, 'hook']].filter(([n]) => n).map(([n, w]) => plural(n, w))
  if (p.mcp.length) parts.push(`${p.mcp.length} MCP`)
  return parts
}

function cliScope(id) {
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

function menuEntries(item) {
  if (item.kind === 'plugin' && item.missing) return [['m-open', 'Open details'], ['m-uninstall', 'Remove entry', true]]
  const list = [['m-open', 'Open details']]
  if (item.canToggle) list.push(['m-toggle', item.enabled ? 'Switch off' : 'Switch on'])
  if (item.path) list.push(['m-finder', 'Reveal in Finder'])
  if (item.kind === 'plugin') list.push(['m-uninstall', 'Uninstall plugin…', true])
  return list
}

function menuHtml(item) {
  const entries = menuEntries(item)
  const html = entries
    .map(([act, text, danger]) => `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-act="${act}">${esc(text)}</button>`)
    .join('')
  return `<div class="menu" role="menu" id="menu-${slug(item.key)}" aria-label="${esc(`More actions for ${item.name}`)}">${html}</div>`
}

function metaHtml(item) {
  if (item.kind === 'plugin') {
    if (item.missing) return '<p class="meta muted">Use “Remove entry” to clean up installed_plugins.json.</p>'
    const parts = pluginParts(item.id)
    return `<p class="meta${parts.length ? '' : ' muted'}">${esc(parts.length ? parts.join(' · ') : 'No skills, agents, hooks, or MCP servers found')}</p>`
  }
  if (item.kind === 'agent') {
    const bits = []
    if (item.model) bits.push(`<span class="mchip">model: ${esc(item.model)}</span>`)
    if (item.tools?.length) bits.push(`<span class="mchip">${esc(item.tools.join(' · '))}</span>`)
    return bits.length ? `<p class="meta chips-s">${bits.join('')}</p>` : ''
  }
  return ''
}

function rowHtml(item, ctx = '') {
  const open = menuKey === item.key && menuCtx === ctx
  const src = rowSource(item)
  const off = item.canToggle && !item.enabled
  const desc = item.missing ? 'Listed in installed_plugins.json, but the plugin folder is gone.' : item.description || 'No description'
  const ver = item.kind === 'plugin' ? shortVersion(pluginById(item.id)?.version) : ''
  const cls = ['lrow', off ? 'off' : '', item.missing ? 'missing' : '', item.canToggle ? '' : 'locked'].filter(Boolean).join(' ')
  return `<li class="${cls}" data-key="${esc(item.key)}">
    <div class="lead">${leadHtml(item)}</div>
    <div class="body">
      <div class="l1"><button type="button" class="name btn-plain" data-act="open">${esc(item.name)}</button>${src ? `<span class="src">${esc(src)}</span>` : ''}${item.missing ? '<span class="flag bad">Folder missing</span>' : ''}${off ? '<span class="flag">Off</span>' : ''}</div>
      <p class="desc">${esc(desc)}</p>
      ${metaHtml(item)}
    </div>
    ${ver ? `<span class="ver" title="${esc(pluginById(item.id)?.version ?? '')}">${esc(ver)}</span>` : ''}
    <div class="tail">
      ${item.missing ? '<button type="button" class="btn danger" data-act="uninstall">Remove entry</button>' : ''}
      <button type="button" class="star" data-act="star" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>
      <button type="button" class="icon-btn" data-act="menu" aria-haspopup="menu" aria-expanded="${open ? 'true' : 'false'}"${open ? ` aria-controls="menu-${slug(item.key)}"` : ''} aria-label="${esc(`More actions for ${item.name}`)}">${ICON.dots}</button>
    </div>
    ${open ? menuHtml(item) : ''}
  </li>`
}

function rowsHtml(list, ctx = '') {
  return `<ul class="rows" data-rows="${ctx}">${list.map((i) => rowHtml(i, ctx)).join('')}</ul>`
}

function keepChip(page, item) {
  const f = chipFilter[page]
  if (f === 'all') return true
  if (page === 'plugins') return f === 'broken' ? Boolean(item.missing) : !item.missing && (f === 'on') === Boolean(item.enabled)
  if (f === 'plugin') return item.scope === 'plugin'
  return item.scope !== 'plugin' && (f === 'on') === Boolean(item.enabled)
}

function chipCounts(page, list) {
  const shown = list.filter(visible)
  if (page === 'plugins') {
    const ok = shown.filter((p) => !p.missing)
    return { all: shown.length, on: ok.filter((p) => p.enabled).length, off: ok.filter((p) => !p.enabled).length, broken: shown.length - ok.length }
  }
  const own = shown.filter((i) => i.scope !== 'plugin')
  return { all: shown.length, on: own.filter((i) => i.enabled).length, off: own.filter((i) => !i.enabled).length, plugin: shown.length - own.length }
}

function chipsHtml(page, list, note) {
  const n = chipCounts(page, list)
  const buttons = CHIPS[page]
    .map(([k, label]) => {
      const on = chipFilter[page] === k
      const bad = k === 'broken' && n.broken ? ' bad' : ''
      return `<button type="button" class="chip${bad}" id="chip-${page}-${k}" data-chip="${k}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)} <span class="n">${n[k]}</span></button>`
    })
    .join('')
  return `<div class="chipbar"><div class="chips" role="group" aria-label="${esc(`Filter ${PAGES[page].toLowerCase()}`)}">${buttons}</div><p class="note">${note}</p></div>`
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
      const plugin = catalog.plugin.find((p) => p.id === id)
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
        <div class="gbody" id="${panel}"${open ? '' : ' hidden'}>${open ? notice + rowsHtml(rows) : ''}</div>
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
      return `<h2>${esc(title)} <span class="pill">${shown.length}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</h2>${rowsHtml(shown)}`
    })
    .join('')
  const html = own + (page === 'plugins' ? '' : pluginGroupsHtml(page, list))
  if (html) return html
  if (chipFilter[page] !== 'all' && list.some(visible)) return empty(`No ${page} match this filter.`)
  return nothingMatches()
}

function renderCatalog(page, list, note) {
  $(`p-${page}`).innerHTML = chipsHtml(page, list, note) + catalogBody(page, list)
}

function menuButtonFor(key) {
  const page = document.querySelector('.page:not([hidden])')
  return page ? [...page.querySelectorAll('[data-act="menu"]')].find((b) => holderKey(b.closest(HOLDER)) === key && (b.closest('[data-rows]')?.dataset.rows ?? '') === menuCtx) ?? null : null
}

function closeMenu(refocus = true) {
  if (!menuKey) return
  const btn = refocus ? menuButtonFor(menuKey) : null
  menuKey = null
  if (btn) btn.focus({ preventScroll: true })
  render()
}

function openMenu(key, ctx = '') {
  menuKey = menuKey === key && menuCtx === ctx ? null : key
  menuCtx = ctx
  render()
  if (menuKey) document.querySelector('.page:not([hidden]) .menu [role="menuitem"]')?.focus({ preventScroll: true })
}

function menuKeys(e) {
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

function reveal(item) {
  const file = item.path
  return guarded(`reveal-${item.key}`, async () => {
    try {
      await send('POST', '/api/open', { path: file, app: 'finder' })
      toast(`Revealed ${tilde(file)} in Finder`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

async function uninstallPlugin(item) {
  const busy = `${item.key}:uninstall`
  if (pending.has(busy)) return
  const parts = pluginParts(item.id)
  const command = `claude plugin uninstall ${item.id} --scope ${cliScope(item.id)}`
  const yes = await ask({
    title: item.missing ? `Remove entry ${item.name}?` : `Uninstall ${item.name}?`,
    message: item.missing
      ? 'The plugin folder is gone. This removes its entry from installed_plugins.json.'
      : `Claude Code stops loading ${parts.length ? `its ${parts.join(', ')}` : 'this plugin'}. You can install it again with /plugin.`,
    ok: item.missing ? 'Remove entry' : 'Uninstall',
    danger: true,
    command
  })
  if (!yes) return
  pending.add(busy)
  try {
    await send('POST', '/api/plugin/uninstall', { id: item.id })
    toast(item.missing ? `Removed entry ${item.id}` : `Uninstalled ${item.id}`)
    await refresh()
  } catch (err) {
    toast(`Could not uninstall ${item.name}: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

function renderNav() {
  const inv = state.inventory
  $('n-skills').textContent = counts(catalog.skill).total
  $('n-agents').textContent = counts(catalog.agent).total
  $('n-plugins').textContent = counts(catalog.plugin).total
  $('n-hooks').textContent = otherCounts(inv.hooks).total
  $('n-mcp').textContent = otherCounts(inv.mcp).total
  $('n-fav').textContent = favoriteEntries().filter((e) => !e.item || visible(e.item)).length
  for (const b of document.querySelectorAll('#nav button')) {
    if (b.dataset.p === state.page) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  for (const b of document.querySelectorAll('#scope button')) b.setAttribute('aria-pressed', String(b.dataset.s === state.scope))
  const project = inv.project.dir ? `<code>${esc(tilde(inv.project.dir))}</code>` : 'off'
  $('ctx').innerHTML = `Project: ${project} · Global: <code>${esc(tilde(inv.global.dir))}</code>`
}

function holderKey(h) {
  return h ? h.dataset.key ?? h.dataset.fav ?? null : null
}

function focusMark() {
  const el = document.activeElement
  const page = el?.closest?.('.page')
  if (!el || !page) return null
  const holder = el.dataset?.act ? el.closest(HOLDER) : null
  if (holder) {
    const key = holderKey(holder)
    const same = [...page.querySelectorAll(`[data-act="${el.dataset.act}"]`)].filter((b) => holderKey(b.closest(HOLDER)) === key)
    return { key, act: el.dataset.act, index: Math.max(0, same.indexOf(el)), pos: [...page.querySelectorAll(HOLDER)].indexOf(holder) }
  }
  if (el.id) return { id: el.id, start: el.selectionStart ?? null, end: el.selectionEnd ?? null, scroll: el.scrollTop }
  return null
}

function focusRestore(mark) {
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
  const same = [...page.querySelectorAll(`[data-act="${mark.act}"]`)].filter((b) => holderKey(b.closest(HOLDER)) === mark.key)
  let target = same[mark.index] ?? same[0]
  if (!target && mark.pos >= 0) {
    const holders = [...page.querySelectorAll(HOLDER)]
    const h = holders[Math.min(mark.pos, holders.length - 1)]
    target = h?.querySelector(`[data-act="${mark.act}"]:not([disabled])`) ?? h?.querySelector('[data-act="open"]') ?? null
  }
  if (target) target.focus({ preventScroll: true })
}

export function render() {
  if (!state.inventory) return
  const mark = focusMark()
  renderPage()
  focusRestore(mark)
  syncDrawerHead()
}

function renderPage() {
  renderNav()
  $('title').textContent = PAGES[state.page]
  for (const s of document.querySelectorAll('.page')) s.hidden = s.id !== `p-${state.page}`
  const page = state.page
  if (page === 'dash') renderDash()
  else if (page === 'fav') renderFav()
  else if (page === 'skills')
    renderCatalog('skills', catalog.skill, 'Off writes <code>"skillOverrides": {"name": "off"}</code> to <code>~/.claude/settings.json</code> (global) or <code>.claude/settings.local.json</code> (project). Plugin skills follow their plugin.')
  else if (page === 'agents')
    renderCatalog('agents', catalog.agent, 'Claude Code has no off switch for agents. Off renames <code>name.md</code> to <code>name.md.disabled</code>. Plugin agents follow their plugin.')
  else if (page === 'plugins')
    renderCatalog('plugins', catalog.plugin, 'The switch writes <code>enabledPlugins["name@marketplace"]</code>, the same as the <code>/plugin</code> menu.')
  else if (page === 'hooks') renderHooks()
  else if (page === 'mcp') renderMcp()
  else if (page === 'settings') renderSettings()
  else renderClaudeMd()
}

export function go(page) {
  if (!Object.hasOwn(PAGES, page)) page = 'dash'
  const dirty = state.page === 'claudemd' && page !== 'claudemd' ? mdDirtyKey() : null
  if (dirty) {
    discardMd(dirty).then((yes) => {
      if (yes) show(page)
      else if (location.hash !== '#claudemd') history.replaceState(null, '', `${location.search}#claudemd`)
    })
    return
  }
  show(page)
}

function show(page) {
  state.page = page
  markStale()
  if (location.hash !== `#${page}`) history.replaceState(null, '', `${location.search}#${page}`)
  render()
  window.scrollTo(0, 0)
}

function projectOn() {
  return Boolean(state.inventory?.project?.dir)
}

const PROJECT_OFF_NOTE = 'Started from your home folder — project scope is off. Run it inside a project folder.'

function projectOffHtml() {
  return `<div class="warn" role="note">${esc(PROJECT_OFF_NOTE)}</div>`
}

function askReload(file) {
  return ask({
    title: `${baseName(file)} changed on disk`,
    message: 'This file changed on disk. Reload it before you save. Reload discards your unsaved edits.',
    ok: 'Reload (discard mine)',
    danger: true
  })
}

async function loadProjectFiles() {
  if (!state.inventory?.project?.dir) {
    projectFiles = null
    return
  }
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(state.inventory.project.dir)}`)
    projectFiles = new Set((res.entries ?? []).map((e) => e.name))
  } catch {
    projectFiles = null
  }
}

export async function refresh() {
  const inv = await get('/api/inventory')
  state.inventory = inv
  catalog = normalize(inv)
  markStale()
  render()
}

let toastTimer = null
function toast(message, isError = false) {
  const t = $('toast')
  t.textContent = message
  t.classList.toggle('err', isError)
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 3000)
}

function showBanner() {
  if (bannerDismissed || bannerShown) return
  bannerShown = true
  $('banner').hidden = false
}

function toggleBody(item, enabled) {
  if (item.kind === 'plugin') return { kind: 'plugin', name: item.id, scope: item.scope, enabled }
  if (item.kind === 'hook') {
    if (enabled) return { kind: 'hook', name: item.id, scope: item.scope, enabled }
    return { kind: 'hook', name: item.command, scope: item.scope, file: item.file, event: item.event, index: item.index, enabled }
  }
  if (item.kind === 'mcp') {
    const body = { kind: 'mcp', name: item.name, scope: item.scope, origin: item.origin, enabled }
    if (item.plugin) body.plugin = item.plugin
    return body
  }
  return { kind: item.kind, name: item.name, scope: item.scope, enabled, plugin: item.plugin }
}

async function toggle(item) {
  const busy = `${item.key}:toggle`
  if (!item.canToggle || pending.has(busy)) return
  pending.add(busy)
  const enabled = !item.enabled
  const body = toggleBody(item, enabled)
  item.enabled = enabled
  render()
  try {
    const res = await send('POST', '/api/toggle', body)
    toast(`Wrote ${tilde(res.file)}${res.backup ? ' · backup saved' : ''}`)
    showBanner()
    await refresh()
    if (item.kind === 'hook' && !drawerOpen()) {
      const moved = catalog.hook.find((h) => h.event === item.event && h.command === item.command && h.file === item.file && h.enabled === enabled)
      const row = moved ? [...document.querySelectorAll('#p-hooks tr[data-key]')].find((r) => r.dataset.key === moved.key) : null
      row?.querySelector('[data-act="toggle"]')?.focus()
    }
  } catch (err) {
    item.enabled = !enabled
    render()
    toast(`Could not switch ${item.name}: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

async function star(kind, name, source, favorite, label) {
  const busy = `${kind}:${source}:${name}:star`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    await send('POST', '/api/favorite', { kind, name, source, favorite })
    toast(`${favorite ? 'Starred' : 'Unstarred'} ${label} · ~/.claude/storehouse.json`)
    await refresh()
  } catch (err) {
    toast(`Could not update favorites: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

function starItem(item) {
  const name = item.kind === 'plugin' ? item.id : item.name
  const source = item.kind === 'plugin' ? 'plugin' : item.source
  return star(item.kind, name, source, !item.favorite, item.name)
}

const dr = {
  key: null,
  kind: null,
  mainFile: null,
  root: null,
  dir: null,
  file: null,
  loaded: '',
  stamp: null,
  editable: false,
  tab: 'file',
  seq: 0,
  opener: null,
  menu: false
}

const TEXT_EXT = /\.(md|json|txt)$/i

function isFolderSkill(item) {
  return item.kind === 'skill' && baseName(item.path) === 'SKILL.md'
}

function parentDir(file) {
  return file.replace(/[\\/][^\\/]*$/, '')
}

function baseName(file) {
  return file.split(/[\\/]/).pop()
}

function relTo(root, file) {
  return root && file.startsWith(root) ? file.slice(root.length).replace(/^[\\/]/, '') : baseName(file)
}

function drawerOpen() {
  return $('dr').classList.contains('open')
}

function drawerItem() {
  return dr.key ? items.get(dr.key) ?? null : null
}

function isDirty() {
  const txt = $('dr-txt')
  return Boolean(drawerOpen() && txt && dr.editable && txt.value !== dr.loaded)
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

let confirmState = null

function ask({ title, message, ok = 'OK', danger = false, command = '' }) {
  if (confirmState) confirmState.done(false)
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
    confirmState = {
      done(answer) {
        confirmState = null
        box.hidden = true
        layer.inert = false
        if (back && document.contains(back)) back.focus()
        resolve(answer)
      }
    }
    $('cf-no').focus()
  })
}

function trapTab(e, container) {
  const nodes = [...container.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0
  )
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

const KIND_WORD = { skill: 'Skill', agent: 'Agent', plugin: 'Plugin', hook: 'Hook', mcp: 'MCP server' }
const LOCK_WORD = { skill: 'skill', agent: 'agent', hook: 'hook', mcp: 'MCP server' }

function isPluginOwned(item) {
  return item.kind !== 'plugin' && Boolean(item.plugin || item.scope === 'plugin')
}

function ownerId(item) {
  return item.plugin ?? item.source
}

function ownerPlugin(item) {
  return isPluginOwned(item) ? catalog.plugin.find((p) => p.id === ownerId(item)) ?? null : null
}

function kindLabel(item) {
  const word = KIND_WORD[item.kind] ?? item.kind
  if (item.kind === 'plugin') return `${word} · ${item.source === 'plugin' ? item.scope : item.source}`
  if (isPluginOwned(item)) return `${word} · from plugin ${pluginLabel(ownerId(item))}`
  return `${word} · ${item.scope}`
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
  if (item.kind === 'hook' || item.kind === 'mcp') return ''
  const starBtn = `<button type="button" class="icon-btn star" data-dact="star" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>`
  const entries = drawerMenuEntries(item)
  if (!entries.length) return starBtn
  const menu = dr.menu
    ? `<div class="menu" role="menu" id="dr-menu" aria-label="${esc(`More actions for ${item.name}`)}">${entries
        .map(([act, text, danger]) => `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-dact="${act}">${esc(text)}</button>`)
        .join('')}</div>`
    : ''
  return `${starBtn}<div class="dr-more"><button type="button" class="icon-btn" data-dact="menu" id="dr-menu-btn" aria-haspopup="menu" aria-expanded="${dr.menu ? 'true' : 'false'}"${dr.menu ? ' aria-controls="dr-menu"' : ''} aria-label="More actions">${ICON.dots}</button>${menu}</div>`
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

function statusHtml(item) {
  if (item.kind === 'plugin' && item.missing) {
    return `<div class="dr-note bad" role="note"><div class="lock-t">${ICON.warn}<p><b>Plugin folder missing.</b> ${esc(item.id)} is listed in installed_plugins.json, but its folder is gone. Remove the entry to clean up.</p></div></div>`
  }
  if (isPluginOwned(item)) return lockHtml(item)
  if (item.kind === 'hook' || item.kind === 'mcp') return ''
  const sw = switchInfo(item)
  const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
  const text = item.enabled ? '<b>On</b> <span class="muted">· loads in every session</span>' : '<b>Off</b>'
  return `<div class="dr-status">
      <button type="button" class="sw" role="switch" data-dact="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" aria-describedby="dr-st-file"${sw.disabled ? ' disabled' : ''}></button>
      <span class="st-text">${text}</span>
      <span class="st-file" id="dr-st-file">${esc(sw.title)}</span>
    </div>`
}

function factsHtml(item) {
  const rows = []
  if (isPluginOwned(item)) {
    const p = ownerPlugin(item)
    if (p) rows.push(['State', p.enabled ? `On, because ${p.name} is on` : `Off, because ${p.name} is off`])
  } else if (item.kind === 'hook' || item.kind === 'mcp') {
    rows.push(['State', item.enabled === false ? 'Off' : 'On'])
  }
  const path = `<dt>Path</dt><dd class="f-path"><code class="path" id="dr-path"></code><button type="button" class="icon-btn sm" data-dact="copy" id="dr-copy" aria-label="Copy path">${ICON.copy}</button></dd>`
  if (item.mtime) rows.push(['Changed', ago(item.mtime)])
  if (item.kind === 'plugin' && !item.missing) {
    const p = pluginById(item.id)
    if (p?.version) rows.push(['Version', p.version])
    const parts = pluginParts(item.id)
    rows.push(['Contents', parts.length ? parts.join(' · ') : 'No skills, agents, hooks, or MCP servers'])
  }
  if (item.kind === 'agent') {
    if (item.model) rows.push(['Model', item.model])
    if (item.tools?.length) rows.push(['Tools', item.tools.join(' · ')])
  }
  const lead = rows.length && rows[0][0] === 'State' ? rows.shift() : null
  const html = (r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`
  return (lead ? html(lead) : '') + path + rows.map(html).join('')
}

function barHtml(item) {
  const finder = '<button type="button" class="btn" data-dact="finder">Reveal in Finder</button>'
  const editor = '<button type="button" class="btn p" data-dact="editor">Open in editor</button>'
  let left = ''
  let right = finder + editor
  if (item.kind === 'plugin') {
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
  if (!el || !$('dr').contains(el) || $('dr-body').contains(el)) return null
  return el.dataset?.dact ?? null
}

function syncDrawerHead() {
  if (!drawerOpen()) return
  const item = drawerItem()
  if (!item) return forceClose()
  const focused = drawerFocusAct()
  $('dr-kind').textContent = kindLabel(item)
  $('dr-name').textContent = drawerName(item)
  $('dr-tools').innerHTML = headTools(item)
  $('dr-desc').textContent = item.kind === 'hook' ? item.name || '(no command)' : item.description || 'No description.'
  $('dr-status').innerHTML = statusHtml(item)
  $('dr-facts').innerHTML = factsHtml(item)
  $('dr-bar').innerHTML = barHtml(item)
  if (focused) document.querySelector(`#dr .dr-top [data-dact="${focused}"], #dr .dr-bar [data-dact="${focused}"]`)?.focus()
  if (item.kind !== 'plugin' && item.path !== dr.mainFile) {
    const wasMain = dr.file === dr.mainFile
    dr.mainFile = item.path
    if (wasMain) dr.file = item.path
  }
  showPath()
}

function closeDrawerMenu(refocus) {
  if (!dr.menu) return
  dr.menu = false
  syncDrawerHead()
  if (refocus) $('dr-menu-btn')?.focus()
}

function showPath() {
  const box = $('dr-path')
  if (box) box.textContent = dr.file ? tilde(dr.file) : dr.root ? tilde(dr.root) : ''
}

function tabsHtml(tabs) {
  return `<div class="tabs" role="tablist" aria-label="Drawer views">${tabs
    .map(([id, label]) => `<button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="pane-${id}" aria-selected="${dr.tab === id ? 'true' : 'false'}">${esc(label)}</button>`)
    .join('')}</div>`
}

function fileBodyHtml(item, withFiles) {
  const own = !item.readOnly && !isPluginOwned(item)
  const tabs = [['preview', 'Preview'], ['file', own ? 'Edit' : 'Source (read-only)']]
  if (withFiles) tabs.push(['files', 'Files'])
  if (own) tabs.push(['backups', 'Backups'])
  return `${tabsHtml(tabs)}
    <div class="pane md" id="pane-preview" role="tabpanel" aria-labelledby="tab-preview"></div>
    <div class="pane" id="pane-file" role="tabpanel" aria-labelledby="tab-file" hidden>
      <div class="filebar">
        <code id="dr-file"></code>
        <button type="button" class="btn" data-dact="main" id="dr-main" hidden>Back to ${esc(baseName(dr.mainFile))}</button>
        ${own ? '<span class="dirty" id="dr-dirty" aria-live="polite"></span><button type="button" class="btn p" data-dact="save" id="dr-save" disabled>Save</button>' : ''}
      </div>
      <textarea id="dr-txt" spellcheck="false" aria-label="File contents"></textarea>
      <p class="note" id="dr-note"></p>
    </div>
    ${withFiles ? '<div class="pane" id="pane-files" role="tabpanel" aria-labelledby="tab-files" hidden></div>' : ''}
    ${own ? '<div class="pane" id="pane-backups" role="tabpanel" aria-labelledby="tab-backups" hidden></div>' : ''}`
}

function listLinks(list, kind) {
  if (!list.length) return `<p class="note">No ${kind}.</p>`
  return `<ul class="mini">${list
    .map(
      (s) => `<li><button type="button" class="btn-plain name" data-dact="sub" data-key="${esc(s.key)}">${esc(s.name)}</button><span class="note">${esc(s.description || '')}</span><button type="button" class="sw" role="switch" aria-checked="${s.enabled ? 'true' : 'false'}" aria-label="${esc(`${s.name} follows the plugin`)}" disabled></button></li>`
    )
    .join('')}</ul>`
}

function pluginBodyHtml(item) {
  const p = pluginById(item.id)
  const skills = catalog.skill.filter((s) => s.plugin === item.id)
  const agents = catalog.agent.filter((a) => a.plugin === item.id)
  const hooks = p?.hooks ?? []
  const mcp = p?.mcp ?? []
  const events = [...new Set(hooks.map((h) => h.event).filter(Boolean))]
  const tabs = item.missing ? [['overview', 'Overview']] : [['overview', 'Overview'], ['files', 'Files'], ['file', 'File']]
  return `${tabsHtml(tabs)}
    <div class="pane" id="pane-overview" role="tabpanel" aria-labelledby="tab-overview">
      <h3>Skills <span class="pill">${skills.length}</span></h3>${listLinks(skills, 'skills')}
      <h3>Agents <span class="pill">${agents.length}</span></h3>${listLinks(agents, 'agents')}
      <h3>Hooks <span class="pill">${hooks.length}</span></h3>
      <p class="note">${hooks.length ? esc(events.join(', ')) : 'No hooks.'}</p>
      <h3>MCP servers <span class="pill">${mcp.length}</span></h3>
      ${mcp.length ? `<ul class="mini">${mcp.map((m) => `<li><code>${esc(m.name)}</code></li>`).join('')}</ul>` : '<p class="note">No MCP servers.</p>'}
      <p class="note">Skills and agents follow the plugin switch. Plugin files are read-only.</p>
    </div>
    <div class="pane" id="pane-files" role="tabpanel" aria-labelledby="tab-files" hidden></div>
    <div class="pane" id="pane-file" role="tabpanel" aria-labelledby="tab-file" hidden>
      <div class="filebar"><code id="dr-file"></code></div>
      <textarea id="dr-txt" spellcheck="false" aria-label="File contents" placeholder="Pick a file in the Files tab." readonly></textarea>
    </div>`
}

function setTab(tab) {
  dr.tab = tab
  for (const b of $('dr-body').querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  for (const pane of $('dr-body').querySelectorAll('.pane')) pane.hidden = pane.id !== `pane-${tab}`
  if (tab === 'preview') $('pane-preview').innerHTML = previewHtml($('dr-txt').value, dr.file)
  if (tab === 'files') loadDir(dr.dir ?? dr.root)
  if (tab === 'backups') loadBackups()
}

function updateDirty() {
  const dirty = isDirty()
  const mark = $('dr-dirty')
  if (mark) mark.textContent = dirty ? '● unsaved' : ''
  const save = $('dr-save')
  if (save) save.disabled = !dirty || !dr.editable
}

function noteText(item) {
  if (item.kind === 'plugin') return ''
  if (item.readOnly) {
    return item.kind === 'skill' ? 'Plugin files are read-only. Use Copy to my skills to edit a copy in ~/.claude/skills.' : 'Plugin files are read-only.'
  }
  if (!dr.editable) return 'This file is shown read-only. Only .md, .json, and .txt files can be edited here.'
  return 'Save writes the file and a backup to ~/.claude/backups/storehouse/.'
}

async function loadFile(file, { main = false } = {}) {
  const item = drawerItem()
  if (!item) return
  const seq = ++dr.seq
  const txt = $('dr-txt')
  txt.value = 'Loading…'
  txt.readOnly = true
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(file)}`)
    if (seq !== dr.seq) return
    if (res.entries) throw new Error(`${file} is a folder`)
    dr.file = file
    dr.loaded = res.content ?? ''
    dr.stamp = res.stamp
    dr.editable = item.kind !== 'plugin' && !item.readOnly && !res.readOnly && (main || TEXT_EXT.test(file))
    txt.value = dr.loaded
    txt.readOnly = !dr.editable
  } catch (err) {
    if (seq !== dr.seq) return
    dr.file = file
    dr.loaded = ''
    dr.editable = false
    txt.value = `Could not read this file: ${err.message}`
  }
  $('dr-file').textContent = relTo(dr.root, dr.file)
  const back = $('dr-main')
  if (back) back.hidden = dr.file === dr.mainFile
  const note = $('dr-note')
  if (note) note.textContent = noteText(item)
  if (dr.tab === 'backups') loadBackups()
  showPath()
  updateDirty()
  if (dr.tab === 'preview') $('pane-preview').innerHTML = previewHtml(txt.value, dr.file)
}

async function loadDir(dir) {
  const pane = $('pane-files')
  if (!pane || !dir) return
  dr.dir = dir
  const seq = dr.seq
  pane.innerHTML = '<p class="note">Loading…</p>'
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(dir)}`)
    if (seq !== dr.seq || dr.dir !== dir) return
    const up = dir !== dr.root ? `<li><button type="button" class="btn-plain name" data-dact="dir" data-path="${esc(parentDir(dir))}">../</button><span class="note">up one folder</span></li>` : ''
    const rows = (res.entries ?? [])
      .map((e) => {
        const full = `${dir}/${e.name}`
        const act = e.type === 'dir' ? 'dir' : 'open-file'
        return `<li><button type="button" class="btn-plain name" data-dact="${act}" data-path="${esc(full)}">${esc(e.name)}${e.type === 'dir' ? '/' : ''}</button><span class="note">${e.type === 'dir' ? 'folder' : esc(fmtSize(e.size))}</span></li>`
      })
      .join('')
    pane.innerHTML = `<p class="note"><code>${esc(tilde(dir))}</code></p><ul class="mini">${up}${rows || '<li class="note">Empty folder.</li>'}</ul>`
  } catch (err) {
    pane.innerHTML = `<p class="note">${esc(`Could not list this folder: ${err.message}`)}</p>`
  }
}

async function loadBackups() {
  const box = $('pane-backups')
  const file = dr.file
  if (!box || !file) return
  const seq = dr.seq
  box.innerHTML = '<p class="note">Loading backups…</p>'
  try {
    const res = await get(`/api/backups?path=${encodeURIComponent(file)}`)
    if (seq !== dr.seq || dr.file !== file || dr.tab !== 'backups') return
    box.innerHTML = `<p class="note">Backups of <code>${esc(relTo(dr.root, file))}</code></p>${backupsListHtml(res.backups ?? [], 'data-dact="restore"', dr.editable, 'dr')}`
  } catch (err) {
    box.innerHTML = `<p class="note">${esc(`Could not list backups: ${err.message}`)}</p>`
  }
}

function backupsListHtml(list, attrs, canRestore, prefix) {
  if (!list.length) return '<p class="note">No backups for this file yet. Each save writes one.</p>'
  return `<ul class="mini">${list
    .map((b, i) => `<li><span class="when">${esc(b.time ? new Date(b.time).toLocaleString() : baseName(b.path))}</span><button type="button" class="btn" id="${prefix}-rs-${i}" ${attrs} data-path="${esc(b.path)}"${canRestore ? '' : ' disabled'}>Restore</button></li>`)
    .join('')}</ul><p class="note">Newest first.</p>`
}

function inline(text) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${part.slice(1, -1)}</code>`
      return part
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^\s]+?)\)(?=\s|$|[.,;:!?])/g, '$1 <span class="link">($2)</span>')
    })
    .join('')
}

function splitFront(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src)
  if (!m) return { meta: [], body: src }
  const meta = []
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line)
    if (kv) meta.push([kv[1], kv[2]])
    else if (meta.length && line.trim()) meta[meta.length - 1][1] += ` ${line.trim()}`
  }
  return { meta, body: src.slice(m[0].length) }
}

function markdown(body) {
  const lines = body.split(/\r?\n/)
  const out = []
  const blockStart = /^(```|#{1,3}\s|\s*[-*+]\s|\s*\d+[.)]\s)/
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      const code = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++])
      i++
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      out.push(`<h${h[1].length + 2}>${inline(esc(h[2]))}</h${h[1].length + 2}>`)
      i++
      continue
    }
    const listKind = /^\s*[-*+]\s+/.test(line) ? 'ul' : /^\s*\d+[.)]\s+/.test(line) ? 'ol' : null
    if (listKind) {
      const re = listKind === 'ul' ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/
      const lis = []
      while (i < lines.length && re.test(lines[i])) lis.push(`<li>${inline(esc(re.exec(lines[i++])[1]))}</li>`)
      out.push(`<${listKind}>${lis.join('')}</${listKind}>`)
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !blockStart.test(lines[i])) para.push(lines[i++])
    if (!para.length) para.push(lines[i++])
    out.push(`<p>${inline(esc(para.join(' ')))}</p>`)
  }
  return out.join('')
}

function previewHtml(src, file) {
  if (file && !/\.md(\.disabled)?$/i.test(file)) return `<pre><code>${esc(src)}</code></pre>`
  const { meta, body } = splitFront(src)
  const table = meta.length
    ? `<table class="fm"><tbody>${meta.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`
    : ''
  const html = markdown(body)
  return table + (html || '<p class="note">Nothing to preview.</p>')
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
    $('dr-txt').addEventListener('input', updateDirty)
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
    const discard = await ask({ title: 'Discard changes?', message: `You have unsaved edits in ${baseName(dr.file)}. Close and lose them?`, ok: 'Discard', danger: true })
    if (!discard) return
  }
  forceClose()
}

async function confirmLeaveFile() {
  if (!isDirty()) return true
  return ask({ title: 'Discard changes?', message: `You have unsaved edits in ${baseName(dr.file)}. Open another file and lose them?`, ok: 'Discard', danger: true })
}

async function guarded(name, fn) {
  const busy = `${dr.key}:${name}`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    await fn()
  } finally {
    pending.delete(busy)
  }
}

function saveFile() {
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

async function onDrawerClick(e) {
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
  if (act === 'star') return void starItem(item)
  if (act === 'copy') return void copyPath()
  if (act === 'uninstall') return void uninstallPlugin(item)
  if (act === 'plugin-toggle' && owner) return void toggle(owner)
  if (act === 'plugin-uninstall' && owner) return void uninstallPlugin(owner)
  if (act === 'plugin-open' && owner) return openDrawer(owner)
  if (act === 'save') return void saveFile()
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

const EFFORT = ['low', 'medium', 'high']
const FORM_KEYS = ['model', 'effortLevel', 'outputStyle', 'theme', 'autoMode', 'skipDangerousModePermissionPrompt']
const SWITCH_KEYS = ['autoMode', 'skipDangerousModePermissionPrompt']

function freshHookForm() {
  return { open: false, scope: 'global', event: 'PreToolUse', matcher: '*', command: '', error: '', invalid: '' }
}

function freshMcpForm() {
  return { open: false, scope: 'global', name: '', transport: 'stdio', command: '', args: '', url: '', env: '', error: '', invalid: '' }
}

const cfg = { hook: freshHookForm(), mcp: freshMcpForm(), stab: 'form', sform: null, sformMsg: '' }
const eds = {}
const bks = {}
const msgs = {}

async function busy(name, fn) {
  if (pending.has(name)) return
  pending.add(name)
  try {
    await fn()
  } finally {
    pending.delete(name)
  }
}

async function afterWrite() {
  await loadProjectFiles()
  try {
    await refresh()
  } catch {
    render()
  }
  loadActivity()
}

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function opt(value, label, current) {
  return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`
}

function invalidAttr(form, field) {
  return cfg[form].invalid === field ? ' aria-invalid="true"' : ''
}

function rowSwitch(item, label) {
  const sw = switchInfo(item)
  const text = item.enabled ? 'Switch off' : 'Switch on'
  return `<span class="sw-wrap">${sw.text ? `<span class="via" title="${esc(sw.title)}">${esc(sw.text)}</span>` : ''}<button type="button" class="sw" role="switch" data-act="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(`${text} ${label}`)}" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}></button></span>`
}

function cellSwitch(item, label) {
  if (item.plugin && !item.canToggle) {
    const sw = switchInfo(item)
    return `<span class="lead-ic" role="img" aria-label="${esc(sw.title)}" title="${esc(sw.title)}">${ICON.lock}</span>`
  }
  return rowSwitch(item, label)
}

function viaPlugin(item) {
  const name = pluginLabel(item.plugin)
  return `<span class="via-lock" title="${esc(`Follows the plugin ${name}. Switch or uninstall it on the Plugins page.`)}">${ICON.lock}<span>via plugin ${esc(name)}</span></span>`
}

function tableHtml(label, head, rows) {
  return `<div class="tbl"><table class="data" aria-label="${esc(label)}"><thead><tr>${head.map(([h, sr]) => `<th scope="col">${sr ? `<span class="sr">${esc(sr)}</span>` : esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
}

function pageBar(note, actions) {
  return `<div class="pagebar"><p class="note">${note}</p><div class="pb-a">${actions}</div></div>`
}

function addButton(name, label) {
  const open = cfg[name].open
  const id = name === 'hook' ? 'hf' : 'mf'
  return `<button type="button" class="btn${open ? '' : ' p'}" id="${id}-open" data-c="${id}-open" aria-expanded="${open}" aria-controls="${name}-form">${open ? 'Close form' : label}</button>`
}

function renderHooks() {
  const list = catalog.hook.filter(visible)
  const rows = list
    .map((h) => {
      const label = `${h.event} hook ${h.name}`
      const del = h.plugin ? '' : `<button type="button" class="btn danger ghost" data-act="del" aria-label="${esc(`Delete ${label}`)}">Delete</button>`
      const source = h.plugin ? viaPlugin(h) : `<span class="tags">${scopeTag(h.scope)}${h.parked ? '<span class="tag">parked</span>' : ''}<span class="src">${esc(h.parked ? '~/.claude/storehouse.json' : SETTINGS_FILE[h.file] ?? h.file)}</span></span>`
      return `<tr data-key="${esc(h.key)}" class="${[h.enabled ? '' : 'off', h.plugin ? 'locked' : ''].filter(Boolean).join(' ')}">
        <td data-label="On" class="sw-cell">${cellSwitch(h, label)}</td>
        <td data-label="Event" class="ev">${esc(h.event)}</td>
        <td data-label="Matcher"><code class="cchip">${esc(h.matcher)}</code></td>
        <td data-label="Command" class="wide"><button type="button" class="btn-plain cmd cchip" data-act="open" aria-label="${esc(`Show ${label}`)}">${esc(h.name || '(no command)')}</button></td>
        <td data-label="Source">${source}</td>
        <td class="end">${del}</td>
      </tr>`
    })
    .join('')
  const table = !catalog.hook.length
    ? empty('No hooks in ~/.claude/settings.json, .claude/settings.json, .claude/settings.local.json, or plugins.')
    : list.length
      ? tableHtml('Hooks', [['', 'On'], ['Event'], ['Matcher'], ['Command'], ['Source'], ['', 'Actions']], rows)
      : nothingMatches()
  const bar = pageBar(
    'Your own hooks can be switched and deleted. Off moves a hook into <code>~/.claude/storehouse.json</code> (parkedHooks); On puts it back. Plugin hooks follow their plugin.',
    `<button type="button" class="btn" data-go="settings">Edit settings files</button>${addButton('hook', 'Add hook')}`
  )
  $('p-hooks').innerHTML = `${bar}${hookFormHtml()}${table}`
}

function hookFormHtml() {
  const f = cfg.hook
  if (!f.open) return ''
  return `<form class="form" id="hook-form" novalidate aria-labelledby="hf-title">
    <div class="form-head"><h3 id="hf-title">Add hook</h3><p class="note">Writes the hook into the settings file you pick. A backup is made first.</p></div>
    <label for="hf-scope">Scope</label>
    <select id="hf-scope" data-f="hook.scope">${opt('global', 'Global · ~/.claude/settings.json', f.scope)}${projectOn() ? opt('project', 'Project · .claude/settings.json', f.scope) : ''}</select>
    <label for="hf-event">Event</label>
    <select id="hf-event" data-f="hook.event">${HOOK_EVENTS.map((e) => opt(e, e, f.event)).join('')}</select>
    <label for="hf-matcher">Matcher</label>
    <input id="hf-matcher" data-f="hook.matcher" value="${esc(f.matcher)}" placeholder="* or Bash or Edit|Write" autocomplete="off" spellcheck="false">
    <label for="hf-command">Command (required)</label>
    <input id="hf-command" data-f="hook.command" value="${esc(f.command)}" placeholder="~/.claude/hooks/my-hook.sh" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="hf-err"${invalidAttr('hook', 'command')}>
    <div class="form-actions"><button type="submit" class="btn p" id="hf-save">Save hook</button><button type="button" class="btn" id="hf-cancel" data-c="hf-cancel">Cancel</button></div>
    <p class="form-err" id="hf-err" role="alert">${esc(f.error)}</p>
  </form>`
}

function formFail(form, field, message, focusId) {
  cfg[form].error = message
  cfg[form].invalid = field
  render()
  $(focusId)?.focus()
}

function submitHook() {
  return busy('hook-add', async () => {
    const f = cfg.hook
    f.error = ''
    f.invalid = ''
    const command = f.command.trim()
    if (!command) return formFail('hook', 'command', 'Enter the command the hook runs.', 'hf-command')
    try {
      const res = await send('POST', '/api/hook', { scope: f.scope, event: f.event, matcher: f.matcher.trim(), command })
      cfg.hook = freshHookForm()
      toast(`Added ${f.event} hook · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
      $('hf-open')?.focus()
    } catch (err) {
      formFail('hook', '', `Could not add the hook: ${err.message}`, 'hf-save')
    }
  })
}

function renderMcp() {
  const list = catalog.mcp.filter(visible)
  const rows = list
    .map((m) => {
      const label = `MCP server ${m.name}`
      const keys = [...Object.keys(isPlain(m.config?.env) ? m.config.env : {}), ...Object.keys(isPlain(m.config?.headers) ? m.config.headers : {})]
      const canDelete = !m.plugin && ['user', 'local', 'mcpjson'].includes(m.origin)
      const del = canDelete ? `<button type="button" class="btn danger ghost" data-act="del" aria-label="${esc(`Delete ${label}`)}">Delete</button>` : ''
      const source = m.plugin ? viaPlugin(m) : `<span class="tags">${scopeTag(m.scope)}<span class="src">${esc(m.source)}</span></span>`
      return `<tr data-key="${esc(m.key)}" class="${[m.enabled ? '' : 'off', m.plugin ? 'locked' : ''].filter(Boolean).join(' ')}">
        <td data-label="On" class="sw-cell">${cellSwitch(m, label)}</td>
        <td data-label="Name"><button type="button" class="btn-plain cmd" data-act="open" aria-label="${esc(`Show ${label}`)}">${esc(m.name)}</button></td>
        <td data-label="Transport"><span class="mchip">${esc(m.transport)}</span></td>
        <td data-label="Command / URL" class="wide"><code class="cchip">${esc(m.command ?? m.url ?? '')}</code>${keys.length ? `<div class="note">${esc(`${m.config?.headers ? 'keys' : 'env'}: ${keys.join(', ')}`)}</div>` : ''}</td>
        <td data-label="Source">${source}</td>
        <td class="end">${del}</td>
      </tr>`
    })
    .join('')
  const table = !catalog.mcp.length
    ? empty('No MCP servers in ~/.claude.json, .mcp.json, or plugins.')
    : list.length
      ? tableHtml('MCP servers', [['', 'On'], ['Name'], ['Transport'], ['Command / URL'], ['Source'], ['', 'Actions']], rows)
      : nothingMatches()
  const bar = pageBar(
    'Global servers live in <code>~/.claude.json</code>. Project servers live in <code>./.mcp.json</code>. Plugin servers follow their plugin and cannot be deleted here. Changes apply at the next Claude Code session.',
    addButton('mcp', 'Add MCP server')
  )
  $('p-mcp').innerHTML = `${bar}${mcpFormHtml()}${table}`
}

function mcpFormHtml() {
  const f = cfg.mcp
  if (!f.open) return ''
  const stdio = f.transport === 'stdio'
  const target = stdio
    ? `<label for="mf-command">Command (required)</label>
    <input id="mf-command" data-f="mcp.command" value="${esc(f.command)}" placeholder="npx" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="mf-err"${invalidAttr('mcp', 'command')}>
    <label for="mf-args">Arguments</label>
    <input id="mf-args" data-f="mcp.args" value="${esc(f.args)}" placeholder="-y @modelcontextprotocol/server-github" autocomplete="off" spellcheck="false">
    <label for="mf-env">Env (KEY=VALUE per line)</label>
    <textarea id="mf-env" data-f="mcp.env" rows="3" spellcheck="false" placeholder="GITHUB_TOKEN=..." aria-describedby="mf-err"${invalidAttr('mcp', 'env')}>\n${esc(f.env)}</textarea>`
    : `<label for="mf-url">URL (required)</label>
    <input id="mf-url" data-f="mcp.url" value="${esc(f.url)}" placeholder="https://example.com/mcp" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="mf-err"${invalidAttr('mcp', 'url')}>`
  return `<form class="form" id="mcp-form" novalidate aria-labelledby="mf-title">
    <div class="form-head"><h3 id="mf-title">Add MCP server</h3><p class="note">Global writes <code>~/.claude.json</code>. Project writes <code>./.mcp.json</code>. A backup is made first.</p></div>
    <label for="mf-scope">Scope</label>
    <select id="mf-scope" data-f="mcp.scope">${opt('global', 'Global · ~/.claude.json', f.scope)}${projectOn() ? opt('project', 'Project · .mcp.json', f.scope) : ''}</select>
    <label for="mf-name">Name (required)</label>
    <input id="mf-name" data-f="mcp.name" value="${esc(f.name)}" placeholder="github" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="mf-err"${invalidAttr('mcp', 'name')}>
    <label for="mf-transport">Transport</label>
    <select id="mf-transport" data-f="mcp.transport">${['stdio', 'http', 'sse'].map((t) => opt(t, t, f.transport)).join('')}</select>
    ${target}
    <div class="form-actions"><button type="submit" class="btn p" id="mf-save">Save server</button><button type="button" class="btn" id="mf-cancel" data-c="mf-cancel">Cancel</button></div>
    <p class="form-err" id="mf-err" role="alert">${esc(f.error)}</p>
  </form>`
}

function parseEnv(text) {
  const env = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!m) return { error: `"${line}" is not KEY=VALUE.` }
    env[m[1]] = m[2]
  }
  return { env }
}

function submitMcp() {
  return busy('mcp-add', async () => {
    const f = cfg.mcp
    f.error = ''
    f.invalid = ''
    const name = f.name.trim()
    if (!name) return formFail('mcp', 'name', 'Enter a server name.', 'mf-name')
    if (!/^[A-Za-z0-9_.@-]+$/.test(name)) return formFail('mcp', 'name', 'Use only letters, digits, dot, dash, at, or underscore in the name.', 'mf-name')
    let config
    if (f.transport === 'stdio') {
      const command = f.command.trim()
      if (!command) return formFail('mcp', 'command', 'Enter the command that starts the server.', 'mf-command')
      const parsed = parseEnv(f.env)
      if (parsed.error) return formFail('mcp', 'env', parsed.error, 'mf-env')
      config = { type: 'stdio', command }
      const args = f.args.trim() ? f.args.trim().split(/\s+/) : []
      if (args.length) config.args = args
      if (Object.keys(parsed.env).length) config.env = parsed.env
    } else {
      const url = f.url.trim()
      if (!/^https?:\/\/\S+$/.test(url)) return formFail('mcp', 'url', 'Enter a URL that starts with http:// or https://.', 'mf-url')
      config = { type: f.transport, url }
    }
    try {
      const res = await send('POST', '/api/mcp', { scope: f.scope, name, config })
      cfg.mcp = freshMcpForm()
      toast(`Added MCP server ${name} · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
      $('mf-open')?.focus()
    } catch (err) {
      formFail('mcp', err.status === 409 ? 'name' : '', `Could not add the server: ${err.message}`, err.status === 409 ? 'mf-name' : 'mf-save')
    }
  })
}

function deleteRow(item) {
  if (item.kind !== 'hook' && item.kind !== 'mcp') return
  return busy(`del:${item.key}`, async () => {
    const hook = item.kind === 'hook'
    const where = hook && item.parked ? '~/.claude/storehouse.json' : tilde(item.path)
    const yes = await ask({
      title: hook ? `Delete ${item.event} hook?` : `Delete MCP server ${item.name}?`,
      message: `${hook ? item.command : item.name} is removed from ${where}. A backup of the file is written first.`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = hook
        ? await send('DELETE', '/api/hook', { id: item.id })
        : await send('DELETE', '/api/mcp', { scope: item.scope, name: item.name, origin: item.origin })
      toast(`Deleted ${hook ? `${item.event} hook` : `MCP server ${item.name}`} · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
    } catch (err) {
      toast(`Could not delete: ${err.message}`, true)
    }
  })
}

function jsonBodyHtml(item) {
  let json
  let note
  if (item.kind === 'hook') {
    const hook = { type: item.type ?? 'command', command: item.command }
    if (item.timeout !== undefined) hook.timeout = item.timeout
    json = { [item.event]: [{ matcher: item.matcher, hooks: [hook] }] }
    note = item.plugin
      ? `Read-only. This hook comes from the plugin ${pluginLabel(item.plugin)} and follows its switch.`
      : item.parked
        ? `Read-only. This hook is parked in ~/.claude/storehouse.json. Switch it on to put it back in ${SETTINGS_FILE[item.file] ?? item.file}.`
        : `Read-only here. Switch it on the Hooks page, or edit ${SETTINGS_FILE[item.file] ?? item.file} on the Settings page.`
  } else {
    json = { [item.name]: item.config }
    note = 'Read-only. Env and header values are hidden. Open the file to see them.'
  }
  return `<div class="pane" id="pane-json" role="region" aria-label="JSON">
      <pre class="md json"><code>${esc(JSON.stringify(json, null, 2))}</code></pre>
      <p class="note">${esc(note)}</p>
    </div>`
}

function cfgPanels() {
  const inv = state.inventory
  const s = inv.settings ?? {}
  const m = inv.claudeMd ?? {}
  return {
    sg: { info: s.global, label: 'Global', file: '~/.claude/settings.json' },
    sp: { info: s.project, label: 'Project', file: '.claude/settings.json', create: 'projectSettings', del: true },
    sl: { info: s.projectLocal, label: 'Project local', file: '.claude/settings.local.json', create: 'projectSettingsLocal', del: true, pill: 'git-ignored' },
    mg: { info: m.global, label: 'Global', file: '~/.claude/CLAUDE.md', create: 'globalClaudemd', md: true, del: true },
    mp: { info: m.project, label: 'Project', file: './CLAUDE.md', create: 'claudemd', md: true, del: true },
    ml: { info: m.projectLocal, label: 'Project local', file: './CLAUDE.local.md', create: 'claudemdLocal', md: true, del: true, pill: 'git-ignored' },
    mc: { info: m.projectClaudeDir, label: 'Project .claude folder', file: './.claude/CLAUDE.md', create: 'claudemdClaudeDir', md: true, del: true }
  }
}

function edDirty(ed) {
  return Boolean(ed && ed.status === 'ready' && ed.text !== ed.loaded)
}

function sformBase() {
  const d = state.inventory.settings?.global?.data
  const data = isPlain(d) ? d : {}
  const text = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v))
  return {
    model: text(data.model),
    effortLevel: text(data.effortLevel),
    outputStyle: text(data.outputStyle),
    theme: text(data.theme),
    autoMode: data.autoMode === true,
    skipDangerousModePermissionPrompt: data.skipDangerousModePermissionPrompt === true
  }
}

function lockedKeys() {
  const d = state.inventory.settings?.global?.data
  if (!isPlain(d)) return []
  return FORM_KEYS.filter((k) => d[k] !== undefined && typeof d[k] !== (SWITCH_KEYS.includes(k) ? 'boolean' : 'string'))
}

function lockedText(value) {
  if (Array.isArray(value)) return `list of ${value.length}`
  if (isPlain(value)) return `object with ${Object.keys(value).length} keys`
  return `${typeof value} ${JSON.stringify(value)}`
}

function formValue(value) {
  return typeof value === 'string' ? value.trim() : value
}

function sformValues() {
  return cfg.sform ? cfg.sform.values : sformBase()
}

function sformDirtyKeys() {
  if (!cfg.sform) return []
  const locked = lockedKeys()
  return FORM_KEYS.filter((k) => !locked.includes(k) && formValue(cfg.sform.values[k]) !== formValue(cfg.sform.base[k]))
}

function sformEdit(key, value) {
  if (!cfg.sform) {
    const base = sformBase()
    cfg.sform = { base, values: { ...base } }
  }
  cfg.sform.values[key] = value
}

function cfgDirty() {
  return sformDirtyKeys().length > 0 || Object.values(eds).some(edDirty)
}

function markStale() {
  for (const ed of Object.values(eds)) if (!edDirty(ed)) ed.stale = true
}

function ensureEd(k, file) {
  let ed = eds[k]
  if (ed && ed.path !== file) {
    delete eds[k]
    ed = null
  }
  if (ed && (!ed.stale || ed.fetching)) return
  if (!ed) {
    ed = { path: file, status: 'loading', text: '', loaded: '', editing: false, preview: false, stale: false, fetching: false }
    eds[k] = ed
  }
  ed.fetching = true
  get(`/api/file?path=${encodeURIComponent(file)}`)
    .then((res) => {
      if (eds[k] !== ed) return
      ed.fetching = false
      ed.stale = false
      const content = res.content ?? ''
      if (edDirty(ed)) return
      ed.stamp = res.stamp
      if (ed.status === 'ready' && ed.loaded === content) return
      ed.loaded = ed.text = content
      ed.status = 'ready'
      if (isCfgPage()) render()
    })
    .catch((err) => {
      if (eds[k] !== ed) return
      ed.fetching = false
      ed.stale = false
      if (ed.status === 'ready') return
      ed.status = 'error'
      ed.error = err.message
      if (isCfgPage()) render()
    })
}

function isCfgPage() {
  return state.page === 'settings' || state.page === 'claudemd'
}

function dropMissing(k) {
  if (!edDirty(eds[k])) delete eds[k]
}

function msgHtml(k) {
  return `<p class="form-err" id="${k}-err" role="alert">${esc(msgs[k] ?? '')}</p>`
}

function backupsBtn(k) {
  const open = Boolean(bks[k]?.open)
  return `<button type="button" class="btn" id="${k}-bk" data-c="backups" data-k="${k}" aria-expanded="${open}" aria-controls="${k}-bkbox">Backups</button>`
}

function panelBackupsHtml(k) {
  const b = bks[k]
  if (!b?.open) return ''
  const inner = b.loading
    ? '<p class="note">Loading backups…</p>'
    : b.error
      ? `<p class="note">${esc(`Could not list backups: ${b.error}`)}</p>`
      : backupsListHtml(b.list, `data-c="restore" data-k="${k}"`, true, k)
  return `<div class="backups" id="${k}-bkbox">${inner}</div>`
}

function panelHead(k, p) {
  const info = p.info
  const size = p.md && info?.exists ? `<span class="pill">${esc(fmtSize(info.size))}</span>` : ''
  const pill = p.pill ? `<span class="pill">${esc(p.pill)}</span>` : ''
  return `<h2 id="${k}-h">${esc(p.label)} · <code>${esc(p.file)}</code>${size}${pill}</h2>`
}

function editorHtml(k, p) {
  const ed = eds[k]
  if (!ed || ed.status === 'loading') return '<p class="note">Loading…</p>'
  if (ed.status === 'error') return `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
  const dirty = edDirty(ed)
  const btns = [
    `<button type="button" class="btn p" id="${k}-save" data-c="save" data-k="${k}"${dirty ? '' : ' disabled'}>Save</button>`,
    `<span class="dirty" id="${k}-dirty" aria-live="polite">${dirty ? '● unsaved' : ''}</span>`,
    backupsBtn(k)
  ]
  if (p.del) btns.push(`<button type="button" class="btn danger x" id="${k}-del" data-c="delete" data-k="${k}">Delete file</button>`)
  const area = `<textarea id="${k}-txt" class="ed code" data-ed="${k}" spellcheck="false" aria-label="${esc(`${p.file} contents`)}">\n${esc(ed.text)}</textarea>`
  return `${area}<div class="row">${btns.join('')}</div>${panelBackupsHtml(k)}${msgHtml(k)}`
}

function edChrome(k) {
  const ed = eds[k]
  const dirty = edDirty(ed)
  const md = MD_ORDER.includes(k)
  const mark = $(`${k}-dirty`)
  if (mark) mark.textContent = md ? (dirty ? '● Unsaved changes' : `${plural(lineCount(ed?.text ?? ''), 'line')} · Saved`) : dirty ? '● unsaved' : ''
  if (mark && md) mark.classList.toggle('is-dirty', dirty)
  const save = $(`${k}-save`)
  if (save) save.disabled = !dirty
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = dirty ? '● unsaved' : ''
  const cancel = md ? $(`${k}-cancel`) : null
  if (cancel) cancel.hidden = !dirty
}

function sformChrome() {
  const dirty = sformDirtyKeys().length > 0
  const mark = $('sg-fdirty')
  if (mark) mark.textContent = dirty ? '● unsaved' : ''
  for (const id of ['sg-fsave', 'sg-freset']) {
    const b = $(id)
    if (b) b.disabled = !dirty
  }
}

function managedHtml(data) {
  const size = (v) => (Array.isArray(v) ? v.length : isPlain(v) ? Object.keys(v).length : 0)
  const rows = []
  const perms = isPlain(data.permissions) ? data.permissions : null
  if (perms) {
    for (const key of ['allow', 'deny', 'ask']) {
      if (perms[key] !== undefined) rows.push([`permissions.${key}`, `${size(perms[key])} rules`])
    }
  }
  if (data.enabledPlugins !== undefined) rows.push(['enabledPlugins', `${size(data.enabledPlugins)} entries — managed on Plugins page`])
  if (data.skillOverrides !== undefined) {
    const off = isPlain(data.skillOverrides) ? Object.values(data.skillOverrides).filter((v) => v === 'off').length : 0
    rows.push(['skillOverrides', `${off} off — managed on Skills page`])
  }
  if (data.hooks !== undefined) rows.push(['hooks', `${size(data.hooks)} events — managed on Hooks page`])
  const known = new Set([...FORM_KEYS, 'permissions', 'enabledPlugins', 'skillOverrides', 'hooks'])
  for (const key of Object.keys(data)) {
    if (!known.has(key)) rows.push([key, isPlain(data[key]) || Array.isArray(data[key]) ? `${size(data[key])} entries — edit in Raw JSON` : 'set — edit in Raw JSON'])
  }
  if (!rows.length) return '<p class="note">No other keys.</p>'
  return `<ul class="files">${rows.map(([k, v]) => `<li><code>${esc(k)}</code><span class="no">${esc(v)}</span></li>`).join('')}</ul>`
}

function settingsFormHtml(info) {
  const v = sformValues()
  const data = isPlain(info.data) ? info.data : {}
  const dirty = sformDirtyKeys().length > 0
  const effort = [['', '(not set)'], ...EFFORT.map((e) => [e, e])]
  for (const extra of [cfg.sform?.base.effortLevel, v.effortLevel]) {
    if (extra && !effort.some(([value]) => value === extra)) effort.push([extra, `${extra} (current)`])
  }
  const locked = lockedKeys()
  const lockedRow = (key) => `<span class="label">${key}</span><span class="note">${esc(`${lockedText(data[key])} — edit in Raw JSON`)}</span>`
  const text = (key, ph) =>
    locked.includes(key)
      ? lockedRow(key)
      : `<label for="sf-${key}">${key}</label><input id="sf-${key}" data-sf="${key}" value="${esc(v[key])}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`
  const sw = (key) =>
    locked.includes(key)
      ? lockedRow(key)
      : `<label for="sf-${key}">${key}</label><span><button type="button" class="sw" role="switch" id="sf-${key}" data-c="sfsw" data-v="${key}" aria-checked="${v[key] ? 'true' : 'false'}"></button></span>`
  return `<div class="kv">
      ${text('model', 'not set')}
      ${locked.includes('effortLevel') ? lockedRow('effortLevel') : `<label for="sf-effortLevel">effortLevel</label><select id="sf-effortLevel" data-sf="effortLevel">${effort.map(([value, label]) => opt(value, label, v.effortLevel)).join('')}</select>`}
      ${text('outputStyle', 'not set')}
      ${text('theme', 'not set')}
      ${SWITCH_KEYS.map(sw).join('')}
    </div>
    <div class="row">
      <button type="button" class="btn p" id="sg-fsave" data-c="fsave"${dirty ? '' : ' disabled'}>Save</button>
      <button type="button" class="btn" id="sg-freset" data-c="freset"${dirty ? '' : ' disabled'}>Reset</button>
      <span class="dirty" id="sg-fdirty" aria-live="polite">${dirty ? '● unsaved' : ''}</span>
      ${backupsBtn('sg')}
    </div>
    ${panelBackupsHtml('sg')}
    <p class="form-err" id="sg-ferr" role="alert">${esc(cfg.sformMsg)}</p>
    <h3>Other keys</h3>
    ${managedHtml(data)}`
}

function settingsGlobalHtml(p) {
  const info = p.info
  const head = panelHead('sg', p)
  if (!info) return `${head}<div class="warn">This file could not be scanned.</div>`
  const broken = info.exists && !info.ok
  const tab = broken ? 'raw' : cfg.stab
  const tabs = broken
    ? ''
    : `<div class="row"><div class="tabs" role="tablist" aria-label="Global settings view">${[['form', 'Form'], ['raw', 'Raw JSON']]
        .map(([value, label]) => `<button type="button" role="tab" id="sg-tab-${value}" data-c="stab" data-v="${value}" aria-selected="${tab === value}" aria-controls="sg-pane">${label}</button>`)
        .join('')}</div></div>`
  const warn = broken ? `<div class="warn">${esc(`Cannot parse ${p.file}: ${info.error}. Fix it below. The form comes back once the file parses.`)}</div>` : ''
  let body
  if (tab === 'form') body = settingsFormHtml(info)
  else if (!info.exists) body = '<p class="note">The file does not exist yet. Save the form to create it.</p>'
  else {
    ensureEd('sg', info.path)
    body = editorHtml('sg', p)
  }
  const label = broken ? 'aria-label="Raw JSON"' : `aria-labelledby="sg-tab-${tab}"`
  return `${head}${tabs}${warn}<div id="sg-pane" role="tabpanel" ${label}>${body}</div>`
}

function missingHtml(k, p) {
  dropMissing(k)
  const buttons = p.md
    ? `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="default">Create from template</button><button type="button" class="btn" id="${k}-ce" data-c="create" data-k="${k}" data-v="empty">Create empty</button>`
    : `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="empty">Create ${esc(p.file)}</button>`
  return `<div class="empty">No ${esc(p.file)} yet.<div class="row center">${buttons}</div></div>${msgHtml(k)}`
}

function panelHtml(k, p) {
  const info = p.info
  let body
  if (!info) body = '<div class="warn">This file could not be scanned.</div>'
  else if (!info.exists) body = missingHtml(k, p)
  else {
    ensureEd(k, info.path)
    const warn = !p.md && info.ok === false ? `<div class="warn">${esc(`Cannot parse ${p.file}: ${info.error}. Fix the JSON and save.`)}</div>` : ''
    body = warn + editorHtml(k, p)
  }
  return `<section class="panel" aria-labelledby="${k}-h">${panelHead(k, p)}${body}</section>`
}

function renderSettings() {
  const panels = cfgPanels()
  const project = projectOn() ? `${panelHtml('sp', panels.sp)}${panelHtml('sl', panels.sl)}` : projectOffHtml()
  $('p-settings').innerHTML = `<div class="two">
      <section class="panel" aria-labelledby="sg-h">${settingsGlobalHtml(panels.sg)}</section>
      <div>${project}</div>
    </div>`
}

const MD_ORDER = ['mg', 'mp', 'mc', 'ml']
const MD_WHERE = { mg: 'every project', mp: 'this folder · in git', mc: 'this folder · in git', ml: 'this folder · only you' }
const cmd = { sel: null }

function mdKeys() {
  return projectOn() ? MD_ORDER : ['mg']
}

function mdSelected(panels) {
  const keys = mdKeys()
  if (!cmd.sel || !keys.includes(cmd.sel)) cmd.sel = keys.find((k) => panels[k].info?.exists) ?? keys[0]
  return cmd.sel
}

function lineCount(text) {
  return text ? text.replace(/\r?\n$/, '').split(/\r?\n/).length : 0
}

function mdMeta(k, p) {
  const info = p.info
  if (!info) return 'Could not be scanned'
  if (!info.exists) return p.pill ? `Not found · ${p.pill}` : 'Not found'
  const ed = eds[k]
  const size = ed?.status === 'ready' ? plural(lineCount(ed.text), 'line') : fmtSize(info.size)
  return `${size} · ${MD_WHERE[k]}`
}

function mdListHtml(panels, sel) {
  let n = 0
  return mdKeys()
    .map((k) => {
      const p = panels[k]
      const exists = Boolean(p.info?.exists)
      if (exists) ensureEd(k, p.info.path)
      const num = exists ? ++n : 0
      const cur = k === sel
      const dirty = edDirty(eds[k])
      const create = p.info && !exists ? `<button type="button" class="btn" id="cm-create-${k}" data-c="create" data-k="${k}" data-v="default" aria-label="${esc(`Create ${p.file}`)}">Create</button>` : ''
      return `<li class="cm-file${cur ? ' cur' : ''}${exists ? '' : ' missing'}">
        <span class="cm-num" aria-hidden="true">${num || '–'}</span>
        <button type="button" class="cm-pick" id="cm-pick-${k}" data-c="pick" data-k="${k}"${cur ? ' aria-current="true"' : ''}>
          <span class="sr">${num ? `Read ${num}${['st', 'nd', 'rd'][num - 1] ?? 'th'}. ` : ''}</span>
          <span class="cm-label">${esc(p.label)}<span class="dirty" id="cm-dot-${k}">${dirty ? '● unsaved' : ''}</span></span>
          <span class="cm-path">${esc(p.file)}</span>
          <span class="cm-meta">${esc(mdMeta(k, p))}</span>
        </button>
        ${create}
      </li>`
    })
    .join('')
}

function mdPanelHtml(k, p) {
  const info = p.info
  const ed = info?.exists ? eds[k] : null
  const ready = ed?.status === 'ready'
  const editing = ready && ed.editing
  const pill = p.pill ? `<span class="pill">${esc(p.pill)}</span>` : ''
  const tabs = ready
    ? `<div class="tabs" role="tablist" aria-label="View">
        <button type="button" role="tab" id="${k}-pv" data-c="preview" data-k="${k}" aria-selected="${!editing}" aria-controls="${k}-pane">Preview</button>
        <button type="button" role="tab" id="${k}-edit" data-c="edit" data-k="${k}" aria-selected="${editing}" aria-controls="${k}-pane">Edit</button>
      </div>`
    : ''
  const head = `<div class="cm-head"><div class="cm-title"><h2 id="${k}-h">${esc(p.label)}${pill}</h2><code class="cm-path">${esc(info ? tilde(info.path) : p.file)}</code></div>${tabs}</div>`
  let body
  let bar = ''
  if (!info) body = '<div class="warn">This file could not be scanned.</div>'
  else if (!info.exists) body = missingHtml(k, p)
  else if (!ed || ed.status === 'loading') body = '<p class="note">Loading…</p>'
  else if (ed.status === 'error') body = `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
  else {
    const dirty = edDirty(ed)
    const pane = editing
      ? `<div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-edit"><textarea id="${k}-txt" class="ed" data-ed="${k}" spellcheck="false" aria-label="${esc(`${p.file} contents`)}">\n${esc(ed.text)}</textarea></div>`
      : `<div class="cm-pane md" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-pv" tabindex="0">${previewHtml(ed.text, info.path)}</div>`
    body = `${msgHtml(k)}${pane}${panelBackupsHtml(k)}`
    bar = `<div class="cm-bar">
        <button type="button" class="btn danger ghost" id="${k}-del" data-c="delete" data-k="${k}">Delete…</button>
        <span class="cm-state${dirty ? ' is-dirty' : ''}" id="${k}-dirty" aria-live="polite">${dirty ? '● Unsaved changes' : `${esc(plural(lineCount(ed.text), 'line'))} · Saved`}</span>
        <button type="button" class="btn ghost" id="${k}-cancel" data-c="cancel" data-k="${k}"${dirty ? '' : ' hidden'}>Discard</button>
        ${backupsBtn(k)}
        <button type="button" class="btn" id="${k}-open" data-c="editor" data-k="${k}">Open in editor</button>
        <button type="button" class="btn p" id="${k}-save" data-c="save" data-k="${k}"${dirty ? '' : ' disabled'}>Save</button>
      </div>`
  }
  return `<section class="panel cm-panel" aria-labelledby="${k}-h">${head}<div class="cm-body">${body}</div>${bar}</section>`
}

function renderClaudeMd() {
  const panels = cfgPanels()
  const sel = mdSelected(panels)
  $('p-claudemd').innerHTML = `<p class="note cm-intro">Claude Code reads every file that exists here at the start of a session in this folder. Each save writes a backup to <code>~/.claude/backups/storehouse/</code> first.</p>
    <div class="cm">
      <nav class="cm-nav" aria-label="CLAUDE.md files">
        <ul class="cm-list">${mdListHtml(panels, sel)}</ul>
        <p class="note">The numbers show the read order. A later file can add to an earlier one.</p>
        ${projectOn() ? '' : projectOffHtml()}
      </nav>
      ${mdPanelHtml(sel, panels[sel])}
    </div>`
}

function mdDirtyKey() {
  return MD_ORDER.find((k) => edDirty(eds[k])) ?? null
}

async function discardMd(k) {
  const ed = eds[k]
  if (!edDirty(ed)) return true
  const yes = await ask({ title: 'Discard changes?', message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`, ok: 'Discard', danger: true })
  if (!yes) return false
  ed.text = ed.loaded
  ed.editing = false
  delete msgs[k]
  return true
}

async function pickMd(k) {
  if (!MD_ORDER.includes(k)) return false
  if (k === cmd.sel) return true
  const dirty = mdDirtyKey()
  if (dirty && !(await discardMd(dirty))) return false
  cmd.sel = k
  render()
  return true
}

function openCfgFile(k) {
  const info = cfgPanels()[k]?.info
  if (!info?.exists) return
  return busy(`open:${k}`, async () => {
    try {
      await send('POST', '/api/open', { path: info.path, app: 'editor' })
      toast(`Opened ${tilde(info.path)} in your editor`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

function onCfgInput(e) {
  const t = e.target
  if (t.dataset.ed) {
    const ed = eds[t.dataset.ed]
    if (ed) {
      ed.text = t.value
      edChrome(t.dataset.ed)
    }
    return
  }
  if (t.dataset.sf) {
    sformEdit(t.dataset.sf, t.value)
    sformChrome()
    return
  }
  if (t.dataset.f) {
    const [form, field] = t.dataset.f.split('.')
    if (!cfg[form] || !Object.hasOwn(cfg[form], field)) return
    cfg[form][field] = t.value
    if (field === 'transport') render()
  }
}

async function setSettingsTab(tab) {
  if (tab === cfg.stab) return
  if (tab === 'raw' && sformDirtyKeys().length) {
    const yes = await ask({ title: 'Discard form changes?', message: 'Raw JSON shows the file on disk. Your unsaved form changes are lost.', ok: 'Discard', danger: true })
    if (!yes) return
    cfg.sform = null
  }
  if (tab === 'form' && edDirty(eds.sg)) {
    const yes = await ask({ title: 'Discard JSON changes?', message: 'The form shows the file on disk. Your unsaved Raw JSON edits are lost.', ok: 'Discard', danger: true })
    if (!yes) return
    eds.sg.text = eds.sg.loaded
  }
  cfg.stab = tab
  cfg.sformMsg = ''
  render()
  $(`sg-tab-${tab}`)?.focus()
}

function saveSettingsForm() {
  return busy('sform', async () => {
    const info = state.inventory.settings?.global
    const keys = sformDirtyKeys()
    if (!keys.length || !info) return
    cfg.sformMsg = ''
    try {
      let data = {}
      let stamp = null
      try {
        const res = await get(`/api/file?path=${encodeURIComponent(info.path)}`)
        stamp = res.stamp
        try {
          data = JSON.parse(res.content ?? '')
        } catch (err) {
          throw new Error(`${tilde(info.path)} does not parse: ${err.message}. Fix it in Raw JSON.`)
        }
      } catch (err) {
        if (err.status !== 404) throw err
      }
      if (!isPlain(data)) throw new Error(`${tilde(info.path)} does not hold a JSON object.`)
      for (const key of keys) {
        const value = formValue(cfg.sform.values[key])
        if (typeof value === 'boolean') data[key] = value
        else if (value === '') delete data[key]
        else data[key] = value
      }
      await send('PUT', '/api/file', { path: info.path, content: `${JSON.stringify(data, null, 2)}\n`, stamp })
      cfg.sform = null
      toast(`Saved ${keys.join(', ')} · wrote ${tilde(info.path)}`)
      showBanner()
      await afterWrite()
      $(`sf-${keys[0]}`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        cfg.sformMsg = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(info.path)) {
          cfg.sform = null
          cfg.sformMsg = ''
          await afterWrite()
        }
        return
      }
      cfg.sformMsg = `Could not save: ${err.message}`
      render()
    }
  })
}

function saveEd(k) {
  return busy(`save:${k}`, async () => {
    const ed = eds[k]
    const p = cfgPanels()[k]
    if (!ed || !p?.info || !edDirty(ed)) return
    const sent = ed.text
    delete msgs[k]
    try {
      const res = await send('PUT', '/api/file', { path: p.info.path, content: sent, stamp: ed.stamp ?? null })
      ed.loaded = res.content
      ed.stamp = res.stamp
      if (ed.text === sent) ed.text = res.content
      if (k === 'sg') cfg.sform = null
      toast(`Saved ${tilde(p.info.path)} · backup written`)
      await afterWrite()
      $(p.md && !ed.editing ? `${k}-edit` : `${k}-txt`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        msgs[k] = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(p.info.path)) {
          ed.text = ed.loaded
          ed.editing = false
          ed.stale = true
          delete msgs[k]
          if (k === 'sg') cfg.sform = null
          await afterWrite()
        }
        return
      }
      msgs[k] = `Could not save ${p.file}: ${err.message}`
      render()
    }
  })
}

async function cancelEd(k) {
  const ed = eds[k]
  if (!ed) return
  if (edDirty(ed)) {
    const yes = await ask({ title: 'Discard changes?', message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`, ok: 'Discard', danger: true })
    if (!yes) return
  }
  ed.text = ed.loaded
  ed.editing = false
  delete msgs[k]
  render()
  $(`${k}-edit`)?.focus()
}

function createPanel(k, template) {
  return busy(`create:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info || !p.create) return
    delete msgs[k]
    try {
      const { file } = await send('POST', '/api/create', { what: p.create, template })
      delete eds[k]
      delete bks[k]
      toast(`Created ${tilde(file)}`)
      await afterWrite()
      const target = p.md ? `${k}-edit` : `${k}-txt`
      await waitFor(() => $(target))
      $(target)?.focus()
    } catch (err) {
      msgs[k] = `Could not create ${p.file}: ${err.message}`
      render()
    }
  })
}

async function waitFor(check) {
  for (let i = 0; i < 20 && !check(); i++) await new Promise((r) => setTimeout(r, 50))
}

function deletePanel(k) {
  return busy(`delete:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info?.exists) return
    const yes = await ask({
      title: `Delete ${p.file}?`,
      message: `${tilde(p.info.path)} moves to ~/.claude/backups/storehouse/trash. You can move it back from there.${edDirty(eds[k]) ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('DELETE', '/api/file', { path: p.info.path })
      delete eds[k]
      delete bks[k]
      delete msgs[k]
      toast(`Deleted ${tilde(p.info.path)} · moved to ${tilde(res.trashPath ?? 'trash')}`)
      await afterWrite()
      $(`${k}-ct`)?.focus()
    } catch (err) {
      msgs[k] = `Could not delete ${p.file}: ${err.message}`
      render()
    }
  })
}

async function togglePanelBackups(k) {
  const p = cfgPanels()[k]
  if (!p?.info) return
  if (bks[k]?.open) {
    delete bks[k]
    render()
    return
  }
  const box = { open: true, loading: true, list: [], error: '' }
  bks[k] = box
  render()
  try {
    const res = await get(`/api/backups?path=${encodeURIComponent(p.info.path)}`)
    box.list = res.backups ?? []
  } catch (err) {
    box.error = err.message
  }
  box.loading = false
  if (bks[k] === box) render()
}

function restorePanel(k, backup) {
  return busy(`restore:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info) return
    const dirty = edDirty(eds[k]) || (k === 'sg' && sformDirtyKeys().length > 0)
    const yes = await ask({
      title: 'Restore this backup?',
      message: `${tilde(p.info.path)} is replaced with the backup. The current file is backed up first.${dirty ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Restore',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('POST', '/api/restore', { backup, path: p.info.path })
      const ed = eds[k]
      if (ed) {
        ed.loaded = ed.text = res.content
        ed.stamp = res.stamp
        ed.status = 'ready'
      }
      if (k === 'sg') cfg.sform = null
      delete bks[k]
      delete msgs[k]
      toast(`Restored ${tilde(p.info.path)} from backup`)
      await afterWrite()
      $(`${k}-bk`)?.focus()
    } catch (err) {
      msgs[k] = `Could not restore: ${err.message}`
      if (k === 'sg' && cfg.stab === 'form') cfg.sformMsg = msgs[k]
      render()
    }
  })
}

function closeForm(name) {
  cfg[name] = name === 'hook' ? freshHookForm() : freshMcpForm()
  render()
  $(name === 'hook' ? 'hf-open' : 'mf-open')?.focus()
}

function onCfg(el) {
  const act = el.dataset.c
  const k = el.dataset.k
  const v = el.dataset.v
  if (act === 'hf-open' || act === 'mf-open') {
    const name = act === 'hf-open' ? 'hook' : 'mcp'
    if (cfg[name].open) return closeForm(name)
    cfg[name].open = true
    render()
    $(name === 'hook' ? 'hf-scope' : 'mf-scope')?.focus()
    return
  }
  if (act === 'hf-cancel') return closeForm('hook')
  if (act === 'mf-cancel') return closeForm('mcp')
  if (act === 'stab') return void setSettingsTab(v)
  if (act === 'sfsw') {
    sformEdit(v, !sformValues()[v])
    render()
    return
  }
  if (act === 'fsave') return void saveSettingsForm()
  if (act === 'freset') {
    cfg.sform = null
    cfg.sformMsg = ''
    render()
    $('sf-model')?.focus()
    return
  }
  if (act === 'pick') {
    return void pickMd(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && MD_ORDER.includes(k) && k !== cmd.sel) {
    return void pickMd(k).then((ok) => ok && createPanel(k, v))
  }
  if (act === 'editor') return void openCfgFile(k)
  if (act === 'backups') return void togglePanelBackups(k)
  if (act === 'restore') return void restorePanel(k, el.dataset.path)
  if (act === 'save') return void saveEd(k)
  if (act === 'cancel') return void cancelEd(k)
  if (act === 'create') return void createPanel(k, v)
  if (act === 'delete') return void deletePanel(k)
  const ed = eds[k]
  if (!ed) return
  if (act === 'edit') {
    ed.editing = true
    ed.preview = false
    render()
    $(`${k}-txt`)?.focus()
  } else if (act === 'preview') {
    if (MD_ORDER.includes(k)) ed.editing = false
    else ed.preview = !ed.preview
    render()
  }
}

function reorder(fromKey, toKey, after) {
  const ids = state.inventory.favorites.map((f) => f.id)
  const from = ids.indexOf(fromKey)
  if (from < 0 || fromKey === toKey) return null
  ids.splice(from, 1)
  let to = ids.indexOf(toKey)
  if (to < 0) return null
  if (after) to += 1
  ids.splice(to, 0, fromKey)
  return ids
}

async function saveOrder(ids) {
  const byId = new Map(state.inventory.favorites.map((f) => [f.id, f]))
  state.inventory.favorites = ids.map((id) => byId.get(id))
  render()
  try {
    await send('PUT', '/api/favorites/order', { ids })
    toast('Saved order · ~/.claude/storehouse.json')
  } catch (err) {
    toast(`Could not save order: ${err.message}`, true)
  }
  await refresh().catch(() => {})
  loadActivity()
}

function renderActivity(entries) {
  $('act-toggle').textContent = `Activity (${entries.length})`
  const list = $('act')
  if (!entries.length) {
    list.innerHTML = '<li class="sub">No writes yet.</li>'
    return
  }
  list.innerHTML = entries
    .map(
      (e) => `<li data-entry="${esc(e.id)}"><b>${esc(e.message)}</b><code>${esc(tilde(e.file ?? '')).replace(/\//g, '/<wbr>')}</code>${e.canUndo ? `<button type="button" class="btn undo" data-undo="${esc(e.id)}" aria-label="Undo: ${esc(e.message)}">Undo</button>` : ''}</li>`
    )
    .join('')
}

export async function loadActivity() {
  try {
    const res = await get('/api/activity')
    renderActivity(res.entries ?? [])
  } catch (err) {
    $('act').innerHTML = `<li class="sub">${esc(`Could not load activity: ${err.message}`)}</li>`
  }
}

async function undo(id) {
  const busy = `undo:${id}`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    const res = await send('POST', '/api/undo', { entryId: id })
    toast(`Undone · ${tilde(res.file ?? res.entry?.file ?? '')}`)
    if (res.entry?.kind === 'toggle') showBanner()
    await refresh()
  } catch (err) {
    toast(`Could not undo: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    await loadActivity()
    const title = $('act-title')
    if (title.getClientRects().length) title.focus()
    else $('act-toggle').focus()
  }
}

function cardKey(el) {
  return holderKey(el.closest(HOLDER))
}

function wire() {
  $('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]')
    if (b) go(b.dataset.p)
  })
  $('scope').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]')
    if (!b) return
    state.scope = b.dataset.s
    render()
  })
  $('q').addEventListener('input', (e) => {
    clearTimeout(searchTimer)
    const value = e.target.value
    searchTimer = setTimeout(() => {
      state.query = value
      render()
    }, 120)
  })
  $('act').addEventListener('click', (e) => {
    const b = e.target.closest('[data-undo]')
    if (b) undo(b.dataset.undo)
  })
  $('banner-x').addEventListener('click', () => {
    bannerDismissed = true
    $('banner').hidden = true
  })
  $('dr-close').addEventListener('click', () => closeDrawer())
  $('dr-scrim').addEventListener('click', () => closeDrawer())
  $('dr').addEventListener('click', onDrawerClick)
  $('cf-no').addEventListener('click', () => confirmState?.done(false))
  $('cf-yes').addEventListener('click', () => confirmState?.done(true))
  $('act-toggle').addEventListener('click', () => {
    const open = $('act-box').classList.toggle('open')
    $('act-toggle').setAttribute('aria-expanded', String(open))
  })
  document.addEventListener('keydown', (e) => {
    if (confirmState) {
      if (e.key === 'Escape') {
        e.preventDefault()
        confirmState.done(false)
      } else if (e.key === 'Tab') trapTab(e, $('cf'))
      return
    }
    if (drawerOpen()) {
      if (dr.menu && e.key === 'Escape') {
        e.preventDefault()
        closeDrawerMenu(true)
        return
      }
      if (dr.menu && menuKeys(e)) return
      if (dr.menu && e.key === 'Tab') closeDrawerMenu(true)
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
      } else if (e.key === 'Tab') trapTab(e, $('dr'))
      else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveFile()
      }
      return
    }
    const panelKey = document.activeElement?.dataset?.ed
    if (panelKey && (e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      saveEd(panelKey)
      return
    }
    if (menuKey) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        return
      }
      if (menuKeys(e)) return
    }
    const tag = document.activeElement?.tagName
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      $('q').focus()
      $('q').select()
    }
  })
  window.addEventListener('hashchange', () => go(location.hash.slice(1)))
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() || cfgDirty()) e.preventDefault()
  })

  const main = document.querySelector('.main')
  main.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]')
    if (goEl) return go(goEl.dataset.go)
    const cfgEl = e.target.closest('[data-c]')
    if (cfgEl) {
      if (!cfgEl.disabled) onCfg(cfgEl)
      return
    }
    const chip = e.target.closest('[data-chip]')
    if (chip) {
      chipFilter[state.page] = chip.dataset.chip
      menuKey = null
      return render()
    }
    const grp = e.target.closest('[data-group]')
    if (grp) {
      groupOpen.set(grp.dataset.group, grp.getAttribute('aria-expanded') !== 'true')
      return render()
    }
    const act = e.target.closest('[data-act]')
    const key = cardKey(e.target)
    if (!key) return
    const name = act?.dataset.act
    if (name === 'menu') return openMenu(key, act.closest('[data-rows]')?.dataset.rows ?? '')
    if (act?.dataset.act === 'unfav') {
      const fav = state.inventory.favorites.find((f) => f.id === key)
      if (fav) star(fav.kind, fav.name, fav.source, false, fav.name)
      return
    }
    const item = items.get(key)
    if (!item) return
    if (act?.dataset.act === 'toggle') return void toggle(item)
    if (act?.dataset.act === 'star') return void starItem(item)
    if (act?.dataset.act === 'del') return void deleteRow(item)
    if (name === 'uninstall') return void uninstallPlugin(item)
    if (name?.startsWith('m-')) {
      closeMenu()
      if (name === 'm-open') return openDrawer(item)
      if (name === 'm-toggle') return void toggle(item)
      if (name === 'm-finder') return void reveal(item)
      if (name === 'm-uninstall') return void uninstallPlugin(item)
      return
    }
    if (act?.dataset.act === 'open' || !e.target.closest('button, a, input, .menu, .pnote')) openDrawer(item)
  })
  document.addEventListener('click', (e) => {
    if (menuKey && !e.target.closest('.menu, [data-act="menu"]')) closeMenu(false)
  })
  main.addEventListener('focusout', (e) => {
    if (!menuKey || !e.relatedTarget) return
    const holder = e.relatedTarget.closest?.(HOLDER)
    if (holder && holderKey(holder) === menuKey && e.relatedTarget.closest('.menu, [data-act="menu"]')) return
    setTimeout(() => closeMenu(false), 0)
  })

  main.addEventListener('input', onCfgInput)
  main.addEventListener('submit', (e) => {
    e.preventDefault()
    if (e.target.id === 'hook-form') submitHook()
    else if (e.target.id === 'mcp-form') submitMcp()
  })

  main.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.card[draggable="true"]')
    if (!card) return
    dragKey = card.dataset.key
    card.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', dragKey)
  })
  main.addEventListener('dragover', (e) => {
    if (!dragKey) return
    const card = e.target.closest('#favgrid .card')
    if (!card) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    for (const c of document.querySelectorAll('.drop-target')) if (c !== card) c.classList.remove('drop-target')
    card.classList.add('drop-target')
  })
  main.addEventListener('dragleave', (e) => {
    const card = e.target.closest?.('.card')
    if (card && !card.contains(e.relatedTarget)) card.classList.remove('drop-target')
  })
  main.addEventListener('drop', (e) => {
    if (!dragKey) return
    const card = e.target.closest('#favgrid .card')
    if (!card) return
    e.preventDefault()
    const rect = card.getBoundingClientRect()
    const after = e.clientX > rect.left + rect.width / 2
    const ids = reorder(dragKey, card.dataset.key ?? card.dataset.fav, after)
    dragKey = null
    if (ids) saveOrder(ids)
  })
  main.addEventListener('dragend', () => {
    dragKey = null
    for (const c of document.querySelectorAll('.dragging, .drop-target')) c.classList.remove('dragging', 'drop-target')
  })
}

async function start() {
  $('dr').inert = true
  wire()
  state.page = Object.hasOwn(PAGES, location.hash.slice(1)) ? location.hash.slice(1) : 'dash'
  try {
    await refresh()
    loadActivity()
    await loadProjectFiles()
    render()
  } catch (err) {
    const box = $('load-error')
    box.hidden = false
    box.textContent = `Could not load the inventory: ${err.message}. Open the link the CLI printed, which carries the token.`
  }
}

start()
