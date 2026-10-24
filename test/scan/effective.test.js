import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeFixture } from '../helpers/fixture.js'
import { scanSettings } from '../../src/scan/settings.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { effectiveSettings } from '../../src/scan/effective.js'
import { hasManagedSettings, platformManagedDir } from '../../src/scan/managed.js'

function files(global, project, projectLocal) {
  const out = [{ scope: 'global', exists: true, ok: true, data: global }]
  if (project !== undefined) out.push({ scope: 'project', exists: true, ok: true, data: project })
  if (projectLocal !== undefined) out.push({ scope: 'projectLocal', exists: true, ok: true, data: projectLocal })
  return out
}

function row(result, key) {
  return result.rows.find((r) => r.key === key)
}

test('a scalar in all three files: project local wins and the others are overridden', () => {
  const r = row(effectiveSettings(files({ model: 'sonnet' }, { model: 'haiku' }, { model: 'opus' })), 'model')
  assert.equal(r.value, 'opus')
  assert.equal(r.from, 'projectLocal')
  assert.equal(r.group, 'model')
  assert.equal(r.merged, false)
  assert.deepEqual(r.overridden, [
    { file: 'project', value: 'haiku' },
    { file: 'global', value: 'sonnet' }
  ])
})

test('permissions.allow in two files combines with no duplicates, highest file first', () => {
  const r = row(
    effectiveSettings(
      files(
        { permissions: { allow: ['Bash(git status)', 'WebSearch'] } },
        { permissions: { allow: ['Bash(npm test:*)', 'WebSearch'] } }
      )
    ),
    'permissions.allow'
  )
  assert.equal(r.merged, true)
  assert.equal(r.from, null)
  assert.equal(r.group, 'rules')
  assert.deepEqual(r.value, [
    { v: 'Bash(npm test:*)', from: 'project' },
    { v: 'WebSearch', from: 'project' },
    { v: 'Bash(git status)', from: 'global' }
  ])
  assert.deepEqual(r.files, ['project', 'global'])
})

test('fallbackModel does not combine: the higher file wins', () => {
  const r = row(effectiveSettings(files({ fallbackModel: ['a', 'b'] }, { fallbackModel: ['c'] })), 'fallbackModel')
  assert.equal(r.merged, false)
  assert.deepEqual(r.value, ['c'])
  assert.equal(r.from, 'project')
  assert.deepEqual(r.overridden, [{ file: 'global', value: ['a', 'b'] }])
})

test('availableModels combines like other lists', () => {
  const r = row(
    effectiveSettings(files({ availableModels: ['opus'] }, { availableModels: ['sonnet'] })),
    'availableModels'
  )
  assert.equal(r.merged, true)
  assert.deepEqual(
    r.value.map((x) => x.v),
    ['sonnet', 'opus']
  )
})

test('modelPicker in a project file is ignored and the global value wins', () => {
  const r = row(effectiveSettings(files({ modelPicker: { rows: [1] } }, { modelPicker: { rows: [2] } })), 'modelPicker')
  assert.equal(r.from, 'global')
  assert.equal(r.merged, false)
  assert.deepEqual(r.value, { rows: [1] })
  assert.deepEqual(r.overridden, [])
  assert.deepEqual(r.ignored, [{ file: 'project', value: { rows: [2] } }])
})

test('defaultMode auto in project local is ignored and the global mode wins', () => {
  const r = row(
    effectiveSettings(files({ permissions: { defaultMode: 'plan' } }, {}, { permissions: { defaultMode: 'auto' } })),
    'permissions.defaultMode'
  )
  assert.equal(r.value, 'plan')
  assert.equal(r.from, 'global')
  assert.deepEqual(r.ignored, [{ file: 'projectLocal', value: 'auto' }])
})

test('defaultMode acceptEdits in project local wins over global', () => {
  const r = row(
    effectiveSettings(
      files({ permissions: { defaultMode: 'plan' } }, {}, { permissions: { defaultMode: 'acceptEdits' } })
    ),
    'permissions.defaultMode'
  )
  assert.equal(r.value, 'acceptEdits')
  assert.equal(r.from, 'projectLocal')
  assert.deepEqual(r.ignored ?? [], [])
})

test('an env variable in two files: the higher file wins for that variable only', () => {
  const result = effectiveSettings(files({ env: { DEBUG: '0', LOG: 'info' } }, undefined, undefined))
  const both = effectiveSettings([
    ...files({ env: { DEBUG: '0', LOG: 'info' } }),
    { scope: 'projectLocal', exists: true, ok: true, data: { env: { DEBUG: '1' } } }
  ])
  assert.equal(row(result, 'env.DEBUG').value, '0')
  assert.equal(row(both, 'env.DEBUG').value, '1')
  assert.equal(row(both, 'env.DEBUG').from, 'projectLocal')
  assert.deepEqual(row(both, 'env.DEBUG').overridden, [{ file: 'global', value: '0' }])
  assert.equal(row(both, 'env.LOG').value, 'info')
  assert.equal(row(both, 'env.LOG').from, 'global')
  assert.equal(row(both, 'env.LOG').group, 'env')
})

test('enabledPlugins keys use the higher file and say that the docs are silent', () => {
  const r = row(
    effectiveSettings(files({ enabledPlugins: { 'a@m': true } }, { enabledPlugins: { 'a@m': false } })),
    'enabledPlugins["a@m"]'
  )
  assert.equal(r.value, false)
  assert.equal(r.from, 'project')
  assert.equal(r.group, 'plugins')
  assert.equal(r.docsSilent, true)
})

test('hooks are not in the rows', () => {
  const result = effectiveSettings(files({ hooks: { Stop: [] }, model: 'x' }))
  assert.equal(
    result.rows.some((r) => r.key.startsWith('hooks')),
    false
  )
})

test('a file with invalid JSON is skipped and the merge goes on', () => {
  const result = effectiveSettings([
    { scope: 'global', exists: true, ok: true, data: { model: 'sonnet' } },
    { scope: 'project', exists: true, ok: false, error: 'bad' },
    { scope: 'projectLocal', exists: false, ok: true }
  ])
  assert.deepEqual(result.skipped, ['project'])
  assert.equal(row(result, 'model').value, 'sonnet')
})

test('without a project folder only the global file is used', () => {
  const fx = makeFixture()
  try {
    const { files: list } = scanSettings({ home: fx.home, projectDir: null })
    const result = effectiveSettings(list)
    assert.equal(
      result.rows.every((r) => r.from === 'global' || r.from === null),
      true
    )
    assert.equal(row(result, 'model').value, 'fable')
  } finally {
    fx.cleanup()
  }
})

test('env values that look like secrets are masked, other env values are not', () => {
  const result = effectiveSettings([
    ...files({ env: { GITHUB_TOKEN: 'ghp_abcdef123456', LOG_LEVEL: 'info', API_KEY: 'short' } }),
    { scope: 'projectLocal', exists: true, ok: true, data: { env: { GITHUB_TOKEN: 'ghp_zzzzzz999999' } } }
  ])
  const token = row(result, 'env.GITHUB_TOKEN')
  assert.equal(token.value, '••••9999')
  assert.equal(token.masked, true)
  assert.deepEqual(token.overridden, [{ file: 'global', value: '••••3456' }])
  assert.equal(row(result, 'env.API_KEY').value, '••••')
  assert.equal(row(result, 'env.LOG_LEVEL').value, 'info')
  assert.equal(row(result, 'env.LOG_LEVEL').masked, undefined)
  assert.equal(JSON.stringify(result).includes('ghp_'), false)
})

test('a null value counts as not set', () => {
  const result = effectiveSettings(
    files({ model: 'opus', permissions: { allow: ['X'] } }, { model: null, permissions: { allow: null } })
  )
  assert.equal(row(result, 'model').value, 'opus')
  assert.equal(row(result, 'model').from, 'global')
  assert.deepEqual(row(result, 'permissions.allow').value, [{ v: 'X', from: 'global' }])
})

test('a list next to a value of another type: the lists combine and the other value is marked wrong type', () => {
  const r = row(
    effectiveSettings(files({ permissions: { allow: ['X'] } }, { permissions: { allow: 'Y' } })),
    'permissions.allow'
  )
  assert.equal(r.merged, true)
  assert.deepEqual(r.value, [{ v: 'X', from: 'global' }])
  assert.deepEqual(r.ignored, [{ file: 'project', value: 'Y', wrongType: true }])
})

test('a permissions or env block that is not an object is listed as invalid, not as a row', () => {
  const result = effectiveSettings(
    files({ permissions: { allow: ['X'] }, env: { A: '1' } }, { permissions: 'oops', env: ['TOKEN=sk-abcdef123'] })
  )
  assert.equal(
    result.rows.some((r) => r.key === 'permissions' || r.key === 'env'),
    false
  )
  assert.deepEqual(result.invalid, [
    { file: 'project', key: 'permissions' },
    { file: 'project', key: 'env' }
  ])
  assert.equal(JSON.stringify(result).includes('sk-'), false)
  assert.deepEqual(row(result, 'permissions.allow').value, [{ v: 'X', from: 'global' }])
})

test('an object outside the documented keys is one whole value: the higher file wins', () => {
  const result = effectiveSettings(
    files(
      { sandbox: { enabled: true, network: { allowedDomains: ['a.com'] } } },
      { sandbox: { network: { allowedDomains: ['b.com'] } } }
    )
  )
  const r = row(result, 'sandbox')
  assert.equal(r.from, 'project')
  assert.deepEqual(r.value, { network: { allowedDomains: ['b.com'] } })
  assert.deepEqual(r.overridden, [{ file: 'global', value: { enabled: true, network: { allowedDomains: ['a.com'] } } }])
  assert.equal(
    result.rows.some((x) => x.key.startsWith('sandbox.')),
    false
  )
})

test('an object in one file and a plain value in another give one row, and the higher file wins', () => {
  const result = effectiveSettings(
    files({ statusLine: { type: 'command', command: 'a' } }, undefined, { statusLine: 'off' })
  )
  const rows = result.rows.filter((x) => x.key.startsWith('statusLine'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].value, 'off')
  assert.equal(rows[0].from, 'projectLocal')
  assert.deepEqual(rows[0].overridden, [{ file: 'global', value: { type: 'command', command: 'a' } }])
})

test('a top-level key named like a nested key gets its own row', () => {
  const result = effectiveSettings(files({ env: { a: 'one' } }, { 'env.a': 3 }))
  const rows = result.rows.filter((r) => r.key === 'env.a')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r) => r.from).sort(), ['global', 'project'])
})

test('hasManagedSettings finds the file or a json file in managed-settings.d, and skips folders and dotfiles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-'))
  try {
    assert.equal(hasManagedSettings(dir), false)
    fs.mkdirSync(path.join(dir, 'managed-settings.d'))
    fs.mkdirSync(path.join(dir, 'managed-settings.d', 'x.json'))
    fs.writeFileSync(path.join(dir, 'managed-settings.d', '.hidden.json'), '{}')
    assert.equal(hasManagedSettings(dir), false)
    fs.writeFileSync(path.join(dir, 'managed-settings.d', '10-team.json'), '{}')
    assert.equal(hasManagedSettings(dir), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('platformManagedDir names the folder for each platform', () => {
  assert.equal(platformManagedDir('darwin'), '/Library/Application Support/ClaudeCode')
  assert.equal(platformManagedDir('linux'), '/etc/claude-code')
  assert.equal(platformManagedDir('win32'), 'C:\\Program Files\\ClaudeCode')
})
