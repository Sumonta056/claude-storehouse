import { get } from '../api.js'
import { $ } from '../core/dom.js'
import { ago, compact, esc, money, monthName, tilde } from '../core/format.js'
import { PERIOD_KEY, state } from '../core/state.js'
import { KIND_WORD, PAGES, counts, favoriteEntries, otherCounts, projectOn, visible } from '../logic/catalog.js'
import { USAGE_PAGES, modelShares } from '../logic/usage.js'
import { projectOffHtml, render } from '../ui/nav.js'
import { empty, nothingMatches, rowHtml, rowsHtml } from '../ui/rows.js'
import { usageSkeletonHtml } from '../ui/skeleton.js'

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

export function setPeriod(period) {
  state.usagePeriod = period
  try {
    localStorage.setItem(PERIOD_KEY, period)
  } catch {}
  renderDash()
}

function usageHtml() {
  const source = '<code>~/.claude/projects</code>'
  if (state.usageError)
    return `<section class="usage note-only"><p>Could not read usage from ${source}: ${esc(state.usageError)}</p></section>`
  if (!state.usage) return usageSkeletonHtml()
  if (!state.usage.all.responses)
    return `<section class="usage note-only"><p>No Claude Code usage found in ${source}.</p></section>`
  const u = state.usage[state.usagePeriod]
  const label = state.usagePeriod === 'month' ? monthName(state.usage.monthKey) : 'All time'
  const shares = modelShares(u)
  const pct = (n) => `${n.toFixed(1)}%`
  const unpriced = u.unpriced.length
    ? `<br>No price for ${u.unpriced.map((m) => `<code>${esc(m)}</code>`).join(', ')}. Its tokens count, its cost does not.`
    : ''
  const [dollars, cents] = money(u.cost).slice(1).split('.')
  const periods = [
    ['month', 'This month'],
    ['all', 'All time']
  ]
    .map(
      ([k, text]) =>
        `<button type="button" data-period="${k}" aria-pressed="${k === state.usagePeriod ? 'true' : 'false'}">${text}</button>`
    )
    .join('')
  const legend = shares.length
    ? `<div class="bar" role="img" aria-label="${esc(`Cost by model: ${shares.map((m) => `${m.name} ${pct(m.share)}`).join(', ')}`)}">${shares
        .map((m) => `<span class="${m.cls}" style="width:${m.share}%"></span>`)
        .join('')}</div>
        <div class="legend">${shares.map((m) => `<span><i class="${m.cls}"></i>${esc(m.name)} ${pct(m.share)}</span>`).join('')}</div>`
    : '<p>No priced usage in this period.</p>'
  return `<section class="usage" aria-label="Usage and cost">
      <div>
        <div class="k">API-equal value</div>
        <div class="big"><small>$</small>${esc(dollars)}.${esc(cents)}</div>
        <p>${esc(label)}. All Claude Code usage on this machine, priced at current Anthropic API rates.<br>Read from ${source}${unpriced}</p>
      </div>
      <div class="right">
        <div class="rhead">
          <div class="k">Cost by model</div>
          <div class="scope period" role="group" aria-label="Usage period">${periods}</div>
        </div>
        <div class="mon">${compact(u.tokens)}<span>tokens · ${u.responses.toLocaleString('en-US')} responses</span></div>
        ${legend}
      </div>
    </section>
    <div class="utiles">
      <div><b>${compact(u.tokens)}</b><span>Total tokens</span></div>
      <div><b>${u.sessions.toLocaleString('en-US')}</b><span>Sessions across ${u.projects} project${u.projects === 1 ? '' : 's'}</span></div>
      <div><b class="g">${money(u.saved)}</b><span>Saved by prompt cache</span></div>
      <div><b>${pct(u.cacheShare * 100)}</b><span>Input tokens served from cache</span></div>
    </div>`
}

async function loadUsage() {
  try {
    state.usage = await get('/api/usage')
    state.usageError = ''
  } catch (err) {
    state.usageError = err.message
  }
  if (state.inventory && USAGE_PAGES.has(state.page)) render()
}

export function needUsage(page) {
  if (USAGE_PAGES.has(page)) state.usageLoad ??= loadUsage()
}

export function renderDash() {
  const inv = state.inventory
  const tiles = [
    statTile('skills', 'Skills', counts(state.catalog.skill)),
    statTile('agents', 'Agents', counts(state.catalog.agent)),
    statTile('plugins', 'Plugins', counts(state.catalog.plugin)),
    statTile('hooks', 'Hooks', otherCounts(inv.hooks)),
    statTile('mcp', 'MCP servers', otherCounts(inv.mcp))
  ].join('')
  const favs = favoriteEntries()
    .filter((e) => e.item && visible(e.item))
    .slice(0, 6)
  const favHtml = favs.length
    ? `<ul class="rows" data-rows="dfav">${favs.map((e) => rowHtml(e.item, 'dfav', { cat: e.fav.category })).join('')}</ul>`
    : empty(inv.favorites.length ? 'No favorites in this scope.' : 'No favorites yet. Click the star on any row.')
  const more =
    inv.favorites.length > favs.length && favs.length
      ? '<button type="button" class="btn-link" data-go="fav">All favorites <span aria-hidden="true">→</span></button>'
      : ''
  const proj = [...state.catalog.skill, ...state.catalog.agent, ...state.catalog.plugin].filter(
    (i) => i.scope === 'project' && visible(i)
  )
  const projHtml = proj.length
    ? rowsHtml(proj, 'dproj')
    : empty(state.query ? `No project items match "${state.query}".` : 'No skills, agents, or plugins in ./.claude.')
  const errors = inv.errors?.length
    ? `<div class="warn"><b>${inv.errors.length} file${inv.errors.length > 1 ? 's' : ''} could not be read.</b> ${inv.errors.map((e) => `<code>${esc(tilde(e.path))}</code>: ${esc(e.error)}`).join('; ')}</div>`
    : ''
  $('p-dash').innerHTML = `${errors}
    ${usageHtml()}
    <div class="stats">${tiles}</div>
    <div class="two">
      <div><h2>Favorites ${more}</h2>${favHtml}${recentHtml()}</div>
      <div>
        <h2>This project</h2>
        ${projectOn() ? `${filesHtml()}<h2>Project items <span class="pill">${proj.length}</span></h2>${projHtml}` : projectOffHtml()}
      </div>
    </div>`
}

function recentHtml() {
  const all = [...state.catalog.skill, ...state.catalog.agent, ...state.catalog.plugin]
  if (!all.some((i) => typeof i.mtime === 'number')) return ''
  const recent = all
    .filter((i) => typeof i.mtime === 'number' && visible(i))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
  const body = recent.length
    ? `<ul class="clist">${recent
        .map(
          (i) =>
            `<li class="recent" data-key="${esc(i.key)}"><button type="button" class="btn-plain name" data-act="open">${esc(i.name)}</button><span class="ck">${esc(KIND_WORD[i.kind] ?? i.kind)} · ${esc(i.scope)}</span><span class="when" title="${esc(new Date(i.mtime).toLocaleString())}">${esc(ago(i.mtime))}</span></li>`
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
    [
      '.mcp.json',
      state.projectFiles ? state.projectFiles.has('.mcp.json') : inv.mcp.some((m) => m.origin === 'mcpjson'),
      'mcp'
    ]
  ]
  return `<ul class="clist files">${rows
    .map(
      ([name, yes, page]) =>
        `<li><span class="dot${yes ? ' yes' : ''}" aria-hidden="true"></span><button type="button" class="btn-plain fname" data-go="${page}" aria-label="${esc(`${name}, ${yes ? 'present' : 'not found'}. Open ${PAGES[page]}`)}">${esc(name)}</button><span class="${yes ? 'yes' : 'no'}">${yes ? 'present' : 'not found'}</span></li>`
    )
    .join('')}</ul>`
}
