import { get } from '../api.js'
import { $, insertText } from '../core/dom.js'
import { baseName, esc, fmtSize, parentDir, relTo, tilde } from '../core/format.js'
import { ICON, kindIcon } from '../core/icons.js'
import { dr, state } from '../core/state.js'
import { SETTINGS_FILE, isPluginOwned, ownerPlugin, pluginLabel } from '../logic/catalog.js'
import { HOOK_INFO, hookLabel, hookRunsFor } from '../logic/hooks.js'
import { highlight, isMd, previewHtml } from '../logic/markdown.js'
import { mcpTransport } from '../logic/mcp.js'
import { TEXT_EXT, drawerItem, isDirty, showPath } from './drawer.js'

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

export function fileBodyHtml(item, withFiles) {
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

export function pluginBodyHtml(item) {
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

export function setTab(tab) {
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

export function formatText(kind) {
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

export function onEditorInput() {
  updateDirty()
  if (dr.tab === 'preview') paintPreview()
}

export function updateDirty() {
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

export async function loadFile(file, { main = false } = {}) {
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

export async function loadDir(dir) {
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

export async function loadBackups() {
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

export function jsonBodyHtml(item) {
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
