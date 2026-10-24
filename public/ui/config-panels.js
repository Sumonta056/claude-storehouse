import { get, send } from '../api.js'
import { backupsListHtml, render } from '../app.js'
import { afterWrite, askReload, busy } from '../core/actions.js'
import { $, ask, toast, waitFor } from '../core/dom.js'
import { esc, lineCount, plural, tilde } from '../core/format.js'
import { bks, cfg, eds, freshHookForm, freshMcpForm, msgs } from '../core/state.js'
import {
  MD_ORDER,
  SET_ORDER,
  cfgPanels,
  cmd,
  dropMissing,
  edDirty,
  isCfgPage,
  sformDirtyKeys,
  sformEdit,
  sformValues
} from '../logic/config.js'
import { pickMd } from '../pages/claudemd.js'
import { pickSet, saveSettingsForm, setSettingsTab, sformChrome } from '../pages/settings.js'

export function ensureEd(k, file) {
  let ed = eds[k]
  if (ed && ed.path !== file) {
    delete eds[k]
    ed = null
  }
  if (ed && (!ed.stale || ed.fetching)) return
  if (!ed) {
    ed = {
      path: file,
      status: 'loading',
      text: '',
      loaded: '',
      editing: false,
      preview: false,
      stale: false,
      fetching: false
    }
    eds[k] = ed
  }
  ed.fetching = true
  get(`/api/file?path=${encodeURIComponent(file)}`)
    .then((res) => {
      if (eds[k] !== ed) return
      ed.fetching = false
      ed.stale = false
      const content = res.content ?? ''
      if (edDirty(ed)) return
      ed.stamp = res.stamp
      if (ed.status === 'ready' && ed.loaded === content) return
      ed.loaded = ed.text = content
      ed.status = 'ready'
      if (isCfgPage()) render()
    })
    .catch((err) => {
      if (eds[k] !== ed) return
      ed.fetching = false
      ed.stale = false
      if (ed.status === 'ready') return
      ed.status = 'error'
      ed.error = err.message
      if (isCfgPage()) render()
    })
}

export function msgHtml(k) {
  return `<p class="form-err" id="${k}-err" role="alert">${esc(msgs[k] ?? '')}</p>`
}

export function backupsBtn(k) {
  const open = Boolean(bks[k]?.open)
  return `<button type="button" class="btn" id="${k}-bk" data-c="backups" data-k="${k}" aria-expanded="${open}" aria-controls="${k}-bkbox">Backups</button>`
}

export function panelBackupsHtml(k) {
  const b = bks[k]
  if (!b?.open) return ''
  const inner = b.loading
    ? '<p class="note">Loading backups…</p>'
    : b.error
      ? `<p class="note">${esc(`Could not list backups: ${b.error}`)}</p>`
      : backupsListHtml(b.list, `data-c="restore" data-k="${k}"`, true, k)
  return `<div class="backups" id="${k}-bkbox">${inner}</div>`
}

function edChrome(k) {
  const ed = eds[k]
  const dirty = edDirty(ed)
  const md = MD_ORDER.includes(k)
  const mark = $(`${k}-dirty`)
  if (mark) {
    mark.textContent = dirty
      ? '● Unsaved changes'
      : md
        ? `${plural(lineCount(ed?.text ?? ''), 'line')} · Saved`
        : 'Saved'
    mark.classList.toggle('is-dirty', dirty)
  }
  const save = $(`${k}-save`)
  if (save) save.disabled = !dirty
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = dirty ? '● unsaved' : ''
  const cancel = $(`${k}-cancel`)
  if (cancel) cancel.hidden = !dirty
}

export function missingHtml(k, p) {
  dropMissing(k)
  const buttons = p.md
    ? `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="default">Create from template</button><button type="button" class="btn" id="${k}-ce" data-c="create" data-k="${k}" data-v="empty">Create empty</button>`
    : `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="empty">Create ${esc(p.file)}</button>`
  return `<div class="empty">No ${esc(p.file)} yet.<div class="row center">${buttons}</div></div>${msgHtml(k)}`
}

function openCfgFile(k) {
  const info = cfgPanels()[k]?.info
  if (!info?.exists) return
  return busy(`open:${k}`, async () => {
    try {
      await send('POST', '/api/open', { path: info.path, app: 'editor' })
      toast(`Opened ${tilde(info.path)} in your editor`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

export function onCfgInput(e) {
  const t = e.target
  if (t.dataset.ed) {
    const ed = eds[t.dataset.ed]
    if (ed) {
      ed.text = t.value
      edChrome(t.dataset.ed)
    }
    return
  }
  if (t.dataset.sf) {
    sformEdit(cfg.ssel, t.dataset.sf, t.value)
    sformChrome(cfg.ssel)
    return
  }
  if (t.dataset.f) {
    const [form, field] = t.dataset.f.split('.')
    if (!cfg[form] || !Object.hasOwn(cfg[form], field)) return
    cfg[form][field] = t.value
    if (field === 'transport') render()
  }
}

export function saveEd(k) {
  return busy(`save:${k}`, async () => {
    const ed = eds[k]
    const p = cfgPanels()[k]
    if (!ed || !p?.info || !edDirty(ed)) return
    const sent = ed.text
    delete msgs[k]
    try {
      const res = await send('PUT', '/api/file', { path: p.info.path, content: sent, stamp: ed.stamp ?? null })
      ed.loaded = res.content
      ed.stamp = res.stamp
      if (ed.text === sent) ed.text = res.content
      if (SET_ORDER.includes(k)) delete cfg.sforms[k]
      toast(`Saved ${tilde(p.info.path)} · backup written`)
      await afterWrite()
      $(p.md && !ed.editing ? `${k}-edit` : `${k}-txt`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        msgs[k] = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(p.info.path)) {
          ed.text = ed.loaded
          ed.editing = false
          ed.stale = true
          delete msgs[k]
          if (SET_ORDER.includes(k)) delete cfg.sforms[k]
          await afterWrite()
        }
        return
      }
      msgs[k] = `Could not save ${p.file}: ${err.message}`
      render()
    }
  })
}

async function cancelEd(k) {
  const ed = eds[k]
  if (!ed) return
  if (edDirty(ed)) {
    const yes = await ask({
      title: 'Discard changes?',
      message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`,
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
  }
  ed.text = ed.loaded
  ed.editing = false
  delete msgs[k]
  render()
  $(`${k}-edit`)?.focus()
}

function createPanel(k, template) {
  return busy(`create:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info || !p.create) return
    delete msgs[k]
    try {
      const { file } = await send('POST', '/api/create', { what: p.create, template })
      delete eds[k]
      delete bks[k]
      toast(`Created ${tilde(file)}`)
      await afterWrite()
      const target = p.md ? `${k}-edit` : SET_ORDER.includes(k) ? `${k}-tab-${cfg.stab}` : `${k}-txt`
      await waitFor(() => $(target))
      $(target)?.focus()
    } catch (err) {
      msgs[k] = `Could not create ${p.file}: ${err.message}`
      render()
    }
  })
}

function deletePanel(k) {
  return busy(`delete:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info?.exists) return
    const yes = await ask({
      title: `Delete ${p.file}?`,
      message: `${tilde(p.info.path)} moves to ~/.claude/backups/storehouse/trash. You can move it back from there.${edDirty(eds[k]) ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('DELETE', '/api/file', { path: p.info.path })
      delete eds[k]
      delete bks[k]
      delete msgs[k]
      toast(`Deleted ${tilde(p.info.path)} · moved to ${tilde(res.trashPath ?? 'trash')}`)
      await afterWrite()
      $(`${k}-ct`)?.focus()
    } catch (err) {
      msgs[k] = `Could not delete ${p.file}: ${err.message}`
      render()
    }
  })
}

async function togglePanelBackups(k) {
  const p = cfgPanels()[k]
  if (!p?.info) return
  if (bks[k]?.open) {
    delete bks[k]
    render()
    return
  }
  const box = { open: true, loading: true, list: [], error: '' }
  bks[k] = box
  render()
  try {
    const res = await get(`/api/backups?path=${encodeURIComponent(p.info.path)}`)
    box.list = res.backups ?? []
  } catch (err) {
    box.error = err.message
  }
  box.loading = false
  if (bks[k] === box) render()
}

function restorePanel(k, backup) {
  return busy(`restore:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info) return
    const dirty = edDirty(eds[k]) || sformDirtyKeys(k).length > 0
    const yes = await ask({
      title: 'Restore this backup?',
      message: `${tilde(p.info.path)} is replaced with the backup. The current file is backed up first.${dirty ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Restore',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('POST', '/api/restore', { backup, path: p.info.path })
      const ed = eds[k]
      if (ed) {
        ed.loaded = ed.text = res.content
        ed.stamp = res.stamp
        ed.status = 'ready'
      }
      if (SET_ORDER.includes(k)) delete cfg.sforms[k]
      delete bks[k]
      delete msgs[k]
      toast(`Restored ${tilde(p.info.path)} from backup`)
      await afterWrite()
      $(`${k}-bk`)?.focus()
    } catch (err) {
      msgs[k] = `Could not restore: ${err.message}`
      if (SET_ORDER.includes(k) && cfg.stab === 'form') cfg.sformMsg = msgs[k]
      render()
    }
  })
}

function closeForm(name) {
  cfg[name] = name === 'hook' ? freshHookForm() : freshMcpForm()
  render()
  $(name === 'hook' ? 'hf-open' : 'mf-open')?.focus()
}

export function onCfg(el) {
  const act = el.dataset.c
  const k = el.dataset.k
  const v = el.dataset.v
  if (act === 'hf-open' || act === 'mf-open') {
    const name = act === 'hf-open' ? 'hook' : 'mcp'
    if (cfg[name].open) return closeForm(name)
    cfg[name].open = true
    render()
    $(name === 'hook' ? 'hf-scope' : 'mf-scope')?.focus()
    return
  }
  if (act === 'hf-cancel') return closeForm('hook')
  if (act === 'mf-cancel') return closeForm('mcp')
  if (act === 'stab') return void setSettingsTab(v)
  if (act === 'sfsw') {
    sformEdit(cfg.ssel, v, !sformValues(cfg.ssel)[v])
    render()
    return
  }
  if (act === 'fsave') return void saveSettingsForm()
  if (act === 'freset') {
    delete cfg.sforms[cfg.ssel]
    cfg.sformMsg = ''
    render()
    $(`${cfg.ssel}-tab-form`)?.focus()
    return
  }
  if (act === 'pick') {
    return void pickMd(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && MD_ORDER.includes(k) && k !== cmd.sel) {
    return void pickMd(k).then((ok) => ok && createPanel(k, v))
  }
  if (act === 'sview') {
    cfg.sview = v
    render()
    $(`sv-${v}`)?.focus()
    return
  }
  if (act === 'efilt') {
    cfg.efilter = v
    render()
    return
  }
  if (act === 'efile') {
    cfg.sview = 'files'
    return void pickSet(k).then((ok) => {
      render()
      if (ok) $(`cm-pick-${k}`)?.focus()
    })
  }
  if (act === 'spick') {
    return void pickSet(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && SET_ORDER.includes(k) && k !== cfg.ssel) {
    return void pickSet(k).then((ok) => ok && createPanel(k, v))
  }
  if (act === 'editor') return void openCfgFile(k)
  if (act === 'backups') return void togglePanelBackups(k)
  if (act === 'restore') return void restorePanel(k, el.dataset.path)
  if (act === 'save') return void saveEd(k)
  if (act === 'cancel') return void cancelEd(k)
  if (act === 'create') return void createPanel(k, v)
  if (act === 'delete') return void deletePanel(k)
  const ed = eds[k]
  if (!ed) return
  if (act === 'edit') {
    ed.editing = true
    ed.preview = false
    render()
    $(`${k}-txt`)?.focus()
  } else if (act === 'preview') {
    if (MD_ORDER.includes(k)) ed.editing = false
    else ed.preview = !ed.preview
    render()
  }
}
