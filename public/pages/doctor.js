import { send } from '../api.js'
import { guarded, refresh } from '../core/actions.js'
import { $, toast } from '../core/dom.js'
import { esc, plural, tilde } from '../core/format.js'
import { ICON } from '../core/icons.js'
import { chipFilter, state } from '../core/state.js'
import { PAGES } from '../logic/catalog.js'
import { DOC_KIND, DOC_SEVERITY, doctorIssues, doctorItem, doctorMatches } from '../logic/doctor.js'
import { chipsHtml } from '../ui/chips.js'
import { openDrawer } from '../ui/drawer.js'
import { empty, nothingMatches } from '../ui/rows.js'

function doctorButton(issue) {
  if (issue.target?.page)
    return `<button type="button" class="btn" data-go="${esc(issue.target.page)}">Open ${esc(PAGES[issue.target.page])}</button>`
  if (doctorItem(issue.target)) return '<button type="button" class="btn" data-doc-act="item">Open item</button>'
  if (issue.file) return '<button type="button" class="btn" data-doc-act="file">Open file</button>'
  return ''
}

function doctorRowHtml(issue) {
  const where = [DOC_KIND[issue.kind] ?? issue.kind, issue.file ? tilde(issue.file) : ''].filter(Boolean).join(' · ')
  const label = DOC_SEVERITY.find(([k]) => k === issue.severity)?.[1] ?? issue.severity
  return `<li class="lrow drow" data-doc="${esc(issue.id)}">
    <div class="lead"><span class="lead-ic sev-${esc(issue.severity)}" role="img" aria-label="${esc(label)}">${ICON[issue.severity === 'warning' ? 'warn' : issue.severity]}</span></div>
    <div class="body">
      <div class="l1"><span class="name">${esc(issue.name)}</span><span class="src">${esc(where)}</span></div>
      <p class="desc">${esc(issue.message)}</p>
    </div>
    <div class="tail">${doctorButton(issue)}</div>
  </li>`
}

export function renderDoctor() {
  const note = `Doctor reads your config and finds files and items that are broken or that do not do what they say. It never changes a file. <button type="button" class="btn" id="doc-again">Check again</button>`
  if (state.doctor?.error) {
    $('p-doctor').innerHTML = empty(`Doctor could not run: ${state.doctor.error}`)
    return
  }
  const all = doctorIssues().filter(doctorMatches)
  const f = chipFilter.doctor
  const groups = DOC_SEVERITY.filter(([k]) => f === 'all' || f === k)
    .map(([k, title, hint]) => [k, title, hint, all.filter((i) => i.severity === k)])
    .filter(([, , , list]) => list.length)
  let body
  if (groups.length)
    body = groups
      .map(
        ([k, title, hint, list]) =>
          `<h2>${esc(title)} <span class="pill">${list.length}</span><span class="hint">${esc(hint)}</span></h2><ul class="rows" data-rows="doctor-${k}">${list.map(doctorRowHtml).join('')}</ul>`
      )
      .join('')
  else if (!doctorIssues().length)
    body = empty(`No issues found. Doctor checked ${plural(state.doctor?.checked ?? 0, 'file')}.`)
  else if (all.length) body = empty('No issues of this type.')
  else body = nothingMatches()
  $('p-doctor').innerHTML = chipsHtml('doctor', all, note) + body
}

export function onDoctor(row, e) {
  const issue = doctorIssues().find((i) => i.id === row.dataset.doc)
  const act = e.target.closest('[data-doc-act]')?.dataset.docAct
  if (!issue || !act) return
  if (act === 'item') {
    const item = doctorItem(issue.target)
    if (item) openDrawer(item)
    return
  }
  guarded(`doc-open-${issue.id}`, async () => {
    try {
      await send('POST', '/api/open', { path: issue.file, app: 'editor' })
      toast(`Opened ${tilde(issue.file)}`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

export async function checkAgain() {
  try {
    await refresh()
    toast(`Doctor checked ${plural(state.doctor?.checked ?? 0, 'file')}`)
  } catch (err) {
    toast(`Could not check again: ${err.message}`, true)
  }
}
