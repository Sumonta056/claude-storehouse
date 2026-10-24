import { get, send } from '../api.js'
import { refresh } from '../core/actions.js'
import { $, showBanner, toast } from '../core/dom.js'
import { ago, esc, tilde } from '../core/format.js'
import { pending } from '../core/state.js'

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

export async function undo(id) {
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
