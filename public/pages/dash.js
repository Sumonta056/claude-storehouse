import { get } from '../api.js'
import { $, toast } from '../core/dom.js'
import { ago, compact, esc, money, monthName, tilde } from '../core/format.js'
import { PERIOD_KEY, state } from '../core/state.js'
import { KIND_WORD, PAGES, counts, favoriteEntries, otherCounts, projectOn, visible } from '../logic/catalog.js'
import { USAGE_PAGES, blockProgress, clock, duration, modelShares, niceMax } from '../logic/usage.js'
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
          <button type="button" class="btn-link" data-urefresh${state.usageBusy ? ' disabled aria-busy="true"' : ''}>${state.usageBusy ? 'Refreshing…' : 'Refresh'}</button>
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

function dayLabel(date) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleString('en-GB', { day: 'numeric', month: 'short' })
}

function blockHtml(block) {
  const head = '<div class="k">Current 5-hour block <span class="hint">estimate</span></div>'
  if (!block || Date.now() >= block.end)
    return `<div class="ucard">${head}<p class="note">No active block. A block starts with the next Claude Code response and lasts 5 hours.</p></div>`
  const { pct, left } = blockProgress(block, Date.now())
  return `<div class="ucard">${head}
      <div class="v">${money(block.cost)}<small>since ${clock(block.start)}</small></div>
      <div class="prog" role="img" aria-label="${pct} percent of the block has passed"><span style="width:${pct}%"></span></div>
      <div class="row2"><span>Resets at ${clock(block.end)} · in ${duration(left)}</span><span>Burn rate: ${money(block.burnPerHour)} / h</span></div>
      <div class="row2"><span>Tokens in this block: ${compact(block.tokens)}</span><span>At this rate: ${money(block.projected)} by ${clock(block.end)}</span></div>
    </div>`
}

function dailyHtml(days) {
  const W = 560
  const H = 120
  const top = niceMax(Math.max(...days.map((d) => d.cost)))
  const y = (v) => H - (v / top) * H
  const bw = W / days.length
  const dollars = (v) => `$${+v.toFixed(2)}`
  const marks = [top, top / 2, 0]
  const grid = marks
    .map((v) => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" vector-effect="non-scaling-stroke"/>`)
    .join('')
  const bars = days
    .map((d, i) => {
      const h = Math.max(H - y(d.cost), 1)
      const cls = i === days.length - 1 ? ' class="today"' : ''
      return `<rect${cls} x="${i * bw + 3}" y="${H - h}" width="${bw - 6}" height="${h}" vector-effect="non-scaling-stroke"><title>${dayLabel(d.date)}: ${money(d.cost)}</title></rect>`
    })
    .join('')
  const high = days.reduce((a, b) => (b.cost > a.cost ? b : a))
  const label = `Cost per day for the last 14 days. Today ${money(days.at(-1).cost)}. Highest ${money(high.cost)} on ${dayLabel(high.date)}.`
  return `<div class="ucard daily">
      <div class="k">Cost per day · last 14 days</div>
      <div class="chart">
        <div class="yax" aria-hidden="true">${marks.map((v) => `<span>${dollars(v)}</span>`).join('')}</div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}">${grid}${bars}</svg>
        <div class="xax" aria-hidden="true"><span>${dayLabel(days[0].date)}</span><span>Today</span></div>
      </div>
    </div>`
}

function projectsHtml(rows) {
  const head = `<h2>Cost by project <span class="pill">${rows.length}</span><span class="hint">This month</span></h2>`
  if (!rows.length) return `${head}<p class="empty">No use this month.</p>`
  const max = Math.max(...rows.map((r) => r.cost)) || 1
  const body = rows
    .map(
      (r) =>
        `<tr><td><code>${esc(r.project)}</code><div class="pbar"><span style="width:${((r.cost / max) * 100).toFixed(1)}%"></span></div></td><td class="num">${r.sessions.toLocaleString('en-US')}</td><td class="num">${compact(r.tokens)}</td><td class="num">${money(r.cost)}</td></tr>`
    )
    .join('')
  return `${head}<div class="eff-wrap pwrap"><table class="eff ptable">
      <thead><tr><th>Project</th><th class="num">Sessions</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`
}

function usageExtrasHtml() {
  const u = state.usage
  if (state.usageError || !u?.all?.responses || !u.days?.length || !Array.isArray(u.byProject)) return ''
  return `<div class="blk">${blockHtml(u.block)}${dailyHtml(u.days)}</div>${projectsHtml(u.byProject)}`
}

async function loadUsage() {
  try {
    state.usage = await get('/api/usage')
    state.usageError = ''
  } catch (err) {
    if (state.usage) toast(`Could not refresh usage: ${err.message}`, true)
    else state.usageError = err.message
  }
  if (state.inventory && USAGE_PAGES.has(state.page)) render()
}

export async function refreshUsage() {
  if (state.usageBusy) return
  state.usageBusy = true
  render()
  try {
    state.usageLoad = loadUsage()
    await state.usageLoad
  } finally {
    state.usageBusy = false
    if (state.inventory && USAGE_PAGES.has(state.page)) render()
    const active = document.activeElement
    if (!active || active === document.body) document.querySelector('[data-urefresh]')?.focus()
  }
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
    ${usageHtml()}${usageExtrasHtml()}
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
