import { get, send } from './api.js'
import {
  afterWrite,
  askReload,
  busy,
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
  trapTab,
  waitFor
} from './core/dom.js'
import {
  ago,
  baseName,
  compact,
  esc,
  fmtSize,
  isFolderSkill,
  isPlain,
  lineCount,
  opt,
  parentDir,
  plural,
  relTo,
  shortVersion,
  tilde
} from './core/format.js'
import { ICON, kindIcon } from './core/icons.js'
import {
  bks,
  cfg,
  chipFilter,
  dr,
  eds,
  freshHookForm,
  freshMcpForm,
  groupOpen,
  items,
  msgs,
  pending,
  state
} from './core/state.js'
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
  projectOn,
  switchInfo,
  visible
} from './logic/catalog.js'
import {
  ELSEWHERE,
  FORM_FIELDS,
  FORM_GROUPS,
  MD_ORDER,
  SET_ORDER,
  cfgDirty,
  cfgPanels,
  cmd,
  dropMissing,
  edDirty,
  elsewhereText,
  fieldGet,
  fieldPath,
  fieldSet,
  formValue,
  isCfgPage,
  lockedKeys,
  lockedText,
  markStale,
  mdDirtyKey,
  setData,
  setDirty,
  sformDirtyKeys,
  sformEdit,
  sformValues,
  shortValue
} from './logic/config.js'
import { contextItems, sumTokens } from './logic/context.js'
import { doctorIssues } from './logic/doctor.js'
import { duplicateGroups, needsAction } from './logic/duplicates.js'
import { EFF_GROUPS, SCOPE_KEY, SCOPE_TAG, effRow, effRows } from './logic/effective.js'
import { HOOK_INFO, hookLabel, hookRunsFor } from './logic/hooks.js'
import { highlight, isMd, previewHtml } from './logic/markdown.js'
import { mcpTransport } from './logic/mcp.js'
import { USAGE_PAGES } from './logic/usage.js'
import { renderCatalog } from './pages/catalog.js'
import { renderContext } from './pages/context.js'
import { needUsage, renderDash, setPeriod } from './pages/dash.js'
import { checkAgain, onDoctor, renderDoctor } from './pages/doctor.js'
import { keepOnly, renderDups } from './pages/dups.js'
import { cancelRename, onFavCat, placeFav, renderFav, saveOrder, submitNewCat, submitRename } from './pages/fav.js'
import { renderHooks, submitHook } from './pages/hooks.js'
import { renderMcp, submitMcp } from './pages/mcp.js'
import { setSort, switchOffUnused } from './ui/chips.js'
import { closeFavPop, placeFavPop, starItem } from './ui/fav-popover.js'
import { empty, menuEntries } from './ui/rows.js'

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

function backupsListHtml(list, attrs, canRestore, prefix) {
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

const SET_WHERE = { sg: 'every project', sp: 'this folder · in git', sl: 'this folder · only you' }

const SET_ABOUT = {
  sg: 'This file applies to every project on this computer.',
  sp: 'This file is for the team. It goes into git with the project.',
  sl: 'This file is only for you. Git ignores it. Storehouse writes your on/off switches for this folder here.'
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

function ensureEd(k, file) {
  let ed = eds[k]
  if (ed && ed.path !== file) {
    delete eds[k]
    ed = null
  }
  if (ed && (!ed.stale || ed.fetching)) return
  if (!ed) {
    ed = {
      path: file,
      status: 'loading',
      text: '',
      loaded: '',
      editing: false,
      preview: false,
      stale: false,
      fetching: false
    }
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

function edChrome(k) {
  const ed = eds[k]
  const dirty = edDirty(ed)
  const md = MD_ORDER.includes(k)
  const mark = $(`${k}-dirty`)
  if (mark) {
    mark.textContent = dirty
      ? '● Unsaved changes'
      : md
        ? `${plural(lineCount(ed?.text ?? ''), 'line')} · Saved`
        : 'Saved'
    mark.classList.toggle('is-dirty', dirty)
  }
  const save = $(`${k}-save`)
  if (save) save.disabled = !dirty
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = dirty ? '● unsaved' : ''
  const cancel = $(`${k}-cancel`)
  if (cancel) cancel.hidden = !dirty
}

function sformState(k) {
  const dirty = sformDirtyKeys(k)
  return dirty.length
    ? `● ${plural(dirty.length, 'unsaved change')} · ${dirty.join(', ')}`
    : `${plural(Object.keys(setData(k)).length, 'key')} · Saved`
}

function sformChrome(k) {
  const dirty = sformDirtyKeys(k)
  const mark = $(`${k}-fdirty`)
  if (mark) {
    mark.textContent = sformState(k)
    mark.classList.toggle('is-dirty', dirty.length > 0)
  }
  for (const id of [`${k}-fsave`, `${k}-freset`]) {
    const b = $(id)
    if (b) b.disabled = !dirty.length
  }
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = setDirty(k) ? '● unsaved' : ''
  for (const f of FORM_FIELDS) $(`sf-${f.key}`)?.closest('.srow')?.classList.toggle('changed', dirty.includes(f.key))
}

function fieldHtml(k, f, v, data, locked, changed) {
  const id = `sf-${f.key}`
  const name = `${esc(f.name)} <span class="key">${esc(f.key)}</span>`
  const head =
    f.type === 'switch' ? `<span class="t" id="${id}-l">${name}</span>` : `<label class="t" for="${id}">${name}</label>`
  const help =
    f.key === 'permissions.defaultMode' && k !== 'sg'
      ? `${f.help} <code>auto</code> and <code>bypassPermissions</code> do not work from this file.`
      : f.help
  let ctl
  if (locked) {
    const value = fieldGet(data, f) ?? data[fieldPath(f)[0]]
    ctl = `<span class="note">${esc(`${lockedText(value)} — edit in Raw JSON`)}</span>`
  } else if (f.type === 'switch') {
    ctl = `<button type="button" class="sw" role="switch" id="${id}" data-c="sfsw" data-v="${f.key}" aria-checked="${v[f.key] ? 'true' : 'false'}" aria-labelledby="${id}-l"></button>`
  } else if (f.type === 'select') {
    const opts = [['', '(not set)'], ...f.options.map((o) => [o, o])]
    for (const extra of [cfg.sforms[k]?.base[f.key], v[f.key]]) {
      if (extra && !opts.some(([o]) => o === extra)) opts.push([extra, `${extra} (current)`])
    }
    ctl = `<select id="${id}" data-sf="${f.key}">${opts.map(([o, label]) => opt(o, label, v[f.key])).join('')}</select>`
  } else {
    ctl = `<input id="${id}" data-sf="${f.key}" value="${esc(v[f.key])}" placeholder="not set" autocomplete="off" spellcheck="false">`
  }
  return `<div class="srow${changed ? ' changed' : ''}"><div class="lbl">${head}<p>${help}</p>${formHint(k, f)}</div><div class="ctl">${ctl}</div></div>`
}

function rulesHtml(data) {
  const perms = isPlain(data.permissions) ? data.permissions : {}
  const col = (key, label) => {
    const list = Array.isArray(perms[key]) ? perms[key] : []
    const items = list.length
      ? list.map((r) => `<span class="fm-chip">${esc(typeof r === 'string' ? r : JSON.stringify(r))}</span>`).join('')
      : '<span class="none">No rules</span>'
    return `<div><h4>${label} <b>${list.length}</b></h4>${items}</div>`
  }
  return `<div class="sgroup"><h3>Permission rules <span class="hint">Read-only here · edit in Raw JSON</span></h3><div class="rules">${col('allow', 'Allow')}${col('ask', 'Ask')}${col('deny', 'Deny')}</div></div>`
}

function elsewhereHtml(data) {
  const rows = ELSEWHERE.filter(([key]) => data[key] !== undefined).map(
    ([key, page, label]) =>
      `<li><code>${key}</code><span class="s">${esc(elsewhereText(key, data[key]))}</span><button type="button" class="btn" data-go="${page}">Open ${label}</button></li>`
  )
  if (!rows.length) return ''
  return `<div class="sgroup"><h3>Managed on other pages <span class="hint">${plural(rows.length, 'key')}</span></h3><ul class="lrows">${rows.join('')}</ul></div>`
}

function otherKeysHtml(data) {
  const known = new Set([...FORM_FIELDS.map((f) => fieldPath(f)[0]), ...ELSEWHERE.map(([key]) => key)])
  const rows = Object.keys(data)
    .filter((key) => !known.has(key))
    .map((key) => [key, data[key]])
  if (isPlain(data.permissions)) {
    for (const key of Object.keys(data.permissions)) {
      if (!['allow', 'ask', 'deny', 'defaultMode'].includes(key))
        rows.push([`permissions.${key}`, data.permissions[key]])
    }
  }
  if (!rows.length) return ''
  return `<div class="sgroup"><h3>Other keys <span class="hint">Edit in Raw JSON</span></h3><ul class="lrows">${rows
    .map(
      ([key, value]) =>
        `<li><code>${esc(key)}</code><span class="s">${esc(shortValue(value))}</span><button type="button" class="btn-link" data-c="stab" data-v="raw">Show in Raw JSON</button></li>`
    )
    .join('')}</ul></div>`
}

function settingsFormHtml(k) {
  const data = setData(k)
  const v = sformValues(k)
  const locked = lockedKeys(k)
  const dirty = sformDirtyKeys(k)
  const groups = FORM_GROUPS.map(([group, title]) => {
    const fields = FORM_FIELDS.filter((f) => f.group === group)
    const rows = fields.map((f) => fieldHtml(k, f, v, data, locked.includes(f.key), dirty.includes(f.key))).join('')
    return `<div class="sgroup"><h3>${title} <span class="hint">${plural(fields.length, 'key')}</span></h3>${rows}</div>`
  }).join('')
  return `${groups}${rulesHtml(data)}${elsewhereHtml(data)}${otherKeysHtml(data)}`
}

function missingHtml(k, p) {
  dropMissing(k)
  const buttons = p.md
    ? `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="default">Create from template</button><button type="button" class="btn" id="${k}-ce" data-c="create" data-k="${k}" data-v="empty">Create empty</button>`
    : `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="empty">Create ${esc(p.file)}</button>`
  return `<div class="empty">No ${esc(p.file)} yet.<div class="row center">${buttons}</div></div>${msgHtml(k)}`
}

function setKeys() {
  return projectOn() ? SET_ORDER : ['sg']
}

function setSelected(panels) {
  const keys = setKeys()
  if (!cfg.ssel || !keys.includes(cfg.ssel)) cfg.ssel = keys.find((k) => panels[k].info?.exists) ?? keys[0]
  return cfg.ssel
}

function setMeta(k, p) {
  const info = p.info
  const pill = p.pill ? ` · ${p.pill}` : ''
  if (!info) return 'Could not be scanned'
  if (!info.exists) return `Not found${pill}`
  if (!info.ok) return `Invalid JSON${pill}`
  return `${plural(Object.keys(setData(k)).length, 'key')} · ${SET_WHERE[k]}${pill}`
}

function setListHtml(panels, sel) {
  return setKeys()
    .map((k, i) => {
      const p = panels[k]
      const exists = Boolean(p.info?.exists)
      const cur = k === sel
      const create =
        p.info && !exists
          ? `<button type="button" class="btn" id="cm-create-${k}" data-c="create" data-k="${k}" data-v="empty" aria-label="${esc(`Create ${p.file}`)}">Create</button>`
          : ''
      return `<li class="cm-file${cur ? ' cur' : ''}${exists ? '' : ' missing'}">
        <span class="cm-num" aria-hidden="true">${exists ? i + 1 : '–'}</span>
        <button type="button" class="cm-pick" id="cm-pick-${k}" data-c="spick" data-k="${k}"${cur ? ' aria-current="true"' : ''}>
          <span class="cm-label">${esc(p.label)}<span class="dirty" id="cm-dot-${k}">${setDirty(k) ? '● unsaved' : ''}</span></span>
          <span class="cm-path">${esc(p.file)}</span>
          <span class="cm-meta">${esc(setMeta(k, p))}</span>
        </button>
        ${create}
      </li>`
    })
    .join('')
}

function setBarHtml(k, p, form, dirty, stateText) {
  const del = p.del
    ? `<button type="button" class="btn danger ghost" id="${k}-del" data-c="delete" data-k="${k}">Delete…</button>`
    : ''
  const undo = form
    ? `<button type="button" class="btn ghost" id="${k}-freset" data-c="freset"${dirty ? '' : ' disabled'}>Reset</button>`
    : `<button type="button" class="btn ghost" id="${k}-cancel" data-c="cancel" data-k="${k}"${dirty ? '' : ' hidden'}>Discard</button>`
  const save = form
    ? `<button type="button" class="btn p" id="${k}-fsave" data-c="fsave"${dirty ? '' : ' disabled'}>Save</button>`
    : `<button type="button" class="btn p" id="${k}-save" data-c="save" data-k="${k}"${dirty ? '' : ' disabled'}>Save</button>`
  return `<div class="cm-bar">
      ${del}
      <span class="cm-state${dirty ? ' is-dirty' : ''}" id="${k}-${form ? 'fdirty' : 'dirty'}" aria-live="polite">${esc(stateText)}</span>
      ${undo}
      ${backupsBtn(k)}
      <button type="button" class="btn" id="${k}-open" data-c="editor" data-k="${k}">Open in editor</button>
      ${save}
    </div>`
}

function settingsPanelHtml(k, p) {
  const info = p.info
  const pill = p.pill ? `<span class="pill">${esc(p.pill)}</span>` : ''
  const broken = Boolean(info?.exists && !info.ok)
  const tab = broken ? 'raw' : cfg.stab
  const tabs = info?.exists
    ? `<div class="tabs" role="tablist" aria-label="View">${[
        ['form', 'Form'],
        ['raw', 'Raw JSON']
      ]
        .map(
          ([value, label]) =>
            `<button type="button" role="tab" id="${k}-tab-${value}" data-c="stab" data-v="${value}" aria-selected="${tab === value}" aria-controls="${k}-pane"${value === 'form' && broken ? ' disabled title="Fix the JSON first"' : ''}>${label}</button>`
        )
        .join('')}</div>`
    : ''
  const head = `<div class="cm-head"><div class="cm-title"><h2 id="${k}-h">${esc(p.label)}${pill}</h2><code class="cm-path">${esc(info ? tilde(info.path) : p.file)}</code></div>${tabs}</div>`
  let body
  let bar = ''
  if (!info) body = '<div class="warn">This file could not be scanned.</div>'
  else if (!info.exists) body = `<p class="note">${SET_ABOUT[k]}</p>${missingHtml(k, p)}`
  else if (tab === 'form') {
    const dirty = sformDirtyKeys(k).length > 0
    body = `<p class="form-err" id="${k}-ferr" role="alert">${esc(cfg.sformMsg)}</p><div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-tab-form">${settingsFormHtml(k)}</div>${panelBackupsHtml(k)}`
    bar = setBarHtml(k, p, true, dirty, sformState(k))
  } else {
    ensureEd(k, info.path)
    const ed = eds[k]
    const warn = broken
      ? `<div class="warn">${esc(`Cannot parse ${p.file}: ${info.error}. Fix it here. The form comes back once the file parses.`)}</div>`
      : ''
    if (!ed || ed.status === 'loading') body = '<p class="note">Loading…</p>'
    else if (ed.status === 'error')
      body = `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
    else {
      const dirty = edDirty(ed)
      body = `${warn}${msgHtml(k)}<div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-tab-raw"><textarea id="${k}-txt" class="ed" data-ed="${k}" spellcheck="false" aria-label="${esc(`${p.file} contents`)}">\n${esc(ed.text)}</textarea></div>${panelBackupsHtml(k)}`
      bar = setBarHtml(k, p, false, dirty, dirty ? '● Unsaved changes' : 'Saved')
    }
  }
  return `<section class="panel cm-panel" aria-labelledby="${k}-h">${head}<div class="cm-body">${body}</div>${bar}</section>`
}

function renderSettings() {
  const panels = cfgPanels()
  const sel = setSelected(panels)
  const arrow = projectOn() ? '<span class="arrow">1 Global <span class="bar"></span> 3 Project local</span>' : ''
  const view = cfg.sview === 'effective' ? 'effective' : 'files'
  const vtab = (value, label) =>
    `<button type="button" role="tab" id="sv-${value}" data-c="sview" data-v="${value}" aria-selected="${view === value}">${label}</button>`
  const top = `<div class="st-top"><p class="note">Claude Code reads these files at the start of a session in this folder. Each save writes a backup to <code>~/.claude/backups/storehouse/</code> first.</p><div class="vtabs" role="tablist" aria-label="Settings view">${vtab('files', 'Files')}${vtab('effective', `Effective <span class="n">${plural(effRows().length, 'key')}</span>`)}</div></div>`
  if (view === 'effective') {
    $('p-settings').innerHTML = `${top}${effectiveHtml()}`
    return
  }
  $('p-settings').innerHTML = `${top}
    <div class="cm">
      <nav class="cm-nav" aria-label="Settings files">
        <ul class="cm-list">${setListHtml(panels, sel)}</ul>
        <div class="prec"><b>Which file wins?</b><span>When two files set the same key, the higher number wins. Lists such as <code>permissions.allow</code> add up from all files. A deny rule in any file blocks the tool.</span>${arrow}</div>
        ${projectOn() ? '' : projectOffHtml()}
      </nav>
      ${settingsPanelHtml(sel, panels[sel])}
    </div>`
}

function effTag(scope) {
  const [label, cls] = SCOPE_TAG[scope] ?? [scope, '']
  const k = SCOPE_KEY[scope]
  return `<button type="button" class="tag ${cls}" data-c="efile" data-k="${k}" aria-label="${esc(`Open ${cfgPanels()[k]?.file ?? label}`)}">${label}</button>`
}

function effValue(value) {
  return `<code>${esc(value === undefined ? '' : JSON.stringify(value))}</code>`
}

function effLost(list) {
  return list
    .map((o) => {
      const note = o.wrongType
        ? ' <span class="note">wrong type · ignored</span>'
        : o.ignored
          ? ' <span class="note">ignored in this file</span>'
          : ''
      return `<li><span class="lost">${effValue(o.value)}</span> ${effTag(o.file)}${note}</li>`
    })
    .join('')
}

function effRowHtml(r) {
  const value = r.merged
    ? `<ul>${r.value.map((x) => `<li>${effValue(x.v)} ${effTag(x.from)}</li>`).join('')}</ul>`
    : r.from
      ? `${effValue(r.value)}${r.masked ? ' <span class="mchip key">masked</span>' : ''}`
      : '<span class="note">Not used</span>'
  const from = r.merged
    ? `<span class="mergedl">merged · ${plural(r.files.length, 'file')}</span>`
    : r.from
      ? effTag(r.from)
      : '—'
  const lost = effLost([...r.overridden, ...(r.ignored ?? []).map((o) => ({ ...o, ignored: true }))])
  return `<tr><td class="key"><code>${esc(r.key)}</code></td><td>${value}</td><td>${from}</td><td>${lost ? `<ul>${lost}</ul>` : '—'}</td></tr>`
}

function effectiveHtml() {
  const all = effRows()
  const over = all.filter((r) => r.overridden.length || r.ignored?.length)
  const merged = all.filter((r) => r.merged)
  const q = state.query.trim().toLowerCase()
  const pool = cfg.efilter === 'over' ? over : cfg.efilter === 'merged' ? merged : all
  const rows = q ? pool.filter((r) => r.key.toLowerCase().includes(q)) : pool
  const chip = (value, label, n) =>
    `<button type="button" class="chip" data-c="efilt" data-v="${value}" aria-pressed="${cfg.efilter === value}">${label} <span class="n">${n}</span></button>`
  const order = projectOn()
    ? `Highest first: ${effTag('projectLocal')} <code>.claude/settings.local.json</code> → ${effTag('project')} <code>.claude/settings.json</code> → ${effTag('global')} <code>~/.claude/settings.json</code>.`
    : `Only ${effTag('global')} <code>~/.claude/settings.json</code> applies. Project scope is off.`
  const skipped = state.inventory.settings?.effective?.skipped ?? []
  const invalid = state.inventory.settings?.effective?.invalid ?? []
  const notes = [
    state.inventory.settings?.managed
      ? '<div class="warn">Managed settings exist on this computer. They win over all files below. Storehouse does not read them. Run <code>/status</code> in Claude Code to see them.</div>'
      : '',
    skipped.length
      ? `<div class="warn">${esc(`Left out because the JSON is invalid: ${skipped.map((s) => cfgPanels()[SCOPE_KEY[s]].file).join(', ')}. Fix it in the Files view.`)}</div>`
      : '',
    invalid.length
      ? `<div class="warn">${esc(`Left out because the value is not an object: ${invalid.map((x) => `${x.key} in ${cfgPanels()[SCOPE_KEY[x.file]].file}`).join(', ')}.`)}</div>`
      : ''
  ].join('')
  const body = EFF_GROUPS.map(([group, title, hint]) => {
    const list = rows.filter((r) => r.group === group)
    if (!list.length) return ''
    return `<tr class="sec"><th colspan="4" scope="colgroup">${title}<span>${esc(hint || plural(list.length, 'key'))}</span></th></tr>${list.map(effRowHtml).join('')}`
  }).join('')
  const table = rows.length
    ? `<div class="eff-wrap"><table class="eff"><thead><tr><th scope="col">Key</th><th scope="col">Value Claude Code uses</th><th scope="col">From</th><th scope="col">Overridden</th></tr></thead><tbody>${body}</tbody></table></div>`
    : empty(q ? `No key matches "${state.query}".` : 'No settings in these files.')
  return `${notes}<div class="chipbar"><div class="chips" role="group" aria-label="Filter keys">${chip('all', 'All keys', all.length)}${chip('over', 'Overridden', over.length)}${chip('merged', 'Merged lists', merged.length)}</div><p class="note">${order}</p></div>
    ${table}
    <p class="note under">Not shown: hooks (hooks from all files run, see the Hooks page), command line flags, environment variables of your shell, and managed settings.</p>`
}

function formHint(k, f) {
  const r = effRow(f.key)
  if (!r || r.merged) return ''
  const scope = Object.keys(SCOPE_KEY).find((s) => SCOPE_KEY[s] === k)
  if (r.ignored?.some((o) => o.file === scope))
    return '<span class="ovr">Claude Code ignores this value in this file.</span>'
  if (!r.from || r.from === scope) return ''
  const order = ['global', 'project', 'projectLocal']
  if (order.indexOf(r.from) < order.indexOf(scope)) return ''
  return `<span class="ovr">↑ ${esc(cfgPanels()[SCOPE_KEY[r.from]].label)} sets ${effValue(r.value)}. That value wins in this folder.</span>`
}

async function pickSet(k) {
  if (!SET_ORDER.includes(k)) return false
  if (k === cfg.ssel) return true
  const cur = cfg.ssel
  if (cur && setDirty(cur)) {
    const yes = await ask({
      title: 'Discard changes?',
      message: `Your unsaved edits in ${cfgPanels()[cur].file} are lost.`,
      ok: 'Discard',
      danger: true
    })
    if (!yes) return false
    delete cfg.sforms[cur]
    if (eds[cur]) eds[cur].text = eds[cur].loaded
  }
  cfg.ssel = k
  cfg.sformMsg = ''
  render()
  return true
}

const MD_WHERE = {
  mg: 'every project',
  mp: 'this folder · in git',
  mc: 'this folder · in git',
  ml: 'this folder · only you'
}

function mdKeys() {
  return projectOn() ? MD_ORDER : ['mg']
}

function mdSelected(panels) {
  const keys = mdKeys()
  if (!cmd.sel || !keys.includes(cmd.sel)) cmd.sel = keys.find((k) => panels[k].info?.exists) ?? keys[0]
  return cmd.sel
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
      const create =
        p.info && !exists
          ? `<button type="button" class="btn" id="cm-create-${k}" data-c="create" data-k="${k}" data-v="default" aria-label="${esc(`Create ${p.file}`)}">Create</button>`
          : ''
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
  else if (ed.status === 'error')
    body = `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
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
  $('p-claudemd').innerHTML =
    `<p class="note cm-intro">Claude Code reads every file that exists here at the start of a session in this folder. Each save writes a backup to <code>~/.claude/backups/storehouse/</code> first.</p>
    <div class="cm">
      <nav class="cm-nav" aria-label="CLAUDE.md files">
        <ul class="cm-list">${mdListHtml(panels, sel)}</ul>
        <p class="note">The numbers show the read order. A later file can add to an earlier one.</p>
        ${projectOn() ? '' : projectOffHtml()}
      </nav>
      ${mdPanelHtml(sel, panels[sel])}
    </div>`
}

async function discardMd(k) {
  const ed = eds[k]
  if (!edDirty(ed)) return true
  const yes = await ask({
    title: 'Discard changes?',
    message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`,
    ok: 'Discard',
    danger: true
  })
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
    sformEdit(cfg.ssel, t.dataset.sf, t.value)
    sformChrome(cfg.ssel)
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
  const k = cfg.ssel
  if (tab === cfg.stab) {
    $(`${k}-tab-${tab}`)?.focus()
    return
  }
  if (tab === 'raw' && sformDirtyKeys(k).length) {
    const yes = await ask({
      title: 'Discard form changes?',
      message: 'Raw JSON shows the file on disk. Your unsaved form changes are lost.',
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
    delete cfg.sforms[k]
  }
  if (tab === 'form' && edDirty(eds[k])) {
    const yes = await ask({
      title: 'Discard JSON changes?',
      message: 'The form shows the file on disk. Your unsaved Raw JSON edits are lost.',
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
    eds[k].text = eds[k].loaded
  }
  cfg.stab = tab
  cfg.sformMsg = ''
  render()
  $(`${k}-tab-${tab}`)?.focus()
}

function saveSettingsForm() {
  return busy('sform', async () => {
    const k = cfg.ssel
    const info = cfgPanels()[k]?.info
    const keys = sformDirtyKeys(k)
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
          throw new Error(`${tilde(info.path)} does not parse: ${err.message}. Fix it in Raw JSON.`, { cause: err })
        }
      } catch (err) {
        if (err.status !== 404) throw err
      }
      if (!isPlain(data)) throw new Error(`${tilde(info.path)} does not hold a JSON object.`)
      for (const key of keys) {
        const f = FORM_FIELDS.find((x) => x.key === key)
        const parent = f.path ? data[f.path[0]] : data
        if (parent !== undefined && !isPlain(parent))
          throw new Error(`${f.path[0]} in ${tilde(info.path)} is not an object. Fix it in Raw JSON.`)
        fieldSet(data, f, formValue(cfg.sforms[k].values[key]))
      }
      await send('PUT', '/api/file', { path: info.path, content: `${JSON.stringify(data, null, 2)}\n`, stamp })
      delete cfg.sforms[k]
      toast(`Saved ${keys.join(', ')} · wrote ${tilde(info.path)}`)
      showBanner()
      await afterWrite()
      $(`sf-${keys[0]}`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        cfg.sformMsg = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(info.path)) {
          delete cfg.sforms[k]
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
      if (SET_ORDER.includes(k)) delete cfg.sforms[k]
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
          if (SET_ORDER.includes(k)) delete cfg.sforms[k]
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
    const yes = await ask({
      title: 'Discard changes?',
      message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`,
      ok: 'Discard',
      danger: true
    })
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
      const target = p.md ? `${k}-edit` : SET_ORDER.includes(k) ? `${k}-tab-${cfg.stab}` : `${k}-txt`
      await waitFor(() => $(target))
      $(target)?.focus()
    } catch (err) {
      msgs[k] = `Could not create ${p.file}: ${err.message}`
      render()
    }
  })
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
    const dirty = edDirty(eds[k]) || sformDirtyKeys(k).length > 0
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
      if (SET_ORDER.includes(k)) delete cfg.sforms[k]
      delete bks[k]
      delete msgs[k]
      toast(`Restored ${tilde(p.info.path)} from backup`)
      await afterWrite()
      $(`${k}-bk`)?.focus()
    } catch (err) {
      msgs[k] = `Could not restore: ${err.message}`
      if (SET_ORDER.includes(k) && cfg.stab === 'form') cfg.sformMsg = msgs[k]
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
    sformEdit(cfg.ssel, v, !sformValues(cfg.ssel)[v])
    render()
    return
  }
  if (act === 'fsave') return void saveSettingsForm()
  if (act === 'freset') {
    delete cfg.sforms[cfg.ssel]
    cfg.sformMsg = ''
    render()
    $(`${cfg.ssel}-tab-form`)?.focus()
    return
  }
  if (act === 'pick') {
    return void pickMd(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && MD_ORDER.includes(k) && k !== cmd.sel) {
    return void pickMd(k).then((ok) => ok && createPanel(k, v))
  }
  if (act === 'sview') {
    cfg.sview = v
    render()
    $(`sv-${v}`)?.focus()
    return
  }
  if (act === 'efilt') {
    cfg.efilter = v
    render()
    return
  }
  if (act === 'efile') {
    cfg.sview = 'files'
    return void pickSet(k).then((ok) => {
      render()
      if (ok) $(`cm-pick-${k}`)?.focus()
    })
  }
  if (act === 'spick') {
    return void pickSet(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && SET_ORDER.includes(k) && k !== cfg.ssel) {
    return void pickSet(k).then((ok) => ok && createPanel(k, v))
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
