import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeFixture } from '../helpers/fixture.js'
import { scanSettings } from '../../src/scan/settings.js'
import { scanPlugins } from '../../src/scan/plugins.js'
import { scanMcp } from '../../src/scan/mcp.js'

function run(fx) {
  const s = scanSettings({ home: fx.home, projectDir: fx.projectDir })
  const plugins = scanPlugins({ home: fx.home, projectDir: fx.projectDir, enabledPlugins: s.enabledPlugins })
  return scanMcp({ home: fx.home, projectDir: fx.projectDir, plugins, mcpJsonLists: s.mcpJsonLists })
}

test('scanMcp lists global project and plugin servers with enabled', () => {
  const fx = makeFixture()
  try {
    const list = run(fx)
    const by = (name) => list.find((m) => m.name === name)
    assert.equal(by('kubernetes').enabled, true)
    assert.equal(by('kubernetes').scope, 'global')
    assert.equal(by('kubernetes').origin, 'user')
    assert.equal(by('kubernetes').transport, 'stdio')
    assert.equal(by('kubernetes').command, 'npx -y kube-mcp')
    assert.equal(by('kubernetes').disabledKey, 'kubernetes')
    assert.equal(by('aws').enabled, false)
    assert.equal(by('aws').scope, 'project')
    assert.equal(by('aws').origin, 'local')
    assert.equal(by('aws').transport, 'sse')
    assert.equal(by('aws').url, 'https://aws.example.com/sse')
    assert.equal(by('postgres').enabled, true)
    assert.equal(by('postgres').origin, 'mcpjson')
    assert.equal(by('postgres').path, `${fx.projectDir}/.mcp.json`)
    assert.equal(by('redis').enabled, false)
    assert.equal(by('redis').command, 'redis-mcp --port 6379')
    const demo = by('demo')
    assert.equal(demo.enabled, false)
    assert.equal(demo.scope, 'plugin')
    assert.equal(demo.origin, 'plugin')
    assert.equal(demo.plugin, 'superpowers@claude-plugins-official')
    assert.equal(demo.transport, 'http')
    assert.equal(demo.disabledKey, 'plugin:superpowers:demo')
    assert.equal(by('context7').enabled, true)
    assert.ok(list.every((m) => m.canToggle === true))
  } finally {
    fx.cleanup()
  }
})

test('scanMcp masks env and header values but keeps keys', () => {
  const fx = makeFixture()
  try {
    const list = run(fx)
    const kube = list.find((m) => m.name === 'kubernetes')
    const demo = list.find((m) => m.name === 'demo')
    assert.deepEqual(kube.config.env, { KUBE_TOKEN: '•••' })
    assert.deepEqual(demo.config.headers, { Authorization: '•••' })
    const text = JSON.stringify(list)
    assert.ok(!text.includes('secret-value'))
    assert.ok(!text.includes('secret-token'))
  } finally {
    fx.cleanup()
  }
})

test('scanMcp returns empty when nothing is configured', () => {
  assert.deepEqual(scanMcp({ home: '/nonexistent-a', projectDir: '/nonexistent-b', plugins: [], mcpJsonLists: { enabled: [], disabled: [] } }), [])
})

test('scanMcp builds disabledKey from the plugin id prefix, not the manifest name', () => {
  const plugins = [
    {
      id: 'idname@mk',
      name: 'Manifest Name',
      enabled: true,
      installPath: '/x',
      mcp: [{ name: 'srv', config: { command: 'a' } }]
    }
  ]
  const list = scanMcp({ home: '/nonexistent-a', projectDir: '/nonexistent-b', plugins, mcpJsonLists: { enabled: [], disabled: [] } })
  assert.equal(list[0].disabledKey, 'plugin:idname:srv')
  assert.equal(list[0].plugin, 'idname@mk')
})
