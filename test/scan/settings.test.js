import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanSettings } from '../../src/scan/settings.js'

test('lists three settings files with exists flags', () => {
  const fx = makeFixture()
  try {
    fs.rmSync(path.join(fx.projectDir, '.claude', 'settings.local.json'))
    const { files } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(files.map((f) => f.scope), ['global', 'project', 'projectLocal'])
    assert.deepEqual(files.map((f) => f.exists), [true, true, false])
    assert.equal(files[0].path, path.join(fx.home, '.claude', 'settings.json'))
    assert.equal(files[0].ok, true)
    assert.equal(files[0].data.model, 'fable')
    assert.equal(files[2].error, undefined)
  } finally {
    fx.cleanup()
  }
})

test('flattens hooks with scope and index', () => {
  const fx = makeFixture()
  try {
    const { hooks } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    assert.equal(hooks.length, 3)
    const project = hooks.find((h) => h.scope === 'project')
    assert.equal(project.event, 'PreToolUse')
    assert.equal(project.matcher, 'Bash(rm:*)')
    assert.equal(project.command, 'echo guard-rm')
    assert.equal(project.type, 'command')
    assert.equal(project.file, 'project')
    assert.deepEqual(project.index, { event: 'PreToolUse', group: 0, hook: 0 })
    assert.equal(project.path, path.join(fx.projectDir, '.claude', 'settings.json'))
    const stop = hooks.find((h) => h.event === 'Stop')
    assert.equal(stop.matcher, '*')
    assert.equal(stop.scope, 'global')
    assert.equal(stop.file, 'global')
    const bash = hooks.find((h) => h.matcher === 'Bash')
    assert.equal(bash.timeout, 60)
  } finally {
    fx.cleanup()
  }
})

test('hooks from settings.local.json use scope project and file projectLocal', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.projectDir, '.claude', 'settings.local.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    data.hooks = { Stop: [{ hooks: [{ type: 'command', command: 'echo local' }] }] }
    fs.writeFileSync(file, JSON.stringify(data))
    const { hooks } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    const local = hooks.find((h) => h.command === 'echo local')
    assert.equal(local.scope, 'project')
    assert.equal(local.file, 'projectLocal')
    assert.equal(local.path, file)
  } finally {
    fx.cleanup()
  }
})

test('merges enabledPlugins and skillOverrides later wins', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.projectDir, '.claude', 'settings.local.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    data.enabledPlugins['ecc@ecc'] = true
    data.skillOverrides['java-clean-code'] = 'on'
    fs.writeFileSync(file, JSON.stringify(data))
    const { enabledPlugins, skillOverrides } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(enabledPlugins, {
      'superpowers@claude-plugins-official': true,
      'ecc@ecc': true,
      'code-review@claude-plugins-official': true
    })
    assert.deepEqual(skillOverrides, { old: 'off', 'java-clean-code': 'on', 'deploy-checklist': 'off' })
  } finally {
    fx.cleanup()
  }
})

test('reports parse error for a broken file and still returns others', () => {
  const fx = makeFixture()
  try {
    fs.writeFileSync(path.join(fx.projectDir, '.claude', 'settings.json'), '{bad')
    const { files, hooks, enabledPlugins } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    const project = files.find((f) => f.scope === 'project')
    assert.equal(project.exists, true)
    assert.equal(project.ok, false)
    assert.ok(project.error)
    assert.equal(project.data, undefined)
    assert.equal(files.find((f) => f.scope === 'global').ok, true)
    assert.equal(hooks.length, 2)
    assert.equal(enabledPlugins['code-review@claude-plugins-official'], true)
  } finally {
    fx.cleanup()
  }
})

test('mcpJsonLists read settings.local.json', () => {
  const fx = makeFixture()
  try {
    const { mcpJsonLists } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(mcpJsonLists, { enabled: ['postgres'], disabled: ['redis'], enableAll: false })
  } finally {
    fx.cleanup()
  }
})

test('missing project dir files yield empty merges', () => {
  const fx = makeFixture()
  try {
    fs.rmSync(path.join(fx.projectDir, '.claude'), { recursive: true })
    const r = scanSettings({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(r.mcpJsonLists, { enabled: [], disabled: [], enableAll: false })
    assert.equal(r.hooks.length, 2)
  } finally {
    fx.cleanup()
  }
})
