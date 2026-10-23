import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanSettings } from '../../src/scan/settings.js'
import { scanPlugins } from '../../src/scan/plugins.js'

function run(fx) {
  const { enabledPlugins } = scanSettings({ home: fx.home, projectDir: fx.projectDir })
  return scanPlugins({ home: fx.home, projectDir: fx.projectDir, enabledPlugins })
}

test('lists user-scope plugins with enabled from settings', () => {
  const fx = makeFixture()
  try {
    const plugins = run(fx)
    const sp = plugins.find((p) => p.id === 'superpowers@claude-plugins-official')
    const ecc = plugins.find((p) => p.id === 'ecc@ecc')
    assert.equal(sp.enabled, true)
    assert.equal(sp.scope, 'global')
    assert.equal(sp.name, 'superpowers')
    assert.equal(sp.marketplace, 'claude-plugins-official')
    assert.equal(sp.version, '1.0.0')
    assert.equal(sp.description, 'Core skills library')
    assert.equal(sp.missing, false)
    assert.equal(ecc.enabled, false)
    assert.equal(plugins.find((p) => p.id === 'ghost@x').enabled, false)
  } finally {
    fx.cleanup()
  }
})

test('includes project-scope plugin only for matching projectDir', () => {
  const fx = makeFixture()
  try {
    const matches = run(fx).filter((p) => p.id === 'code-review@claude-plugins-official')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].scope, 'project')
    const other = scanPlugins({ home: fx.home, projectDir: path.join(fx.projectDir, 'nope'), enabledPlugins: {} })
    assert.equal(
      other.some((p) => p.id.startsWith('code-review@')),
      false
    )
  } finally {
    fx.cleanup()
  }
})

test('marks missing installPath', () => {
  const fx = makeFixture()
  try {
    const ghost = run(fx).find((p) => p.id === 'ghost@x')
    assert.equal(ghost.missing, true)
    assert.deepEqual(ghost.skills, [])
    assert.deepEqual(ghost.agents, [])
    assert.deepEqual(ghost.hooks, [])
    assert.deepEqual(ghost.mcp, [])
  } finally {
    fx.cleanup()
  }
})

test('reads skills agents hooks and mcp from the cache folder', () => {
  const fx = makeFixture()
  try {
    const sp = run(fx).find((p) => p.id === 'superpowers@claude-plugins-official')
    assert.deepEqual(sp.skills, ['brainstorming'])
    assert.deepEqual(sp.agents, ['reviewer'])
    assert.equal(sp.hooks.length, 1)
    assert.equal(sp.hooks[0].scope, 'plugin')
    assert.equal(sp.hooks[0].file, 'plugin')
    assert.equal(sp.hooks[0].plugin, sp.id)
    assert.equal(sp.hooks[0].event, 'SessionStart')
    assert.equal(sp.hooks[0].matcher, 'startup')
    assert.equal(sp.hooks[0].command, 'echo hi')
    assert.equal(sp.hooks[0].path, path.join(sp.installPath, 'hooks', 'hooks.json'))
    assert.equal(sp.mcp[0].name, 'context7')
    assert.equal(sp.mcp[0].config.command, 'npx')
    const ecc = run(fx).find((p) => p.id === 'ecc@ecc')
    assert.deepEqual(ecc.skills, [])
    assert.deepEqual(ecc.mcp, [])
  } finally {
    fx.cleanup()
  }
})

test('prefers the project entry when a plugin has both project and user entries', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.home, '.claude', 'plugins', 'installed_plugins.json')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const user = data.plugins['ecc@ecc'][0]
    data.plugins['ecc@ecc'] = [user, { ...user, scope: 'local', projectPath: fx.projectDir }]
    fs.writeFileSync(file, JSON.stringify(data))
    const matches = run(fx).filter((p) => p.id === 'ecc@ecc')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].scope, 'project')
  } finally {
    fx.cleanup()
  }
})

test('reads a flat-form .mcp.json without the mcpServers wrapper', () => {
  const fx = makeFixture()
  try {
    const ecc = run(fx).find((p) => p.id === 'ecc@ecc')
    fs.writeFileSync(path.join(ecc.installPath, '.mcp.json'), JSON.stringify({ flatsrv: { command: 'node' } }))
    const again = run(fx).find((p) => p.id === 'ecc@ecc')
    assert.deepEqual(again.mcp, [{ name: 'flatsrv', config: { command: 'node' } }])
  } finally {
    fx.cleanup()
  }
})

function eccPath(fx) {
  return run(fx).find((p) => p.id === 'ecc@ecc').installPath
}

test('reads inline mcpServers from plugin.json and de-duplicates with .mcp.json first', () => {
  const fx = makeFixture()
  try {
    const dir = eccPath(fx)
    const manifest = path.join(dir, '.claude-plugin', 'plugin.json')
    const base = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        ...base,
        mcpServers: { inline: { command: 'npx', args: ['x'] }, dup: { command: 'from-manifest' } }
      })
    )
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { dup: { command: 'from-mcpjson' } } }))
    const mcp = run(fx).find((p) => p.id === 'ecc@ecc').mcp
    assert.deepEqual(
      mcp.map((m) => [m.name, m.config.command]),
      [
        ['dup', 'from-mcpjson'],
        ['inline', 'npx']
      ]
    )
  } finally {
    fx.cleanup()
  }
})

test('reads mcpServers given as a relative path string in plugin.json', () => {
  const fx = makeFixture()
  try {
    const dir = eccPath(fx)
    const manifest = path.join(dir, '.claude-plugin', 'plugin.json')
    const base = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    fs.writeFileSync(manifest, JSON.stringify({ ...base, mcpServers: './config/servers.json' }))
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'config', 'servers.json'),
      JSON.stringify({ mcpServers: { viafile: { command: 'node' } } })
    )
    const mcp = run(fx).find((p) => p.id === 'ecc@ecc').mcp
    assert.deepEqual(mcp, [{ name: 'viafile', config: { command: 'node' } }])
  } finally {
    fx.cleanup()
  }
})

test('ignores an mcpServers path that escapes the plugin folder', () => {
  const fx = makeFixture()
  try {
    const dir = eccPath(fx)
    const manifest = path.join(dir, '.claude-plugin', 'plugin.json')
    const base = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    fs.writeFileSync(manifest, JSON.stringify({ ...base, mcpServers: '../../../../../../settings.json' }))
    assert.deepEqual(run(fx).find((p) => p.id === 'ecc@ecc').mcp, [])
  } finally {
    fx.cleanup()
  }
})
