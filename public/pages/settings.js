import { get, send } from '../api.js'
import { projectOffHtml, render } from '../app.js'
import { afterWrite, askReload, busy } from '../core/actions.js'
import { $, ask, showBanner, toast } from '../core/dom.js'
import { esc, isPlain, opt, plural, tilde } from '../core/format.js'
import { cfg, eds } from '../core/state.js'
import { projectOn } from '../logic/catalog.js'
import {
  ELSEWHERE,
  FORM_FIELDS,
  FORM_GROUPS,
  SET_ORDER,
  cfgPanels,
  edDirty,
  elsewhereText,
  fieldGet,
  fieldPath,
  fieldSet,
  formValue,
  lockedKeys,
  lockedText,
  setData,
  setDirty,
  sformDirtyKeys,
  sformValues,
  shortValue
} from '../logic/config.js'
import { SCOPE_KEY, effRow, effRows } from '../logic/effective.js'
import { effValue, effectiveHtml } from './effective.js'
import { backupsBtn, ensureEd, missingHtml, msgHtml, panelBackupsHtml } from '../ui/config-panels.js'

const SET_WHERE = { sg: 'every project', sp: 'this folder · in git', sl: 'this folder · only you' }

const SET_ABOUT = {
  sg: 'This file applies to every project on this computer.',
  sp: 'This file is for the team. It goes into git with the project.',
  sl: 'This file is only for you. Git ignores it. Storehouse writes your on/off switches for this folder here.'
}

function sformState(k) {
  const dirty = sformDirtyKeys(k)
  return dirty.length
    ? `● ${plural(dirty.length, 'unsaved change')} · ${dirty.join(', ')}`
    : `${plural(Object.keys(setData(k)).length, 'key')} · Saved`
}

export function sformChrome(k) {
  const dirty = sformDirtyKeys(k)
  const mark = $(`${k}-fdirty`)
  if (mark) {
    mark.textContent = sformState(k)
    mark.classList.toggle('is-dirty', dirty.length > 0)
  }
  for (const id of [`${k}-fsave`, `${k}-freset`]) {
    const b = $(id)
    if (b) b.disabled = !dirty.length
  }
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = setDirty(k) ? '● unsaved' : ''
  for (const f of FORM_FIELDS) $(`sf-${f.key}`)?.closest('.srow')?.classList.toggle('changed', dirty.includes(f.key))
}

function fieldHtml(k, f, v, data, locked, changed) {
  const id = `sf-${f.key}`
  const name = `${esc(f.name)} <span class="key">${esc(f.key)}</span>`
  const head =
    f.type === 'switch' ? `<span class="t" id="${id}-l">${name}</span>` : `<label class="t" for="${id}">${name}</label>`
  const help =
    f.key === 'permissions.defaultMode' && k !== 'sg'
      ? `${f.help} <code>auto</code> and <code>bypassPermissions</code> do not work from this file.`
      : f.help
  let ctl
  if (locked) {
    const value = fieldGet(data, f) ?? data[fieldPath(f)[0]]
    ctl = `<span class="note">${esc(`${lockedText(value)} — edit in Raw JSON`)}</span>`
  } else if (f.type === 'switch') {
    ctl = `<button type="button" class="sw" role="switch" id="${id}" data-c="sfsw" data-v="${f.key}" aria-checked="${v[f.key] ? 'true' : 'false'}" aria-labelledby="${id}-l"></button>`
  } else if (f.type === 'select') {
    const opts = [['', '(not set)'], ...f.options.map((o) => [o, o])]
    for (const extra of [cfg.sforms[k]?.base[f.key], v[f.key]]) {
      if (extra && !opts.some(([o]) => o === extra)) opts.push([extra, `${extra} (current)`])
    }
    ctl = `<select id="${id}" data-sf="${f.key}">${opts.map(([o, label]) => opt(o, label, v[f.key])).join('')}</select>`
  } else {
    ctl = `<input id="${id}" data-sf="${f.key}" value="${esc(v[f.key])}" placeholder="not set" autocomplete="off" spellcheck="false">`
  }
  return `<div class="srow${changed ? ' changed' : ''}"><div class="lbl">${head}<p>${help}</p>${formHint(k, f)}</div><div class="ctl">${ctl}</div></div>`
}

function rulesHtml(data) {
  const perms = isPlain(data.permissions) ? data.permissions : {}
  const col = (key, label) => {
    const list = Array.isArray(perms[key]) ? perms[key] : []
    const items = list.length
      ? list.map((r) => `<span class="fm-chip">${esc(typeof r === 'string' ? r : JSON.stringify(r))}</span>`).join('')
      : '<span class="none">No rules</span>'
    return `<div><h4>${label} <b>${list.length}</b></h4>${items}</div>`
  }
  return `<div class="sgroup"><h3>Permission rules <span class="hint">Read-only here · edit in Raw JSON</span></h3><div class="rules">${col('allow', 'Allow')}${col('ask', 'Ask')}${col('deny', 'Deny')}</div></div>`
}

function elsewhereHtml(data) {
  const rows = ELSEWHERE.filter(([key]) => data[key] !== undefined).map(
    ([key, page, label]) =>
      `<li><code>${key}</code><span class="s">${esc(elsewhereText(key, data[key]))}</span><button type="button" class="btn" data-go="${page}">Open ${label}</button></li>`
  )
  if (!rows.length) return ''
  return `<div class="sgroup"><h3>Managed on other pages <span class="hint">${plural(rows.length, 'key')}</span></h3><ul class="lrows">${rows.join('')}</ul></div>`
}

function otherKeysHtml(data) {
  const known = new Set([...FORM_FIELDS.map((f) => fieldPath(f)[0]), ...ELSEWHERE.map(([key]) => key)])
  const rows = Object.keys(data)
    .filter((key) => !known.has(key))
    .map((key) => [key, data[key]])
  if (isPlain(data.permissions)) {
    for (const key of Object.keys(data.permissions)) {
      if (!['allow', 'ask', 'deny', 'defaultMode'].includes(key))
        rows.push([`permissions.${key}`, data.permissions[key]])
    }
  }
  if (!rows.length) return ''
  return `<div class="sgroup"><h3>Other keys <span class="hint">Edit in Raw JSON</span></h3><ul class="lrows">${rows
    .map(
      ([key, value]) =>
        `<li><code>${esc(key)}</code><span class="s">${esc(shortValue(value))}</span><button type="button" class="btn-link" data-c="stab" data-v="raw">Show in Raw JSON</button></li>`
    )
    .join('')}</ul></div>`
}

function settingsFormHtml(k) {
  const data = setData(k)
  const v = sformValues(k)
  const locked = lockedKeys(k)
  const dirty = sformDirtyKeys(k)
  const groups = FORM_GROUPS.map(([group, title]) => {
    const fields = FORM_FIELDS.filter((f) => f.group === group)
    const rows = fields.map((f) => fieldHtml(k, f, v, data, locked.includes(f.key), dirty.includes(f.key))).join('')
    return `<div class="sgroup"><h3>${title} <span class="hint">${plural(fields.length, 'key')}</span></h3>${rows}</div>`
  }).join('')
  return `${groups}${rulesHtml(data)}${elsewhereHtml(data)}${otherKeysHtml(data)}`
}

function setKeys() {
  return projectOn() ? SET_ORDER : ['sg']
}

function setSelected(panels) {
  const keys = setKeys()
  if (!cfg.ssel || !keys.includes(cfg.ssel)) cfg.ssel = keys.find((k) => panels[k].info?.exists) ?? keys[0]
  return cfg.ssel
}

function setMeta(k, p) {
  const info = p.info
  const pill = p.pill ? ` · ${p.pill}` : ''
  if (!info) return 'Could not be scanned'
  if (!info.exists) return `Not found${pill}`
  if (!info.ok) return `Invalid JSON${pill}`
  return `${plural(Object.keys(setData(k)).length, 'key')} · ${SET_WHERE[k]}${pill}`
}

function setListHtml(panels, sel) {
  return setKeys()
    .map((k, i) => {
      const p = panels[k]
      const exists = Boolean(p.info?.exists)
      const cur = k === sel
      const create =
        p.info && !exists
          ? `<button type="button" class="btn" id="cm-create-${k}" data-c="create" data-k="${k}" data-v="empty" aria-label="${esc(`Create ${p.file}`)}">Create</button>`
          : ''
      return `<li class="cm-file${cur ? ' cur' : ''}${exists ? '' : ' missing'}">
        <span class="cm-num" aria-hidden="true">${exists ? i + 1 : '–'}</span>
        <button type="button" class="cm-pick" id="cm-pick-${k}" data-c="spick" data-k="${k}"${cur ? ' aria-current="true"' : ''}>
          <span class="cm-label">${esc(p.label)}<span class="dirty" id="cm-dot-${k}">${setDirty(k) ? '● unsaved' : ''}</span></span>
          <span class="cm-path">${esc(p.file)}</span>
          <span class="cm-meta">${esc(setMeta(k, p))}</span>
        </button>
        ${create}
      </li>`
    })
    .join('')
}

function setBarHtml(k, p, form, dirty, stateText) {
  const del = p.del
    ? `<button type="button" class="btn danger ghost" id="${k}-del" data-c="delete" data-k="${k}">Delete…</button>`
    : ''
  const undo = form
    ? `<button type="button" class="btn ghost" id="${k}-freset" data-c="freset"${dirty ? '' : ' disabled'}>Reset</button>`
    : `<button type="button" class="btn ghost" id="${k}-cancel" data-c="cancel" data-k="${k}"${dirty ? '' : ' hidden'}>Discard</button>`
  const save = form
    ? `<button type="button" class="btn p" id="${k}-fsave" data-c="fsave"${dirty ? '' : ' disabled'}>Save</button>`
    : `<button type="button" class="btn p" id="${k}-save" data-c="save" data-k="${k}"${dirty ? '' : ' disabled'}>Save</button>`
  return `<div class="cm-bar">
      ${del}
      <span class="cm-state${dirty ? ' is-dirty' : ''}" id="${k}-${form ? 'fdirty' : 'dirty'}" aria-live="polite">${esc(stateText)}</span>
      ${undo}
      ${backupsBtn(k)}
      <button type="button" class="btn" id="${k}-open" data-c="editor" data-k="${k}">Open in editor</button>
      ${save}
    </div>`
}

function settingsPanelHtml(k, p) {
  const info = p.info
  const pill = p.pill ? `<span class="pill">${esc(p.pill)}</span>` : ''
  const broken = Boolean(info?.exists && !info.ok)
  const tab = broken ? 'raw' : cfg.stab
  const tabs = info?.exists
    ? `<div class="tabs" role="tablist" aria-label="View">${[
        ['form', 'Form'],
        ['raw', 'Raw JSON']
      ]
        .map(
          ([value, label]) =>
            `<button type="button" role="tab" id="${k}-tab-${value}" data-c="stab" data-v="${value}" aria-selected="${tab === value}" aria-controls="${k}-pane"${value === 'form' && broken ? ' disabled title="Fix the JSON first"' : ''}>${label}</button>`
        )
        .join('')}</div>`
    : ''
  const head = `<div class="cm-head"><div class="cm-title"><h2 id="${k}-h">${esc(p.label)}${pill}</h2><code class="cm-path">${esc(info ? tilde(info.path) : p.file)}</code></div>${tabs}</div>`
  let body
  let bar = ''
  if (!info) body = '<div class="warn">This file could not be scanned.</div>'
  else if (!info.exists) body = `<p class="note">${SET_ABOUT[k]}</p>${missingHtml(k, p)}`
  else if (tab === 'form') {
    const dirty = sformDirtyKeys(k).length > 0
    body = `<p class="form-err" id="${k}-ferr" role="alert">${esc(cfg.sformMsg)}</p><div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-tab-form">${settingsFormHtml(k)}</div>${panelBackupsHtml(k)}`
    bar = setBarHtml(k, p, true, dirty, sformState(k))
  } else {
    ensureEd(k, info.path)
    const ed = eds[k]
    const warn = broken
      ? `<div class="warn">${esc(`Cannot parse ${p.file}: ${info.error}. Fix it here. The form comes back once the file parses.`)}</div>`
      : ''
    if (!ed || ed.status === 'loading') body = '<p class="note">Loading…</p>'
    else if (ed.status === 'error')
      body = `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
    else {
      const dirty = edDirty(ed)
      body = `${warn}${msgHtml(k)}<div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-tab-raw"><textarea id="${k}-txt" class="ed" data-ed="${k}" spellcheck="false" aria-label="${esc(`${p.file} contents`)}">\n${esc(ed.text)}</textarea></div>${panelBackupsHtml(k)}`
      bar = setBarHtml(k, p, false, dirty, dirty ? '● Unsaved changes' : 'Saved')
    }
  }
  return `<section class="panel cm-panel" aria-labelledby="${k}-h">${head}<div class="cm-body">${body}</div>${bar}</section>`
}

export function renderSettings() {
  const panels = cfgPanels()
  const sel = setSelected(panels)
  const arrow = projectOn() ? '<span class="arrow">1 Global <span class="bar"></span> 3 Project local</span>' : ''
  const view = cfg.sview === 'effective' ? 'effective' : 'files'
  const vtab = (value, label) =>
    `<button type="button" role="tab" id="sv-${value}" data-c="sview" data-v="${value}" aria-selected="${view === value}">${label}</button>`
  const top = `<div class="st-top"><p class="note">Claude Code reads these files at the start of a session in this folder. Each save writes a backup to <code>~/.claude/backups/storehouse/</code> first.</p><div class="vtabs" role="tablist" aria-label="Settings view">${vtab('files', 'Files')}${vtab('effective', `Effective <span class="n">${plural(effRows().length, 'key')}</span>`)}</div></div>`
  if (view === 'effective') {
    $('p-settings').innerHTML = `${top}${effectiveHtml()}`
    return
  }
  $('p-settings').innerHTML = `${top}
    <div class="cm">
      <nav class="cm-nav" aria-label="Settings files">
        <ul class="cm-list">${setListHtml(panels, sel)}</ul>
        <div class="prec"><b>Which file wins?</b><span>When two files set the same key, the higher number wins. Lists such as <code>permissions.allow</code> add up from all files. A deny rule in any file blocks the tool.</span>${arrow}</div>
        ${projectOn() ? '' : projectOffHtml()}
      </nav>
      ${settingsPanelHtml(sel, panels[sel])}
    </div>`
}

function formHint(k, f) {
  const r = effRow(f.key)
  if (!r || r.merged) return ''
  const scope = Object.keys(SCOPE_KEY).find((s) => SCOPE_KEY[s] === k)
  if (r.ignored?.some((o) => o.file === scope))
    return '<span class="ovr">Claude Code ignores this value in this file.</span>'
  if (!r.from || r.from === scope) return ''
  const order = ['global', 'project', 'projectLocal']
  if (order.indexOf(r.from) < order.indexOf(scope)) return ''
  return `<span class="ovr">↑ ${esc(cfgPanels()[SCOPE_KEY[r.from]].label)} sets ${effValue(r.value)}. That value wins in this folder.</span>`
}

export async function pickSet(k) {
  if (!SET_ORDER.includes(k)) return false
  if (k === cfg.ssel) return true
  const cur = cfg.ssel
  if (cur && setDirty(cur)) {
    const yes = await ask({
      title: 'Discard changes?',
      message: `Your unsaved edits in ${cfgPanels()[cur].file} are lost.`,
      ok: 'Discard',
      danger: true
    })
    if (!yes) return false
    delete cfg.sforms[cur]
    if (eds[cur]) eds[cur].text = eds[cur].loaded
  }
  cfg.ssel = k
  cfg.sformMsg = ''
  render()
  return true
}

export async function setSettingsTab(tab) {
  const k = cfg.ssel
  if (tab === cfg.stab) {
    $(`${k}-tab-${tab}`)?.focus()
    return
  }
  if (tab === 'raw' && sformDirtyKeys(k).length) {
    const yes = await ask({
      title: 'Discard form changes?',
      message: 'Raw JSON shows the file on disk. Your unsaved form changes are lost.',
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
    delete cfg.sforms[k]
  }
  if (tab === 'form' && edDirty(eds[k])) {
    const yes = await ask({
      title: 'Discard JSON changes?',
      message: 'The form shows the file on disk. Your unsaved Raw JSON edits are lost.',
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
    eds[k].text = eds[k].loaded
  }
  cfg.stab = tab
  cfg.sformMsg = ''
  render()
  $(`${k}-tab-${tab}`)?.focus()
}

export function saveSettingsForm() {
  return busy('sform', async () => {
    const k = cfg.ssel
    const info = cfgPanels()[k]?.info
    const keys = sformDirtyKeys(k)
    if (!keys.length || !info) return
    cfg.sformMsg = ''
    try {
      let data = {}
      let stamp = null
      try {
        const res = await get(`/api/file?path=${encodeURIComponent(info.path)}`)
        stamp = res.stamp
        try {
          data = JSON.parse(res.content ?? '')
        } catch (err) {
          throw new Error(`${tilde(info.path)} does not parse: ${err.message}. Fix it in Raw JSON.`, { cause: err })
        }
      } catch (err) {
        if (err.status !== 404) throw err
      }
      if (!isPlain(data)) throw new Error(`${tilde(info.path)} does not hold a JSON object.`)
      for (const key of keys) {
        const f = FORM_FIELDS.find((x) => x.key === key)
        const parent = f.path ? data[f.path[0]] : data
        if (parent !== undefined && !isPlain(parent))
          throw new Error(`${f.path[0]} in ${tilde(info.path)} is not an object. Fix it in Raw JSON.`)
        fieldSet(data, f, formValue(cfg.sforms[k].values[key]))
      }
      await send('PUT', '/api/file', { path: info.path, content: `${JSON.stringify(data, null, 2)}\n`, stamp })
      delete cfg.sforms[k]
      toast(`Saved ${keys.join(', ')} · wrote ${tilde(info.path)}`)
      showBanner()
      await afterWrite()
      $(`sf-${keys[0]}`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        cfg.sformMsg = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(info.path)) {
          delete cfg.sforms[k]
          cfg.sformMsg = ''
          await afterWrite()
        }
        return
      }
      cfg.sformMsg = `Could not save: ${err.message}`
      render()
    }
  })
}
