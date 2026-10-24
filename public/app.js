import { get, send } from './api.js'
import {
  askReload,
  deleteRow,
  guarded,
  loadProjectFiles,
  refresh,
  reveal,
  star,
  toggle,
  uninstallPlugin
} from './core/actions.js'
import {
  $,
  HOLDER,
  ask,
  cardKey,
  focusMark,
  focusRestore,
  holderKey,
  insertText,
  showBanner,
  toast,
  trapTab
} from './core/dom.js'
import {
  ago,
  baseName,
  compact,
  esc,
  fmtSize,
  isFolderSkill,
  parentDir,
  plural,
  relTo,
  shortVersion,
  tilde
} from './core/format.js'
import { ICON, kindIcon } from './core/icons.js'
import { chipFilter, dr, groupOpen, items, pending, state } from './core/state.js'
import {
  KIND_WORD,
  PAGES,
  SETTINGS_FILE,
  counts,
  favoriteEntries,
  hasSwitch,
  isPluginOwned,
  otherCounts,
  ownerId,
  ownerPlugin,
  pluginById,
  pluginLabel,
  switchInfo,
  visible
} from './logic/catalog.js'
import { cfgDirty, markStale, mdDirtyKey } from './logic/config.js'
import { contextItems, sumTokens } from './logic/context.js'
import { doctorIssues } from './logic/doctor.js'
import { duplicateGroups, needsAction } from './logic/duplicates.js'
import { HOOK_INFO, hookLabel, hookRunsFor } from './logic/hooks.js'
import { highlight, isMd, previewHtml } from './logic/markdown.js'
import { mcpTransport } from './logic/mcp.js'
import { USAGE_PAGES } from './logic/usage.js'
import { renderCatalog } from './pages/catalog.js'
import { discardMd, renderClaudeMd } from './pages/claudemd.js'
import { renderContext } from './pages/context.js'
import { needUsage, renderDash, setPeriod } from './pages/dash.js'
import { checkAgain, onDoctor, renderDoctor } from './pages/doctor.js'
import { keepOnly, renderDups } from './pages/dups.js'
import { cancelRename, onFavCat, placeFav, renderFav, saveOrder, submitNewCat, submitRename } from './pages/fav.js'
import { renderHooks, submitHook } from './pages/hooks.js'
import { renderMcp, submitMcp } from './pages/mcp.js'
import { renderSettings } from './pages/settings.js'
import { setSort, switchOffUnused } from './ui/chips.js'
import { onCfg, onCfgInput, saveEd } from './ui/config-panels.js'
import { closeFavPop, placeFavPop, starItem } from './ui/fav-popover.js'
import { menuEntries } from './ui/rows.js'

function menuButtonFor(key) {
  const page = document.querySelector('.page:not([hidden])')
  return page
    ? ([...page.querySelectorAll('[data-act="menu"]')].find(
        (b) => holderKey(b.closest(HOLDER)) === key && (b.closest('[data-rows]')?.dataset.rows ?? '') === state.menuCtx
      ) ?? null)
    : null
}

function closeMenu(refocus = true) {
  if (!state.menuKey) return
  const btn = refocus ? menuButtonFor(state.menuKey) : null
  state.menuKey = null
  if (btn) btn.focus({ preventScroll: true })
  render()
}

function openMenu(key, ctx = '') {
  state.menuKey = state.menuKey === key && state.menuCtx === ctx ? null : key
  state.menuCtx = ctx
  render()
  if (state.menuKey)
    document.querySelector('.page:not([hidden]) .menu [role="menuitem"]')?.focus({ preventScroll: true })
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

function renderNav() {
  const inv = state.inventory
  $('n-skills').textContent = counts(state.catalog.skill).total
  $('n-agents').textContent = counts(state.catalog.agent).total
  $('n-plugins').textContent = counts(state.catalog.plugin).total
  $('n-mods').textContent = counts(state.catalog.mod).total
  $('n-hooks').textContent = otherCounts(inv.hooks).total
  $('n-mcp').textContent = otherCounts(inv.mcp).total
  $('n-dups').textContent = duplicateGroups().filter(needsAction).length
  const docIssues = doctorIssues()
  $('n-doctor').textContent = docIssues.filter((i) => i.severity !== 'info').length
  $('n-doctor').classList.toggle(
    'bad',
    docIssues.some((i) => i.severity === 'error')
  )
  $('n-context').textContent = compact(sumTokens(contextItems().filter(visible)))
  $('n-fav').textContent = favoriteEntries().filter((e) => !e.item || visible(e.item)).length
  for (const b of document.querySelectorAll('#nav button')) {
    if (b.dataset.p === state.page) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  for (const b of document.querySelectorAll('#scope button'))
    b.setAttribute('aria-pressed', String(b.dataset.s === state.scope))
  const project = inv.project.dir ? `<code>${esc(tilde(inv.project.dir))}</code>` : 'off'
  $('ctx').innerHTML = `Project: ${project} · Global: <code>${esc(tilde(inv.global.dir))}</code>`
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
  if (USAGE_PAGES.has(page)) needUsage()
  if (page === 'dash') renderDash()
  else if (page === 'fav') renderFav()
  else if (page === 'dups') renderDups()
  else if (page === 'doctor') renderDoctor()
  else if (page === 'context') renderContext()
  else if (page === 'skills')
    renderCatalog(
      'skills',
      state.catalog.skill,
      'Off writes <code>"skillOverrides": {"name": "off"}</code> to <code>~/.claude/settings.json</code> (global) or <code>.claude/settings.local.json</code> (project). Plugin skills follow their plugin.'
    )
  else if (page === 'agents')
    renderCatalog(
      'agents',
      state.catalog.agent,
      'Claude Code has no off switch for agents. Off renames <code>name.md</code> to <code>name.md.disabled</code>. Plugin agents follow their plugin.'
    )
  else if (page === 'plugins')
    renderCatalog(
      'plugins',
      state.catalog.plugin,
      'The switch writes <code>enabledPlugins["name@marketplace"]</code>, the same as the <code>/plugin</code> menu.'
    )
  else if (page === 'mods')
    renderCatalog(
      'mods',
      state.catalog.mod,
      'A mod is a plugin with <code>"modules"</code> in <code>hooks/hooks.json</code>. The switch writes <code>enabledPlugins["name@marketplace"]</code>. Mods load only when <code>CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1</code> is set in your shell or settings <code>env</code>.'
    )
  else if (page === 'hooks') renderHooks()
  else if (page === 'mcp') renderMcp()
  else if (page === 'settings') renderSettings()
  else if (page === 'claudemd') renderClaudeMd()
}

function go(page) {
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

const PROJECT_OFF_NOTE = 'Started from your home folder — project scope is off. Run it inside a project folder.'

export function projectOffHtml() {
  return `<div class="warn" role="note">${esc(PROJECT_OFF_NOTE)}</div>`
}

const TEXT_EXT = /\.(md|json|txt)$/i

export function drawerOpen() {
  return $('dr').classList.contains('open')
}

function drawerItem() {
  return dr.key ? (items.get(dr.key) ?? null) : null
}

function isDirty() {
  const txt = $('dr-txt')
  return Boolean(drawerOpen() && txt && dr.editable && txt.value !== dr.loaded)
}

const LOCK_WORD = { skill: 'skill', agent: 'agent', hook: 'hook', mcp: 'MCP server' }

function drawerMetaHtml(item) {
  const parts = [`<b class="k">${esc(item.isMod ? 'Mod' : (KIND_WORD[item.kind] ?? item.kind))}</b>`]
  const add = (text, title) => parts.push(`<span${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`)
  if (item.kind === 'plugin') {
    add(item.dev ? 'in development' : item.source === 'plugin' ? item.scope : item.source)
    const version = pluginById(item.id)?.version ?? item.version
    if (version) add(shortVersion(version), version)
    if (item.modules?.length) add(plural(item.modules.length, 'module'), item.modules.join(', '))
    if (item.dev) add(`session ${item.session.slice(0, 8)}`, item.session)
  } else if (isPluginOwned(item)) {
    add(`via plugin ${pluginLabel(ownerId(item))}`)
  } else if (item.scope) {
    add(item.scope)
  }
  if (item.kind === 'agent') {
    if (item.model) add(item.model)
    if (item.tools?.length) add(plural(item.tools.length, 'tool'), item.tools.join(', '))
  }
  if (item.mtime) add(`changed ${ago(item.mtime)}`)
  return parts.join('<i aria-hidden="true"> · </i>')
}

function stateHtml(item) {
  if (hasSwitch(item)) {
    const sw = switchInfo(item)
    const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
    return `<button type="button" class="sw-pill" role="switch" data-dact="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" aria-describedby="dr-st-file" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}><span class="sw" aria-hidden="true"></span>${item.enabled ? 'On' : 'Off'}</button><span class="sr-only" id="dr-st-file">${esc(sw.title)}</span>`
  }
  if (item.missing) return '<span class="st-chip bad">Missing</span>'
  if (item.dev) return `<span class="st-chip" title="${esc(switchInfo(item).title)}">Read-only</span>`
  const owner = ownerPlugin(item)
  const on = owner ? owner.enabled : item.enabled !== false
  const title = owner ? ` title="${esc(`Follows the plugin ${owner.name}`)}"` : ''
  return `<span class="st-chip ${on ? 'on' : 'off'}"${title}>${on ? 'On' : 'Off'}</span>`
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
  const state = stateHtml(item)
  if (item.kind === 'hook' || item.kind === 'mcp') return state
  const starBtn = item.dev
    ? ''
    : `<button type="button" class="icon-btn star" data-dact="star" aria-haspopup="dialog" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>`
  const entries = drawerMenuEntries(item)
  if (!entries.length) return state + starBtn
  const menu = dr.menu
    ? `<div class="menu" role="menu" id="dr-menu" aria-label="${esc(`More actions for ${item.name}`)}">${entries
        .map(
          ([act, text, danger]) =>
            `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-dact="${act}">${esc(text)}</button>`
        )
        .join('')}</div>`
    : ''
  return `${state}${starBtn}<div class="dr-more"><button type="button" class="icon-btn" data-dact="menu" id="dr-menu-btn" aria-haspopup="menu" aria-expanded="${dr.menu ? 'true' : 'false'}"${dr.menu ? ' aria-controls="dr-menu"' : ''} aria-label="More actions">${ICON.dots}</button>${menu}</div>`
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

function noteHtml(item) {
  if (item.kind === 'plugin' && item.missing) {
    return `<div class="dr-note bad" role="note"><div class="lock-t">${ICON.warn}<p><b>Plugin folder missing.</b> ${esc(item.id)} is listed in installed_plugins.json, but its folder is gone. Remove the entry to clean up.</p></div></div>`
  }
  if (item.dev) {
    return `<div class="dr-note" role="note"><div class="lock-t">${ICON.lock}<p><b>Development mod.</b> It is not in installed_plugins.json, so it has no switch here.</p></div></div>`
  }
  return isPluginOwned(item) ? lockHtml(item) : ''
}

function pathHtml() {
  return `<div class="f-path"><code class="path"><bdo dir="ltr" id="dr-path"></bdo></code><button type="button" class="icon-btn sm" data-dact="copy" id="dr-copy" aria-label="Copy path">${ICON.copy}</button></div>`
}

function barHtml(item) {
  const finder = '<button type="button" class="btn" data-dact="finder">Reveal in Finder</button>'
  const editor = '<button type="button" class="btn p" data-dact="editor">Open in editor</button>'
  let left = ''
  let right = finder + editor
  if (item.kind === 'plugin' && item.dev) {
    left = ''
  } else if (item.kind === 'plugin') {
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
  if (!el || !$('dr').contains(el) || ($('dr-body').contains(el) && !$('dr-status')?.contains(el))) return null
  return el.dataset?.dact ?? null
}

function syncDrawerHead() {
  if (!drawerOpen()) return
  const item = drawerItem()
  if (!item) return forceClose()
  const focused = drawerFocusAct()
  $('dr').dataset.kind = item.kind
  $('dr-icon').innerHTML = kindIcon(item.kind)
  $('dr-name').textContent = drawerName(item)
  $('dr-meta').innerHTML = drawerMetaHtml(item)
  $('dr-tools').innerHTML = headTools(item)
  if ($('dr-desc')) $('dr-desc').textContent = item.description || 'No description.'
  if ($('dr-status')) $('dr-status').innerHTML = noteHtml(item)
  $('dr-facts').innerHTML = pathHtml()
  $('dr-bar').innerHTML = barHtml(item)
  if (focused)
    document
      .querySelector(
        `#dr .dr-top [data-dact="${focused}"], #dr-status [data-dact="${focused}"], #dr .dr-bar [data-dact="${focused}"]`
      )
      ?.focus()
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
  if (!box) return
  box.textContent = dr.file ? tilde(dr.file) : dr.root ? tilde(dr.root) : ''
  box.parentElement.title = box.textContent
}

function tabsHtml(tabs) {
  return `<div class="tabwrap"><div class="tabs" role="tablist" aria-label="Drawer views">${tabs
    .map(
      ([id, label]) =>
        `<button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="pane-${id}" aria-selected="${dr.tab === id ? 'true' : 'false'}">${esc(label)}</button>`
    )
    .join('')}</div></div>`
}

const FMT = [
  ['bold', 'B', 'Bold (Cmd+B)'],
  ['italic', 'I', 'Italic (Cmd+I)'],
  ['heading', 'H', 'Heading'],
  null,
  ['ul', '•', 'Bulleted list'],
  ['ol', '1.', 'Numbered list'],
  ['quote', '❝', 'Quote'],
  null,
  ['code', '&lt;/&gt;', 'Code'],
  ['link', '[ ]( )', 'Link']
]

function drEditorHtml({ own, placeholder = '' }) {
  const fmt = FMT.map((f) =>
    f
      ? `<button type="button" class="fmt-${f[0]}" data-dact="fmt" data-fmt="${f[0]}" title="${f[2]}" aria-label="${f[2]}">${f[1]}</button>`
      : '<span class="sep" aria-hidden="true"></span>'
  ).join('')
  const bar = own
    ? `<div class="edbar" role="toolbar" aria-label="Format">
        <div class="fmt" id="dr-fmt">${fmt}</div>
        <span class="grow"></span>
        <span class="dirty" id="dr-dirty" aria-live="polite"></span>
        <button type="button" class="btn p" data-dact="save" id="dr-save" disabled>Save</button>
      </div>`
    : ''
  return `${bar}<div class="ed${own ? ' has-bar' : ''}">
      <pre class="ed-hl" id="dr-hl" aria-hidden="true"></pre>
      <textarea id="dr-txt" spellcheck="false" aria-label="File contents"${placeholder ? ` placeholder="${esc(placeholder)}" readonly` : ''}></textarea>
    </div>`
}

function fileBodyHtml(item, withFiles) {
  const own = !item.readOnly && !isPluginOwned(item)
  const tabs = [
    ['preview', 'Preview'],
    ['file', own ? 'Edit' : 'Source (read-only)']
  ]
  if (withFiles) tabs.push(['files', 'Files'])
  if (own) tabs.push(['backups', 'Backups'])
  return `${tabsHtml(tabs)}
    <div class="pane md" id="pane-preview" role="tabpanel" aria-labelledby="tab-preview">
      <p class="dr-desc" id="dr-desc"></p>
      <div class="dr-notes" id="dr-status"></div>
      <div id="dr-prev"></div>
    </div>
    <div class="pane" id="pane-file" role="tabpanel" aria-labelledby="tab-file" hidden>
      <div class="filebar">
        <code id="dr-file"></code>
        <button type="button" class="btn" data-dact="main" id="dr-main" hidden>Back to ${esc(baseName(dr.mainFile))}</button>
      </div>
      ${drEditorHtml({ own })}
      <p class="note" id="dr-note"></p>
    </div>
    ${withFiles ? '<div class="pane" id="pane-files" role="tabpanel" aria-labelledby="tab-files" hidden></div>' : ''}
    ${own ? '<div class="pane" id="pane-backups" role="tabpanel" aria-labelledby="tab-backups" hidden></div>' : ''}`
}

function ovOn(x) {
  const on = ownerPlugin(x)?.enabled ?? true
  return x.kind === 'mcp' ? on && x.enabled !== false : on
}

function ovState(x) {
  return ovOn(x) ? '<span class="badge on">On</span>' : '<span class="badge off">Off</span>'
}

function ovCard(item, desc) {
  return `<li><button type="button" class="ov-card${ovOn(item) ? '' : ' off'}" data-dact="sub" data-key="${esc(item.key)}">
      <span class="cb"><span class="cn">${esc(item.name)}</span>${desc ? `<span class="cd">${esc(desc)}</span>` : ''}</span>
      ${ovState(item)}${ICON.chev}
    </button></li>`
}

function ovSection(id, kind, label, count, body, none) {
  return `<section class="ov-sec" id="ov-${id}" aria-labelledby="ov-${id}-h">
      <h3 id="ov-${id}-h">${kindIcon(kind, 18)}${esc(label)} <span class="n">${count}</span></h3>
      ${count ? body : `<p class="ov-empty">${esc(none)}</p>`}
    </section>`
}

function ovHooksHtml(hooks) {
  const info = new Map(HOOK_INFO)
  const byEvent = new Map()
  for (const h of hooks) {
    if (!byEvent.has(h.event)) byEvent.set(h.event, [])
    byEvent.get(h.event).push(h)
  }
  return [...byEvent]
    .map(
      ([event, list]) => `<div class="ov-ev">
        <div class="ov-ev-h"><b>${esc(event)}</b><span>${esc(info.get(event) ?? 'Claude Code event.')}</span></div>
        <ul>${list
          .map((h) => {
            const runs = hookRunsFor(h)
            return `<li><button type="button" class="btn-plain ov-ev-r" data-dact="sub" data-key="${esc(h.key)}"><span class="what">${esc(hookLabel(h))}</span>${runs ? `<span class="mchip">${esc(runs)}</span>` : ''}${ovState(h)}</button></li>`
          })
          .join('')}</ul>
      </div>`
    )
    .join('')
}

function pluginBodyHtml(item) {
  const mine = (list) => list.filter((x) => x.plugin === item.id)
  const skills = mine(state.catalog.skill)
  const agents = mine(state.catalog.agent)
  const hooks = mine(state.catalog.hook)
  const mcp = mine(state.catalog.mcp)
  const tabs = item.missing
    ? [['overview', 'Overview']]
    : [
        ['overview', 'Overview'],
        ['files', 'Files'],
        ['file', 'File']
      ]
  const tile = (id, n, label) =>
    `<button type="button" class="ov-tile${n ? '' : ' zero'}" data-dact="jump" data-to="ov-${id}"><b>${n}</b><span>${esc(label)}</span></button>`
  const cards = (list, desc) => `<ul class="ov-cards">${list.map((x) => ovCard(x, desc(x))).join('')}</ul>`
  return `${tabsHtml(tabs)}
    <div class="pane ov" id="pane-overview" role="tabpanel" aria-labelledby="tab-overview">
      <p class="dr-desc" id="dr-desc"></p>
      <div class="dr-notes" id="dr-status"></div>
      ${
        item.modules?.length
          ? ovSection(
              'modules',
              'plugin',
              'Modules',
              item.modules.length,
              `<ul class="mini">${item.modules.map((m) => `<li><code>${esc(m)}</code></li>`).join('')}</ul><p class="ov-empty">Claude Code loads these modules only when <code>CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1</code>.</p>`,
              ''
            )
          : ''
      }
      <div class="ov-tiles">
        ${tile('skills', skills.length, 'Skills')}${tile('agents', agents.length, 'Agents')}${tile('hooks', hooks.length, 'Hooks')}${tile('mcp', mcp.length, 'MCP servers')}
      </div>
      ${item.dev ? '' : `<p class="ov-lock">${ICON.lock}<span>Everything in this plugin follows the plugin switch. Plugin files are read-only. To edit a skill, open it and use <b>Copy to my skills</b>.</span></p>`}
      ${ovSection(
        'skills',
        'skill',
        'Skills',
        skills.length,
        cards(skills, (s) => s.description),
        'This plugin adds no skills.'
      )}
      ${ovSection(
        'agents',
        'agent',
        'Agents',
        agents.length,
        cards(agents, (a) => a.description),
        'This plugin adds no agents.'
      )}
      ${ovSection('hooks', 'hook', 'Hooks', hooks.length, ovHooksHtml(hooks), 'This plugin adds no hooks.')}
      ${ovSection(
        'mcp',
        'mcp',
        'MCP servers',
        mcp.length,
        cards(mcp, (m) => `${mcpTransport(m)} · ${m.description}`),
        'This plugin adds no MCP servers.'
      )}
    </div>
    <div class="pane" id="pane-files" role="tabpanel" aria-labelledby="tab-files" hidden></div>
    <div class="pane" id="pane-file" role="tabpanel" aria-labelledby="tab-file" hidden>
      <div class="filebar"><code id="dr-file"></code></div>
      ${drEditorHtml({ own: false, placeholder: 'Pick a file in the Files tab.' })}
    </div>`
}

function setTab(tab) {
  dr.tab = tab
  for (const b of $('dr-body').querySelectorAll('[data-tab]'))
    b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  for (const pane of $('dr-body').querySelectorAll('.pane')) pane.hidden = pane.id !== `pane-${tab}`
  if (tab === 'preview') paintPreview()
  if (tab === 'files') loadDir(dr.dir ?? dr.root)
  if (tab === 'backups') loadBackups()
}

function paintPreview() {
  const hide = dr.file === dr.mainFile ? ['name', 'description'] : []
  $('dr-desc').hidden = dr.file !== dr.mainFile
  $('dr-prev').innerHTML = previewHtml($('dr-txt').value, dr.file, hide)
}

function paintEditor() {
  const hl = $('dr-hl')
  const txt = $('dr-txt')
  if (!hl || !txt) return
  hl.innerHTML = highlight(txt.value, dr.file)
  hl.scrollTop = txt.scrollTop
  const fmt = $('dr-fmt')
  if (fmt) fmt.hidden = !dr.editable || !isMd(dr.file)
}

function formatText(kind) {
  const txt = $('dr-txt')
  if (!txt || txt.readOnly || !isMd(dr.file)) return
  const wraps = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], link: ['[', '](https://)'] }
  const prefixes = { heading: '## ', ul: '- ', ol: '1. ', quote: '> ' }
  const { selectionStart: s, selectionEnd: e, value } = txt
  if (wraps[kind]) {
    const [a, b] = wraps[kind]
    const sel = value.slice(s, e) || (kind === 'link' ? 'link text' : 'text')
    insertText(txt, a + sel + b)
    txt.setSelectionRange(s + a.length, s + a.length + sel.length)
    return
  }
  const p = prefixes[kind]
  if (!p) return
  const start = value.lastIndexOf('\n', s - 1) + 1
  txt.setSelectionRange(start, start)
  insertText(txt, p)
  txt.setSelectionRange(s + p.length, e + p.length)
}

function onEditorInput() {
  updateDirty()
  if (dr.tab === 'preview') paintPreview()
}

function updateDirty() {
  paintEditor()
  const dirty = isDirty()
  const mark = $('dr-dirty')
  if (mark) mark.textContent = dirty ? '● unsaved' : ''
  const save = $('dr-save')
  if (save) save.disabled = !dirty || !dr.editable
}

function noteText(item) {
  if (item.kind === 'plugin') return ''
  if (item.readOnly) {
    return item.kind === 'skill'
      ? 'Plugin files are read-only. Use Copy to my skills to edit a copy in ~/.claude/skills.'
      : 'Plugin files are read-only.'
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
  if (dr.tab === 'preview') paintPreview()
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
    const up =
      dir !== dr.root
        ? `<li><button type="button" class="btn-plain name" data-dact="dir" data-path="${esc(parentDir(dir))}">../</button><span class="note">up one folder</span></li>`
        : ''
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

export function backupsListHtml(list, attrs, canRestore, prefix) {
  if (!list.length) return '<p class="note">No backups for this file yet. Each save writes one.</p>'
  return `<ul class="mini">${list
    .map(
      (b, i) =>
        `<li><span class="when">${esc(b.time ? new Date(b.time).toLocaleString() : baseName(b.path))}</span><button type="button" class="btn" id="${prefix}-rs-${i}" ${attrs} data-path="${esc(b.path)}"${canRestore ? '' : ' disabled'}>Restore</button></li>`
    )
    .join('')}</ul><p class="note">Newest first.</p>`
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
  }
  const txt = $('dr-txt')
  if (txt) {
    txt.addEventListener('input', onEditorInput)
    txt.addEventListener('scroll', () => {
      if ($('dr-hl')) $('dr-hl').scrollTop = txt.scrollTop
    })
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

async function closeDrawer() {
  if (!drawerOpen()) return
  if (isDirty()) {
    const discard = await ask({
      title: 'Discard changes?',
      message: `You have unsaved edits in ${baseName(dr.file)}. Close and lose them?`,
      ok: 'Discard',
      danger: true
    })
    if (!discard) return
  }
  forceClose()
}

async function confirmLeaveFile() {
  if (!isDirty()) return true
  return ask({
    title: 'Discard changes?',
    message: `You have unsaved edits in ${baseName(dr.file)}. Open another file and lose them?`,
    ok: 'Discard',
    danger: true
  })
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
  if (act === 'star') return void starItem(item, b)
  if (act === 'copy') return void copyPath()
  if (act === 'uninstall') return void uninstallPlugin(item)
  if (act === 'plugin-toggle' && owner) return void toggle(owner)
  if (act === 'plugin-uninstall' && owner) return void uninstallPlugin(owner)
  if (act === 'plugin-open' && owner) return openDrawer(owner)
  if (act === 'save') return void saveFile()
  if (act === 'fmt') return formatText(b.dataset.fmt)
  if (act === 'jump') return $(b.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      <div class="dr-notes" id="dr-status"></div>
      <pre class="md json"><code>${esc(JSON.stringify(json, null, 2))}</code></pre>
      <p class="note">${esc(note)}</p>
    </div>`
}

const ACT_PATH = {
  toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/>',
  favorite: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  save: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'
}

function actIcon(name, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACT_PATH[name] ?? ''}</svg>`
}

function actRowHtml(e) {
  const isUndo = e.message.startsWith('Undid:')
  const kind = isUndo ? 'undo' : ACT_PATH[e.kind] ? e.kind : 'save'
  const full = tilde(e.file ?? '')
  const name = full.split('/').pop()
  const time = Date.parse(e.time)
  return `<li class="act-row k-${kind}" data-entry="${esc(e.id)}">
    <span class="act-dot">${actIcon(kind)}</span>
    <div class="act-body">
      <b>${esc(e.message)}</b>
      <div class="act-line"><span class="act-meta"><code title="${esc(full)}">${esc(name)}</code><time datetime="${esc(e.time ?? '')}" title="${esc(Number.isNaN(time) ? '' : new Date(time).toLocaleString())}">${Number.isNaN(time) ? '' : esc(ago(time))}</time></span></div>
    </div>
    ${e.canUndo ? `<button type="button" class="act-undo" data-undo="${esc(e.id)}" title="Undo" aria-label="Undo: ${esc(e.message)}">${actIcon('undo', 16)}</button>` : ''}
  </li>`
}

function renderActivity(entries) {
  $('n-activity').textContent = entries.length ? String(entries.length) : ''
  const list = $('act')
  if (!entries.length) {
    list.innerHTML = `<li class="act-empty"><span class="act-empty-ic">${actIcon('undo', 22)}</span><b>No changes yet</b><span>Switches, saves, and stars show here. You can undo them.</span></li>`
    return
  }
  list.innerHTML = entries.map(actRowHtml).join('')
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
    $('title').focus()
  }
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
    clearTimeout(state.searchTimer)
    const value = e.target.value
    state.searchTimer = setTimeout(() => {
      state.query = value
      render()
    }, 120)
  })
  $('act').addEventListener('click', (e) => {
    const b = e.target.closest('[data-undo]')
    if (b) undo(b.dataset.undo)
  })
  setInterval(() => {
    for (const t of $('act').querySelectorAll('time[datetime]')) {
      const ms = Date.parse(t.dateTime)
      if (!Number.isNaN(ms)) t.textContent = ago(ms)
    }
  }, 30000)
  $('banner-x').addEventListener('click', () => {
    state.bannerDismissed = true
    $('banner').hidden = true
  })
  $('dr-close').addEventListener('click', () => closeDrawer())
  $('dr-scrim').addEventListener('click', () => closeDrawer())
  $('dr').addEventListener('click', onDrawerClick)
  $('cf-no').addEventListener('click', () => state.confirmState?.done(false))
  $('cf-yes').addEventListener('click', () => state.confirmState?.done(true))
  document.addEventListener('keydown', (e) => {
    if (state.confirmState) {
      if (e.key === 'Escape') {
        e.preventDefault()
        state.confirmState.done(false)
      } else if (e.key === 'Tab') trapTab(e, $('cf'))
      return
    }
    if (state.favPop) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFavPop()
      } else if (e.key === 'Tab') trapTab(e, state.favPop.el)
      return
    }
    if (state.favEditing !== null && e.key === 'Escape' && document.activeElement?.id === 'fav-rename') {
      e.preventDefault()
      cancelRename()
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
      } else if ((e.metaKey || e.ctrlKey) && e.target.id === 'dr-txt' && (e.key === 'b' || e.key === 'i')) {
        e.preventDefault()
        formatText(e.key === 'b' ? 'bold' : 'italic')
      }
      return
    }
    const panelKey = document.activeElement?.dataset?.ed
    if (panelKey && (e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      saveEd(panelKey)
      return
    }
    if (state.menuKey) {
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
  document.addEventListener(
    'mousedown',
    (e) => {
      if (
        state.favPop &&
        !state.favPop.el.contains(e.target) &&
        !e.target.closest('[data-act="star"], [data-dact="star"]')
      )
        closeFavPop(false)
    },
    true
  )
  window.addEventListener('resize', () => closeFavPop(false))
  window.addEventListener('scroll', placeFavPop, true)
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() || cfgDirty()) e.preventDefault()
  })

  const main = document.querySelector('.main')
  main.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]')
    if (goEl) return go(goEl.dataset.go)
    const periodEl = e.target.closest('[data-period]')
    if (periodEl) return setPeriod(periodEl.dataset.period)
    const sortEl = e.target.closest('[data-usort]')
    if (sortEl) return setSort(sortEl.dataset.usort)
    const unusedEl = e.target.closest('[data-unused]')
    if (unusedEl) {
      if (unusedEl.dataset.unused === 'off') return void switchOffUnused()
      chipFilter[state.page] = 'unused'
      state.menuKey = null
      return render()
    }
    const cfgEl = e.target.closest('[data-c]')
    if (cfgEl) {
      if (!cfgEl.disabled) onCfg(cfgEl)
      return
    }
    const chip = e.target.closest('[data-chip]')
    if (chip) {
      chipFilter[state.page] = chip.dataset.chip
      state.menuKey = null
      return render()
    }
    const fc = e.target.closest('[data-fc]')
    if (fc) return void onFavCat(fc)
    const grp = e.target.closest('[data-group]')
    if (grp) {
      groupOpen.set(grp.dataset.group, grp.getAttribute('aria-expanded') !== 'true')
      return render()
    }
    if (e.target.closest('#doc-again')) return void checkAgain()
    const docRow = e.target.closest('[data-doc]')
    if (docRow) return void onDoctor(docRow, e)
    const act = e.target.closest('[data-act]')
    const key = cardKey(e.target)
    if (!key) return
    const name = act?.dataset.act
    if (name === 'menu') return openMenu(key, act.closest('[data-rows]')?.dataset.rows ?? '')
    if (act?.dataset.act === 'unfav') {
      const fav = state.inventory.favorites.find((f) => f.id === key)
      if (fav) star({ kind: fav.kind, name: fav.name, source: fav.source, favorite: false }, `Unstarred ${fav.name}`)
      return
    }
    const item = items.get(key)
    if (!item) return
    if (act?.dataset.act === 'toggle') return void toggle(item)
    if (act?.dataset.act === 'star') return void starItem(item, act)
    if (act?.dataset.act === 'del') return void deleteRow(item)
    if (name === 'keep') return void keepOnly(item)
    if (name === 'uninstall') return void uninstallPlugin(item)
    if (name?.startsWith('m-')) {
      closeMenu()
      if (name === 'm-open') return openDrawer(item)
      if (name === 'm-toggle') return void toggle(item)
      if (name === 'm-finder') return void reveal(item)
      if (name === 'm-uninstall') return void uninstallPlugin(item)
      return
    }
    if (act?.dataset.act === 'open' || !e.target.closest('button, a, input, details, .menu, .pnote')) openDrawer(item)
  })
  document.addEventListener('click', (e) => {
    if (state.menuKey && !e.target.closest('.menu, [data-act="menu"]')) closeMenu(false)
  })
  main.addEventListener('focusout', (e) => {
    if (!state.menuKey || !e.relatedTarget) return
    const holder = e.relatedTarget.closest?.(HOLDER)
    if (holder && holderKey(holder) === state.menuKey && e.relatedTarget.closest('.menu, [data-act="menu"]')) return
    setTimeout(() => closeMenu(false), 0)
  })

  main.addEventListener('input', (e) => {
    if (e.target.id === 'fav-newcat') state.favNewName = e.target.value
    else if (e.target.id === 'fav-rename') state.favRenameValue = e.target.value
    else onCfgInput(e)
  })
  main.addEventListener('submit', (e) => {
    e.preventDefault()
    if (e.target.id === 'hook-form') submitHook()
    else if (e.target.id === 'mcp-form') submitMcp()
    else if (e.target.dataset.form === 'cat-new') submitNewCat()
    else if (e.target.dataset.form === 'cat-rename') submitRename(e.target)
  })

  const clearDrop = () => {
    for (const n of document.querySelectorAll('.drop-over, .drop-before, .drop-after'))
      n.classList.remove('drop-over', 'drop-before', 'drop-after')
  }
  const isAfter = (e, row) => {
    const r = row.getBoundingClientRect()
    return e.clientY > r.top + r.height / 2
  }
  main.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.fav-sec .lrow[draggable="true"]')
    if (!row) return
    state.dragKey = holderKey(row)
    row.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', state.dragKey)
  })
  main.addEventListener('dragover', (e) => {
    if (!state.dragKey) return
    const sec = e.target.closest('.fav-sec')
    if (!sec) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    clearDrop()
    sec.classList.add('drop-over')
    const row = e.target.closest('.fav-sec .lrow')
    if (row && holderKey(row) !== state.dragKey) row.classList.add(isAfter(e, row) ? 'drop-after' : 'drop-before')
  })
  main.addEventListener('dragleave', (e) => {
    const sec = e.target.closest?.('.fav-sec')
    if (sec && !sec.contains(e.relatedTarget)) clearDrop()
  })
  main.addEventListener('drop', (e) => {
    if (!state.dragKey) return
    const sec = e.target.closest('.fav-sec')
    if (!sec) return
    e.preventDefault()
    const row = e.target.closest('.fav-sec .lrow')
    const plan = placeFav(
      state.dragKey,
      sec.dataset.cat || null,
      row ? holderKey(row) : null,
      row ? isAfter(e, row) : true
    )
    state.dragKey = null
    clearDrop()
    if (plan) saveOrder(plan)
  })
  main.addEventListener('dragend', () => {
    state.dragKey = null
    clearDrop()
    for (const c of document.querySelectorAll('.dragging')) c.classList.remove('dragging')
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
