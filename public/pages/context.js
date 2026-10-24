import { $ } from '../core/dom.js'
import { esc, plural, tilde, tok } from '../core/format.js'
import { kindIcon } from '../core/icons.js'
import { chipFilter, state } from '../core/state.js'
import { visible } from '../logic/catalog.js'
import { CTX_TYPES, TOKEN_BYTES, contextItems, keepCtx, sumTokens } from '../logic/context.js'
import { duplicateGroups } from '../logic/duplicates.js'
import { chipsHtml } from '../ui/chips.js'
import { empty, nothingMatches, rowHtml } from '../ui/rows.js'

function tokHtml(n, max, label = tok(n)) {
  const width = max && n ? Math.max(4, (n / max) * 100) : 0
  return `<div class="tok"><span>${esc(label)}</span><span class="mini" aria-hidden="true"><span style="width:${width}%"></span></span></div>`
}

function ctxNote(e, dups) {
  const bits = []
  if (e.type === 'mcp') bits.push('<span class="mchip">Tool names load at start. Not measured.</span>')
  else if (e.item && !e.enabled) bits.push(`<span class="mchip okc">Saves ${tok(e.cost)} while off</span>`)
  else if (e.type === 'rules' && e.conditional) bits.push(`<span class="mchip">On use: ${tok(e.onUse)}</span>`)
  else if (e.item) bits.push(`<span class="mchip">Body on use: ${tok(e.onUse)}</span>`)
  if (dups.has(e.key))
    bits.push(
      `<button type="button" class="mchip btn-plain dupc" data-go="dups">Same name as another ${esc(e.kind === 'mcp' ? 'MCP server' : e.kind)}</button>`
    )
  return `<p class="meta chips-s">${bits.join('')}</p>`
}

function ctxFileRow(e, max, dups) {
  const where = e.scope === 'global' ? 'Global' : 'Project'
  const dir = state.inventory.project?.dir
  const file = dir && e.path.startsWith(dir) ? `.${e.path.slice(dir.length)}` : tilde(e.path)
  const name =
    e.type === 'claudemd'
      ? `<button type="button" class="name btn-plain" data-go="claudemd">${esc(e.name)}</button>`
      : `<span class="name">${esc(e.name)}</span>`
  return `<li class="lrow ctx-file">
    <div class="lead"><span class="lead-ic" role="img" aria-label="${esc(e.type === 'claudemd' ? 'CLAUDE.md file' : 'Rule file')}" title="${esc(tilde(e.path))}">${kindIcon('file', 18)}</span></div>
    <div class="body">
      <div class="l1">${name}<span class="src">${esc(`${where} · ${file}`)}</span></div>
      <p class="desc">${esc(e.description)}</p>
      ${e.conditional ? ctxNote(e, dups) : ''}
    </div>
    ${tokHtml(e.always, max)}
  </li>`
}

function ctxRow(e, max, dups) {
  if (!e.item) return ctxFileRow(e, max, dups)
  const right = e.type === 'mcp' ? tokHtml(0, max, 'not measured') : tokHtml(e.always, max)
  return rowHtml(e.item, 'context', { right, note: ctxNote(e, dups) })
}

function contextBandHtml(list) {
  const total = sumTokens(list)
  const types = CTX_TYPES.map(([type, label, cls]) => ({
    label,
    cls,
    n: sumTokens(list.filter((e) => e.type === type))
  })).filter((t) => t.n)
  const pct = (n) => `${total ? ((n / total) * 100).toFixed(0) : 0}%`
  const top = [...types].sort((a, b) => b.n - a.n)[0]
  const on = (type) => list.filter((e) => e.type === type && e.always).length
  const parts = [
    plural(on('claudemd'), 'CLAUDE.md file'),
    plural(on('rules'), 'rule'),
    plural(on('skills'), 'skill'),
    plural(on('agents'), 'agent')
  ]
  return `<section class="usage" aria-label="Context cost">
      <div>
        <div class="k">Loaded in every session</div>
        <div class="big" id="ctx-total">${total.toLocaleString('en-US')}<small> tokens</small></div>
        <p>Estimate: file bytes ÷ ${TOKEN_BYTES}. Run <code>/context</code> in Claude Code for exact numbers.<br>${esc(parts.join(' · '))} · MCP servers not measured · <code>@path</code> imports not followed</p>
      </div>
      <div class="right">
        <div class="k">By type</div>
        <div class="mon">${top ? esc(top.label) : 'Nothing'}<span>${top ? `${pct(top.n)} of the total` : 'loads at start'}</span></div>
        <div class="bar" role="img" aria-label="${esc(`Context by type: ${types.map((t) => `${t.label} ${pct(t.n)}`).join(', ')}`)}">${types
          .map((t) => `<span class="${t.cls}" style="width:${pct(t.n)}"></span>`)
          .join('')}</div>
        <div class="legend">${types.map((t) => `<span><i class="${t.cls}"></i>${esc(t.label)} ${pct(t.n)}</span>`).join('')}</div>
      </div>
    </section>`
}

export function renderContext() {
  const all = contextItems().filter(visible)
  const off = chipFilter.context === 'off'
  const shown = all.filter((e) => keepCtx(e, chipFilter.context))
  const max = Math.max(1, ...all.map((e) => e.always))
  const dups = new Set(duplicateGroups().flatMap((g) => g.items.map((i) => i.key)))
  const note =
    'Sorted by tokens. Switch off a large item to give the context window back. Changes apply at the next session.'
  const body = shown.length
    ? `<h2>${off ? 'Switched off' : 'Biggest items'} <span class="pill">${shown.length}</span><span class="hint">${esc(off ? `${tok(shown.reduce((sum, e) => sum + (e.cost ?? 0), 0))} saved while off` : `${tok(sumTokens(shown))} at session start`)}</span></h2><ul class="rows" data-rows="context">${shown.map((e) => ctxRow(e, max, dups)).join('')}</ul>`
    : all.length
      ? empty('No items match this filter.')
      : nothingMatches()
  $('p-context').innerHTML = contextBandHtml(all) + chipsHtml('context', all, note) + body
}
