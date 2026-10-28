import { $ } from '../core/dom.js'
import { compact, esc, modelName, money } from '../core/format.js'
import { state } from '../core/state.js'
import { findProject, lastActive, matchProjects, projectRows, projectTotals, sessionSpan } from '../logic/projects.js'
import { duration } from '../logic/usage.js'
import { go, render } from '../ui/nav.js'
import { periodHtml, periodLabel, refreshHtml } from '../ui/period.js'

export function openProject(name) {
  state.projectSel = name || null
  if (state.page === 'projects') render()
  else go('projects')
}

function when(ms) {
  if (ms === null) return '—'
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function headHtml(title) {
  return `<div class="proj-head">
      <h2>${title}</h2>
      ${periodHtml()}
      ${refreshHtml()}
    </div>`
}

function listHtml(rows) {
  const shown = matchProjects(rows, state.query)
  const head = headHtml(
    `All projects <span class="pill">${rows.length}</span><span class="hint">${esc(periodLabel())}</span>`
  )
  if (!rows.length) return `${head}<p class="empty">No use in this period.</p>`
  if (!shown.length) return `${head}<p class="empty">No projects match "${esc(state.query)}".</p>`
  const max = Math.max(1e-9, ...rows.map((r) => r.cost))
  const body = shown
    .map((r) => {
      const last = lastActive(r)
      return `<tr>
          <td><button type="button" class="btn-plain proj-open" data-proj="${esc(r.project)}" aria-label="${esc(`Open the sessions of ${r.project}`)}"><code>${esc(r.project)}</code></button><div class="pbar"><span style="width:${((r.cost / max) * 100).toFixed(1)}%"></span></div></td>
          <td class="num">${r.sessions.toLocaleString('en-US')}</td>
          <td class="num">${compact(r.tokens)}</td>
          <td class="num">${money(r.cost)}</td>
          <td class="num when">${esc(when(last))}</td>
        </tr>`
    })
    .join('')
  return `${head}<p class="note">Click a project to see the cost of each session.</p>
    <div class="eff-wrap pwrap"><table class="eff ptable">
      <thead><tr><th>Project</th><th class="num">Sessions</th><th class="num">Tokens</th><th class="num">Cost</th><th class="num">Last active</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`
}

function sessionsHtml(row) {
  const back =
    '<button type="button" class="btn-link" data-proj=""><span aria-hidden="true">←</span> All projects</button>'
  const title = headHtml(`<code>${esc(state.projectSel)}</code><span class="hint">${esc(periodLabel())}</span>`)
  if (!row) return `${back}${title}<p class="empty">No use of this project in this period.</p>`
  const list = row.list ?? []
  const { responses, longest } = projectTotals(row)
  const max = Math.max(1e-9, ...list.map((s) => s.cost))
  const body = list
    .map(
      (s) => `<tr>
          <td><span class="when">${esc(when(s.start))}</span><div class="sid" title="${esc(s.id)}"><code>${esc(s.id.slice(0, 8))}</code></div><div class="pbar"><span style="width:${((s.cost / max) * 100).toFixed(1)}%"></span></div></td>
          <td class="num">${esc(duration(sessionSpan(s)))}</td>
          <td>${s.models.map((m) => `<span class="mtag">${esc(modelName(m))}</span>`).join('')}</td>
          <td class="num">${s.responses.toLocaleString('en-US')}</td>
          <td class="num">${compact(s.tokens)}</td>
          <td class="num">${money(s.cost)}</td>
        </tr>`
    )
    .join('')
  return `${back}${title}
    <div class="utiles">
      <div><b>${money(row.cost)}</b><span>Cost</span></div>
      <div><b>${compact(row.tokens)}</b><span>Tokens</span></div>
      <div><b>${row.sessions.toLocaleString('en-US')}</b><span>Sessions · ${responses.toLocaleString('en-US')} responses</span></div>
      <div><b>${esc(duration(longest))}</b><span>Longest session</span></div>
    </div>
    <h2>Sessions <span class="pill">${list.length}</span><span class="hint">newest first</span></h2>
    <div class="eff-wrap pwrap"><table class="eff ptable stable">
      <thead><tr><th>Started</th><th class="num">Length</th><th>Models</th><th class="num">Responses</th><th class="num">Tokens</th><th class="num">Cost</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`
}

function bodyHtml() {
  const source = '<code>~/.claude/projects</code>'
  if (state.usageError) return `<p class="empty">Could not read usage from ${source}: ${esc(state.usageError)}</p>`
  if (!state.usage) return `<p class="empty" aria-busy="true">Reading usage from ${source}…</p>`
  const rows = projectRows()
  return state.projectSel ? sessionsHtml(findProject(rows, state.projectSel)) : listHtml(rows)
}

export function renderProjects() {
  $('p-projects').innerHTML =
    `<p class="note proj-intro">Cost and tokens per project, from the session files in <code>~/.claude/projects</code>. A project is the folder where a session started.</p>${bodyHtml()}`
}
