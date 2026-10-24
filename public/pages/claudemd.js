import { projectOffHtml, render } from '../app.js'
import { $, ask } from '../core/dom.js'
import { esc, fmtSize, lineCount, plural, tilde } from '../core/format.js'
import { eds, msgs } from '../core/state.js'
import { projectOn } from '../logic/catalog.js'
import { MD_ORDER, cfgPanels, cmd, edDirty, mdDirtyKey } from '../logic/config.js'
import { previewHtml } from '../logic/markdown.js'
import { backupsBtn, ensureEd, missingHtml, msgHtml, panelBackupsHtml } from '../ui/config-panels.js'

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

export function renderClaudeMd() {
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

export async function discardMd(k) {
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

export async function pickMd(k) {
  if (!MD_ORDER.includes(k)) return false
  if (k === cmd.sel) return true
  const dirty = mdDirtyKey()
  if (dirty && !(await discardMd(dirty))) return false
  cmd.sel = k
  render()
  return true
}
