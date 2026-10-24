import { esc, plural } from '../core/format.js'
import { cfg, state } from '../core/state.js'
import { projectOn } from '../logic/catalog.js'
import { cfgPanels } from '../logic/config.js'
import { EFF_GROUPS, SCOPE_KEY, SCOPE_TAG, effRows } from '../logic/effective.js'
import { empty } from '../ui/rows.js'

function effTag(scope) {
  const [label, cls] = SCOPE_TAG[scope] ?? [scope, '']
  const k = SCOPE_KEY[scope]
  return `<button type="button" class="tag ${cls}" data-c="efile" data-k="${k}" aria-label="${esc(`Open ${cfgPanels()[k]?.file ?? label}`)}">${label}</button>`
}

export function effValue(value) {
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

export function effectiveHtml() {
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
