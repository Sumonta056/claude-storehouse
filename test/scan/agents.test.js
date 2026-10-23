import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanSettings } from '../../src/scan/settings.js'
import { scanPlugins } from '../../src/scan/plugins.js'
import { scanAgents } from '../../src/scan/agents.js'

function run(fx) {
  const settings = scanSettings({ home: fx.home, projectDir: fx.projectDir })
  const plugins = scanPlugins({ home: fx.home, projectDir: fx.projectDir, enabledPlugins: settings.enabledPlugins })
  return scanAgents({ home: fx.home, projectDir: fx.projectDir, plugins })
}

test('scanAgents reads disabled from file suffix', () => {
  const fx = makeFixture()
  try {
    const items = run(fx)
    const parked = items.find((i) => i.name === 'parked')
    assert.equal(parked.enabled, false)
    assert.equal(parked.kind, 'agent')
    assert.equal(parked.canToggle, true)
    assert.equal(parked.path, path.join(fx.home, '.claude', 'agents', 'parked.md.disabled'))
    assert.equal(items.find((i) => i.name === 'my-agent').enabled, true)
  } finally {
    fx.cleanup()
  }
})

test('scanAgents lists project and plugin agents', () => {
  const fx = makeFixture()
  try {
    const items = run(fx)
    const p = items.find((i) => i.name === 'repo-explainer')
    assert.equal(p.scope, 'project')
    assert.equal(p.source, 'project')
    const pl = items.find((i) => i.name === 'reviewer')
    assert.equal(pl.scope, 'plugin')
    assert.equal(pl.source, 'superpowers@claude-plugins-official')
    assert.equal(pl.plugin, 'superpowers@claude-plugins-official')
    assert.equal(pl.readOnly, true)
    assert.equal(pl.canToggle, false)
    assert.equal(pl.enabled, true)
    assert.equal(pl.description, 'Reviews code')
  } finally {
    fx.cleanup()
  }
})

test('missing agents folders give empty list', () => {
  assert.deepEqual(scanAgents({ home: '/nonexistent-h', projectDir: '/nonexistent-p', plugins: [] }), [])
})

test('empty agent description falls back to first body line', () => {
  const fx = makeFixture()
  try {
    fs.writeFileSync(path.join(fx.home, '.claude', 'agents', 'my-agent.md'), '---\nname: my-agent\ndescription: ""\n---\nBody text\n')
    assert.equal(run(fx).find((i) => i.name === 'my-agent').description, 'Body text')
  } finally {
    fx.cleanup()
  }
})
