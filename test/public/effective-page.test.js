import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveSettings } from '../../src/scan/effective.js'
import { effValue, effectiveHtml } from '../../public/pages/effective.js'
import { cfg, state } from '../../public/core/state.js'

function file(scope, data) {
  if (data === undefined) return { scope, exists: false }
  if (data === null) return { scope, exists: true, ok: false }
  return { scope, exists: true, ok: true, data }
}

function inventory({ global, project, projectLocal, projectDir = '/p', managed = false } = {}) {
  const files = [file('global', global), file('project', project), file('projectLocal', projectLocal)]
  return {
    global: { dir: '/h/.claude' },
    project: projectDir ? { dir: projectDir } : null,
    claudeMd: {},
    settings: {
      global: files[0],
      project: files[1],
      projectLocal: files[2],
      managed,
      effective: effectiveSettings(files)
    }
  }
}

function view(inv, { filter = 'all', query = '' } = {}) {
  const saved = { inventory: state.inventory, query: state.query }
  const savedFilter = cfg.efilter
  try {
    state.inventory = inv
    state.query = query
    cfg.efilter = filter
    return effectiveHtml()
  } finally {
    Object.assign(state, saved)
    cfg.efilter = savedFilter
  }
}

function row(html, key) {
  const start = html.indexOf(`<td class="key"><code>${key}</code></td>`)
  assert.notEqual(start, -1, `row ${key} is missing`)
  return html.slice(start, html.indexOf('</tr>', start))
}

test('effValue shows a value as JSON in code and escapes it', () => {
  assert.equal(effValue('opus'), '<code>&quot;opus&quot;</code>')
  assert.equal(effValue(['<a>']), '<code>[&quot;&lt;a&gt;&quot;]</code>')
  assert.equal(effValue(undefined), '<code></code>')
  assert.equal(effValue(false), '<code>false</code>')
})

test('a scalar row shows the winning value and the tag of the file it comes from', () => {
  const html = view(inventory({ global: { model: 'opus' }, project: {}, projectLocal: { model: 'sonnet' } }))
  const r = row(html, 'model')
  assert.match(r, /<td><code>&quot;sonnet&quot;<\/code><\/td>/)
  assert.match(
    r,
    /<td><button type="button" class="tag local" data-c="efile" data-k="sl" aria-label="Open .claude\/settings.local.json">local<\/button><\/td>/
  )
})

test('a scalar row lists the overridden value with the tag of its file', () => {
  const html = view(inventory({ global: { model: 'opus' }, project: {}, projectLocal: { model: 'sonnet' } }))
  assert.match(
    row(html, 'model'),
    /<li><span class="lost"><code>&quot;opus&quot;<\/code><\/span> <button type="button" class="tag global" data-c="efile" data-k="sg" aria-label="Open ~\/.claude\/settings.json">global<\/button><\/li>/
  )
})

test('a row with no override shows a dash in the Overridden column', () => {
  const html = view(inventory({ global: { theme: 'dark' } }))
  assert.match(row(html, 'theme'), /<td>—<\/td>$/)
})

test('bypassPermissions in a project file is ignored and the global value wins', () => {
  const html = view(
    inventory({
      global: { permissions: { defaultMode: 'plan' } },
      project: { permissions: { defaultMode: 'bypassPermissions' } }
    })
  )
  const r = row(html, 'permissions.defaultMode')
  assert.match(r, /<td><code>&quot;plan&quot;<\/code><\/td>/)
  assert.match(
    r,
    /<code>&quot;bypassPermissions&quot;<\/code><\/span> <button[^>]*data-k="sp"[^>]*>project<\/button> <span class="note">ignored in this file<\/span>/
  )
})

test('a key that only a project file sets with auto is Not used', () => {
  const html = view(inventory({ global: {}, project: { permissions: { defaultMode: 'auto' } } }))
  const r = row(html, 'permissions.defaultMode')
  assert.match(r, /<span class="note">Not used<\/span><\/td><td>—<\/td>/)
  assert.match(r, /ignored in this file/)
})

test('a list from several files is merged with the tag of each value', () => {
  const html = view(
    inventory({
      global: { permissions: { allow: ['Read'] } },
      project: { permissions: { allow: ['Bash(npm test)', 'Read'] } }
    })
  )
  const r = row(html, 'permissions.allow')
  assert.match(r, /<span class="mergedl">merged · 2 files<\/span>/)
  assert.match(r, /<li><code>&quot;Bash\(npm test\)&quot;<\/code> <button[^>]*data-k="sp"/)
  assert.match(r, /<li><code>&quot;Read&quot;<\/code> <button[^>]*data-k="sp"/)
  assert.equal(r.match(/&quot;Read&quot;/g).length, 1)
})

test('a non-list value next to a list is marked wrong type and ignored', () => {
  const html = view(inventory({ global: { foo: 'x' }, project: { foo: ['a'] } }))
  assert.match(row(html, 'foo'), /<span class="note">wrong type · ignored<\/span>/)
})

test('a secret-looking env value is masked and flagged', () => {
  const html = view(inventory({ global: { env: { MY_AUTH: 'abcdefgh1234' } } }))
  const r = row(html, 'env.MY_AUTH')
  assert.match(r, /<code>&quot;••••1234&quot;<\/code> <span class="mchip key">masked<\/span>/)
  assert.doesNotMatch(r, /abcdefgh/)
})

test('rows are grouped under section headers with a hint or a key count', () => {
  const html = view(inventory({ global: { model: 'opus', theme: 'dark', permissions: { allow: ['Read'] } } }))
  assert.match(
    html,
    /<tr class="sec"><th colspan="4" scope="colgroup">Model and output<span>2 keys<\/span><\/th><\/tr>/
  )
  assert.match(html, /<th colspan="4" scope="colgroup">Permissions<span>Lists add up from all files\./)
  assert.ok(html.indexOf('Model and output') < html.indexOf('scope="colgroup">Permissions'))
})

test('the filter chips count all, overridden, and merged keys and mark the pressed one', () => {
  const inv = inventory({
    global: { model: 'opus', permissions: { allow: ['Read'] } },
    projectLocal: { model: 'sonnet' }
  })
  const html = view(inv, { filter: 'over' })
  assert.match(html, /data-c="efilt" data-v="all" aria-pressed="false">All keys <span class="n">2<\/span>/)
  assert.match(html, /data-v="over" aria-pressed="true">Overridden <span class="n">1<\/span>/)
  assert.match(html, /data-v="merged" aria-pressed="false">Merged lists <span class="n">1<\/span>/)
  assert.match(html, /<code>model<\/code>/)
  assert.doesNotMatch(html, /<code>permissions.allow<\/code>/)
})

test('the Merged lists filter shows only merged rows', () => {
  const html = view(inventory({ global: { model: 'opus', permissions: { allow: ['Read'] } } }), { filter: 'merged' })
  assert.match(html, /<code>permissions.allow<\/code>/)
  assert.doesNotMatch(html, /<td class="key"><code>model<\/code>/)
})

test('the search box filters rows by key and an empty result names the query escaped', () => {
  const inv = inventory({ global: { model: 'opus', theme: 'dark' } })
  const html = view(inv, { query: 'THE' })
  assert.match(html, /<code>theme<\/code>/)
  assert.doesNotMatch(html, /<td class="key"><code>model<\/code>/)
  assert.match(view(inv, { query: '<x>' }), /No key matches &quot;&lt;x&gt;&quot;\./)
})

test('with no settings the table is replaced by an empty note', () => {
  assert.match(view(inventory({ global: {} })), /<div class="empty">No settings in these files\.<\/div>/)
})

test('the order note lists local, project, global when a project is open', () => {
  assert.match(
    view(inventory({ global: {} })),
    /Highest first: <button[^>]*data-k="sl"[^>]*>local<\/button> <code>.claude\/settings.local.json<\/code> → <button[^>]*data-k="sp"/
  )
})

test('the order note says only global applies without a project', () => {
  assert.match(
    view(inventory({ global: {}, projectDir: null })),
    /Only <button[^>]*data-k="sg"[^>]*>global<\/button> <code>~\/.claude\/settings.json<\/code> applies\. Project scope is off\./
  )
})

test('managed settings, skipped files, and invalid values each show a warning', () => {
  const html = view(inventory({ global: { env: 'x' }, project: null, managed: true }))
  assert.match(html, /<div class="warn">Managed settings exist on this computer\./)
  assert.match(html, /Left out because the JSON is invalid: .claude\/settings.json\. Fix it in the Files view\./)
  assert.match(html, /Left out because the value is not an object: env in ~\/.claude\/settings.json\./)
})

test('the page notes what the table does not show', () => {
  assert.match(view(inventory({ global: {} })), /Not shown: hooks \(hooks from all files run, see the Hooks page\)/)
})
