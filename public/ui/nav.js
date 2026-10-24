import { $, focusMark, focusRestore } from '../core/dom.js'
import { compact, esc, tilde } from '../core/format.js'
import { state } from '../core/state.js'
import { PAGES, counts, favoriteEntries, otherCounts, visible } from '../logic/catalog.js'
import { markStale, mdDirtyKey } from '../logic/config.js'
import { contextItems, sumTokens } from '../logic/context.js'
import { doctorIssues } from '../logic/doctor.js'
import { duplicateGroups, needsAction } from '../logic/duplicates.js'
import { USAGE_PAGES } from '../logic/usage.js'
import { renderCatalog } from '../pages/catalog.js'
import { discardMd, renderClaudeMd } from '../pages/claudemd.js'
import { renderContext } from '../pages/context.js'
import { needUsage, renderDash } from '../pages/dash.js'
import { renderDoctor } from '../pages/doctor.js'
import { renderDups } from '../pages/dups.js'
import { renderFav } from '../pages/fav.js'
import { renderHooks } from '../pages/hooks.js'
import { renderMcp } from '../pages/mcp.js'
import { renderSettings } from '../pages/settings.js'
import { syncDrawerHead } from './drawer.js'

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

const PROJECT_OFF_NOTE = 'Started from your home folder — project scope is off. Run it inside a project folder.'

export function projectOffHtml() {
  return `<div class="warn" role="note">${esc(PROJECT_OFF_NOTE)}</div>`
}
