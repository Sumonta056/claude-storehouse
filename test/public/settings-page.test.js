import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveSettings } from '../../src/scan/effective.js'

const els = new Map()
const fetched = []

function el(id) {
  if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '' })
  return els.get(id)
}

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = { getElementById: el, activeElement: null, querySelector: () => null, querySelectorAll: () => [] }
globalThis.fetch = async (url) => {
  fetched.push(url)
  throw new Error('no network in tests')
}

const { renderSettings } = await import('../../public/pages/settings.js')
const { cfg, eds, state } = await import('../../public/core/state.js')

const PATHS = {
  global: '/h/.claude/settings.json',
  project: '/p/.claude/settings.json',
  projectLocal: '/p/.claude/settings.local.json'
}

function file(scope, data) {
  const path = PATHS[scope]
  if (data === undefined) return { scope, path, exists: false }
  if (data === null) return { scope, path, exists: true, ok: false, error: 'Unexpected token } in JSON' }
  return { scope, path, exists: true, ok: true, data }
}

function inventory({ global, project, projectLocal, projectDir = '/p' } = {}) {
  const files = [file('global', global), file('project', project), file('projectLocal', projectLocal)]
  return {
    global: { dir: '/h/.claude' },
    project: projectDir ? { dir: projectDir } : null,
    plugins: [],
    favorites: [],
    claudeMd: {},
    settings: {
      global: files[0],
      project: files[1],
      projectLocal: files[2],
      effective: effectiveSettings(files)
    }
  }
}

function page(inv, { sel = 'sg', tab = 'form', view = 'files', sforms = {}, editors = {}, msg = '' } = {}) {
  const saved = { inventory: state.inventory, query: state.query }
  const savedCfg = { sview: cfg.sview, ssel: cfg.ssel, stab: cfg.stab, sforms: cfg.sforms, sformMsg: cfg.sformMsg }
  els.clear()
  fetched.length = 0
  try {
    state.inventory = inv
    state.query = ''
    Object.assign(cfg, { sview: view, ssel: sel, stab: tab, sforms, sformMsg: msg })
    Object.assign(eds, editors)
    renderSettings()
    return el('p-settings').innerHTML
  } finally {
    Object.assign(state, saved)
    Object.assign(cfg, savedCfg)
    for (const k of Object.keys(eds)) delete eds[k]
  }
}

function editor(path, text, loaded = text) {
  return { path, status: 'ready', text, loaded, editing: false, preview: false, stale: false, fetching: false }
}

test('Settings lists Global, Project, and Project local with their paths and a precedence note', () => {
  const html = page(inventory({ global: { model: 'opus', theme: 'dark' }, project: {}, projectLocal: {} }))
  const labels = [...html.matchAll(/<span class="cm-label">([^<]+)</g)].map((m) => m[1])
  assert.deepEqual(labels, ['Global', 'Project', 'Project local'])
  assert.match(html, /<span class="cm-path">~\/.claude\/settings.json<\/span>/)
  assert.match(html, /<span class="cm-meta">2 keys · every project<\/span>/)
  assert.match(html, /<span class="cm-meta">0 keys · this folder · only you · git-ignored<\/span>/)
  assert.match(html, /the higher number wins/)
  assert.match(html, /id="cm-pick-sg" data-c="spick" data-k="sg" aria-current="true"/)
})

test('a settings file that does not exist shows Not found and a Create button', () => {
  const html = page(inventory({ global: {} }))
  assert.match(html, /<span class="cm-meta">Not found · git-ignored<\/span>/)
  assert.match(html, /<span class="cm-meta">Not found<\/span>/)
  assert.match(
    html,
    /id="cm-create-sl" data-c="create" data-k="sl" data-v="empty" aria-label="Create .claude\/settings.local.json">Create</
  )
  assert.match(html, /<li class="cm-file missing">\s*<span class="cm-num" aria-hidden="true">–<\/span>/)
})

test('a settings file with invalid JSON shows Invalid JSON in the list', () => {
  const html = page(inventory({ global: {}, project: null }), { sel: 'sg' })
  assert.match(html, /<span class="cm-meta">Invalid JSON<\/span>/)
})

test('without a project folder only Global shows, with the project-off note', () => {
  const html = page(inventory({ global: {}, projectDir: null }))
  assert.match(html, /id="cm-pick-sg"/)
  assert.doesNotMatch(html, /id="cm-pick-sp"|id="cm-pick-sl"/)
  assert.match(html, /<div class="warn" role="note">/)
})

test('the Form tab groups the six fields and has Form and Raw JSON tabs', () => {
  const html = page(inventory({ global: { model: 'opus' } }))
  assert.match(html, /role="tab" id="sg-tab-form" data-c="stab" data-v="form" aria-selected="true"/)
  assert.match(html, /role="tab" id="sg-tab-raw" data-c="stab" data-v="raw" aria-selected="false"/)
  assert.match(html, /<h3>Model and output <span class="hint">4 keys<\/span><\/h3>/)
  assert.match(html, /<h3>Permissions <span class="hint">2 keys<\/span><\/h3>/)
  assert.match(html, /<input id="sf-model" data-sf="model" value="opus" placeholder="not set"/)
  assert.match(html, /<label class="t" for="sf-model">Model <span class="key">model<\/span><\/label>/)
})

test('a form text field escapes its value', () => {
  const html = page(inventory({ global: { theme: '"><script>' } }))
  assert.match(html, /id="sf-theme" data-sf="theme" value="&quot;&gt;&lt;script&gt;"/)
})

test('a select field lists not set, its options, and keeps an unknown current value', () => {
  const html = page(inventory({ global: { permissions: { defaultMode: 'turbo' } } }))
  assert.match(
    html,
    /<select id="sf-permissions.defaultMode" data-sf="permissions.defaultMode"><option value="">\(not set\)<\/option>/
  )
  assert.match(html, /<option value="plan">plan<\/option>/)
  assert.match(html, /<option value="turbo" selected>turbo \(current\)<\/option>/)
})

test('the switch field is a role switch labelled by its name', () => {
  const html = page(inventory({ global: { skipDangerousModePermissionPrompt: true } }))
  assert.match(
    html,
    /role="switch" id="sf-skipDangerousModePermissionPrompt" data-c="sfsw" data-v="skipDangerousModePermissionPrompt" aria-checked="true" aria-labelledby="sf-skipDangerousModePermissionPrompt-l"/
  )
})

test('a field with the wrong type is locked with edit in Raw JSON', () => {
  const html = page(inventory({ global: { model: 5, permissions: 'x' } }))
  assert.match(html, /<span class="note">number 5 — edit in Raw JSON<\/span>/)
  assert.match(html, /<span class="note">string &quot;x&quot; — edit in Raw JSON<\/span>/)
  assert.doesNotMatch(html, /id="sf-model"/)
  assert.doesNotMatch(html, /id="sf-permissions.defaultMode"/)
})

test('the start mode help in a project file says auto and bypassPermissions do not work there', () => {
  const inv = inventory({ global: {}, project: {} })
  const note = '<code>auto</code> and <code>bypassPermissions</code> do not work from this file.'
  assert.ok(page(inv, { sel: 'sp' }).includes(note))
  assert.ok(!page(inv, { sel: 'sg' }).includes(note))
})

test('a project file value of bypassPermissions is marked as ignored by Claude Code', () => {
  const html = page(inventory({ global: {}, project: { permissions: { defaultMode: 'bypassPermissions' } } }), {
    sel: 'sp'
  })
  assert.match(html, /<span class="ovr">Claude Code ignores this value in this file\.<\/span>/)
})

test('a form field overridden by a higher file names that file and its value', () => {
  const inv = inventory({ global: { model: 'opus' }, project: {}, projectLocal: { model: 'sonnet' } })
  const html = page(inv, { sel: 'sg' })
  assert.match(
    html,
    /<span class="ovr">↑ Project local sets <code>&quot;sonnet&quot;<\/code>\. That value wins in this folder\.<\/span>/
  )
  assert.doesNotMatch(page(inv, { sel: 'sl' }), /That value wins/)
})

test('permission rules are read-only chips per list, with No rules for an empty list', () => {
  const html = page(inventory({ global: { permissions: { allow: ['Bash(npm test)', 'Read'], deny: [] } } }))
  assert.match(html, /<h3>Permission rules <span class="hint">Read-only here · edit in Raw JSON<\/span><\/h3>/)
  assert.match(
    html,
    /<h4>Allow <b>2<\/b><\/h4><span class="fm-chip">Bash\(npm test\)<\/span><span class="fm-chip">Read<\/span>/
  )
  assert.match(html, /<h4>Deny <b>0<\/b><\/h4><span class="none">No rules<\/span>/)
})

test('keys managed on other pages link to those pages', () => {
  const html = page(
    inventory({ global: { enabledPlugins: { a: true, b: false }, skillOverrides: { x: 'off' }, hooks: { Stop: [] } } })
  )
  assert.match(html, /<h3>Managed on other pages <span class="hint">3 keys<\/span><\/h3>/)
  assert.match(
    html,
    /<code>enabledPlugins<\/code><span class="s">2 plugins · 1 off<\/span><button type="button" class="btn" data-go="plugins">Open Plugins</
  )
  assert.match(
    html,
    /<span class="s">1 skill off<\/span><button type="button" class="btn" data-go="skills">Open Skills</
  )
  assert.match(html, /data-go="hooks">Open Hooks</)
})

test('other keys are listed with a short value and a Show in Raw JSON link', () => {
  const html = page(
    inventory({
      global: { statusLine: { type: 'command', command: 'x' }, permissions: { additionalDirectories: ['/a'] } }
    })
  )
  assert.match(html, /<h3>Other keys <span class="hint">Edit in Raw JSON<\/span><\/h3>/)
  assert.match(
    html,
    /<code>statusLine<\/code><span class="s">2 keys<\/span><button type="button" class="btn-link" data-c="stab" data-v="raw">Show in Raw JSON</
  )
  assert.match(html, /<code>permissions.additionalDirectories<\/code><span class="s">list of 1<\/span>/)
})

test('a clean form has Reset and Save disabled and says the key count is saved', () => {
  const html = page(inventory({ global: { model: 'opus' } }))
  assert.match(html, /id="sg-freset" data-c="freset" disabled>Reset</)
  assert.match(html, /id="sg-fsave" data-c="fsave" disabled>Save</)
  assert.match(html, /id="sg-fdirty" aria-live="polite">1 key · Saved</)
  assert.doesNotMatch(html, /id="sg-del"/)
})

test('a changed form names the unsaved keys and enables Save and Reset', () => {
  const base = { model: 'opus' }
  const html = page(inventory({ global: base }), {
    sforms: { sg: { base: { model: 'opus' }, values: { model: 'sonnet' } } }
  })
  assert.match(html, /<span class="cm-state is-dirty" id="sg-fdirty" aria-live="polite">● 1 unsaved change · model</)
  assert.match(html, /id="sg-fsave" data-c="fsave">Save</)
  assert.match(html, /<div class="srow changed"><div class="lbl"><label class="t" for="sf-model">/)
  assert.match(html, /id="cm-dot-sg">● unsaved</)
})

test('the form shows the save error in an alert', () => {
  const html = page(inventory({ global: {} }), { msg: 'Could not save: <bad>' })
  assert.match(html, /<p class="form-err" id="sg-ferr" role="alert">Could not save: &lt;bad&gt;<\/p>/)
})

test('a project file panel has a Delete button', () => {
  const html = page(inventory({ global: {}, project: {} }), { sel: 'sp' })
  assert.match(html, /id="sp-del" data-c="delete" data-k="sp">Delete…</)
})

test('the panel of a missing file explains the file and offers to create it', () => {
  const html = page(inventory({ global: {} }), { sel: 'sp' })
  assert.match(html, /This file is for the team\. It goes into git with the project\./)
  assert.match(html, /id="sp-ct" data-c="create" data-k="sp" data-v="empty">Create .claude\/settings.json</)
  assert.doesNotMatch(html, /id="sp-tab-form"|id="sp-tab-raw"/)
})

test('the Raw JSON tab shows the escaped file text with Save disabled while clean', () => {
  const text = '{\n  "model": "<opus>"\n}\n'
  const html = page(inventory({ global: { model: '<opus>' } }), {
    tab: 'raw',
    editors: { sg: editor(PATHS.global, text) }
  })
  assert.match(html, /aria-selected="true" aria-controls="sg-pane">Raw JSON</)
  assert.match(
    html,
    /aria-label="~\/.claude\/settings.json contents">\n\{\n {2}&quot;model&quot;: &quot;&lt;opus&gt;&quot;\n\}\n<\/textarea>/
  )
  assert.match(html, /id="sg-save" data-c="save" data-k="sg" disabled>Save</)
  assert.match(html, /id="sg-cancel" data-c="cancel" data-k="sg" hidden>Discard</)
  assert.match(html, /id="sg-dirty" aria-live="polite">Saved</)
  assert.deepEqual(fetched, [])
})

test('the Raw JSON tab with edits shows Unsaved changes and enables Save and Discard', () => {
  const html = page(inventory({ global: {} }), { tab: 'raw', editors: { sg: editor(PATHS.global, '{"a":1}', '{}') } })
  assert.match(html, /id="sg-dirty" aria-live="polite">● Unsaved changes</)
  assert.match(html, /id="sg-save" data-c="save" data-k="sg">Save</)
  assert.match(html, /id="sg-cancel" data-c="cancel" data-k="sg">Discard</)
})

test('a file with invalid JSON opens Raw JSON, disables Form, and shows the parse error', () => {
  const html = page(inventory({ global: null }), {
    tab: 'form',
    editors: { sg: editor(PATHS.global, '{ bad') }
  })
  assert.match(
    html,
    /data-v="form" aria-selected="false" aria-controls="sg-pane" disabled title="Fix the JSON first">Form</
  )
  assert.match(html, /data-v="raw" aria-selected="true"/)
  assert.match(html, /Cannot parse ~\/.claude\/settings.json: Unexpected token \} in JSON\. Fix it here\./)
  assert.match(html, /<textarea id="sg-txt"/)
  assert.deepEqual(fetched, [])
})

test('the Effective switch shows the key count and renders the effective table', () => {
  const html = page(inventory({ global: { model: 'opus', theme: 'dark' } }), { view: 'effective' })
  assert.match(
    html,
    /id="sv-effective" data-c="sview" data-v="effective" aria-selected="true">Effective <span class="n">2 keys<\/span>/
  )
  assert.match(html, /id="sv-files" data-c="sview" data-v="files" aria-selected="false">Files</)
  assert.match(html, /<table class="eff">/)
  assert.doesNotMatch(html, /cm-list/)
})
