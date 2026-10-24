import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  normalize,
  pluginLabel,
  matches,
  visible,
  switchInfo,
  favoriteEntries,
  counts,
  otherCounts,
  favCats,
  favOf,
  favNameError,
  itemLabel,
  favPopOptions,
  favBody,
  switchable,
  projectOn,
  isPluginOwned,
  ownerPlugin,
  hasSwitch
} from '../../public/logic/catalog.js'
import { items, state } from '../../public/core/state.js'
import { scanAll } from '../../src/scan/index.js'
import { makeFixture } from '../helpers/fixture.js'

function withState(patch, fn) {
  const before = {}
  for (const key of Object.keys(patch)) before[key] = state[key]
  Object.assign(state, patch)
  try {
    return fn()
  } finally {
    Object.assign(state, before)
  }
}

function plugin(over = {}) {
  return {
    id: 'tools@market',
    name: 'tools',
    marketplace: 'market',
    version: '1.2.0',
    description: 'Tool kit',
    scope: 'global',
    installPath: '/h/.claude/plugins/cache/market/tools/1.2.0',
    enabled: true,
    missing: false,
    favorite: false,
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    ...over
  }
}

function inventory(over = {}) {
  return {
    skills: [],
    agents: [],
    plugins: [],
    hooks: [],
    mcp: [],
    favorites: [],
    ...over
  }
}

test('normalize keys skills and agents by kind, source, and name and registers them in the item map', () => {
  const out = normalize(
    inventory({
      skills: [{ kind: 'skill', name: 'review', source: 'global', scope: 'global', enabled: true }],
      agents: [{ kind: 'agent', name: 'helper', source: 'project', scope: 'project', enabled: false }]
    })
  )
  assert.equal(out.skill[0].key, 'skill:global:review')
  assert.equal(out.agent[0].key, 'agent:project:helper')
  assert.equal(items.get('skill:global:review'), out.skill[0])
  assert.equal(items.get('agent:project:helper').enabled, false)
})

test('normalize clears items left from the previous inventory', () => {
  normalize(inventory({ skills: [{ name: 'old', source: 'global', scope: 'global' }] }))
  normalize(inventory())
  assert.equal(items.has('skill:global:old'), false)
  assert.equal(items.size, 0)
})

test('normalize builds a plugin row with a meta line that lists only non-empty hooks and MCP', () => {
  const out = normalize(
    inventory({
      plugins: [
        plugin({ skills: [{}, {}], agents: [{}] }),
        plugin({ id: 'b@m', name: 'b', version: '', hooks: [{}], mcp: [{}, {}] })
      ]
    })
  )
  assert.equal(out.plugin[0].key, 'plugin:plugin:tools@market')
  assert.equal(out.plugin[0].meta, 'v1.2.0 · 2 skills · 1 agents')
  assert.equal(out.plugin[0].source, 'market')
  assert.equal(out.plugin[0].favSource, 'plugin')
  assert.equal(out.plugin[0].canToggle, true)
  assert.equal(out.plugin[1].meta, '0 skills · 0 agents · 1 hooks · 2 MCP')
})

test('normalize makes a missing plugin not switchable and lists mods on both plugin and mod lists', () => {
  const out = normalize(
    inventory({
      plugins: [plugin({ missing: true }), plugin({ id: 'skin@m', name: 'skin', isMod: true, modules: ['a'] })]
    })
  )
  assert.equal(out.plugin[0].canToggle, false)
  assert.equal(out.plugin.length, 2)
  assert.deepEqual(
    out.mod.map((m) => m.id),
    ['skin@m']
  )
  assert.deepEqual(out.mod[0].modules, ['a'])
  assert.equal(out.plugin[0].isMod, false)
})

test('normalize lists dev mods only as mods, always on and never switchable', () => {
  const out = normalize(
    inventory({ devMods: [{ id: 'wip', name: 'wip', path: '/h/.claude/dev-mods/s1/wip', session: 's1' }] })
  )
  assert.equal(out.plugin.length, 0)
  assert.equal(out.mod.length, 1)
  assert.equal(out.mod[0].key, 'plugin:dev:wip')
  assert.equal(out.mod[0].dev, true)
  assert.equal(out.mod[0].enabled, true)
  assert.equal(out.mod[0].canToggle, false)
  assert.equal(out.mod[0].scope, 'dev')
})

test('normalize names hook sources by plugin, parked state, or settings file', () => {
  state.inventory = inventory({ plugins: [plugin()] })
  try {
    const base = { event: 'PreToolUse', matcher: '*', index: { group: 0, hook: 1 } }
    const out = normalize(
      inventory({
        plugins: [plugin()],
        hooks: [
          { ...base, id: 'a', file: 'global', command: 'echo a' },
          { ...base, id: 'b', file: 'projectLocal', command: 'echo b', parked: true },
          { ...base, id: 'c', file: 'plugin', command: 'echo c', plugin: 'tools@market' },
          { ...base, id: 'd', file: 'other.json' }
        ]
      })
    )
    assert.deepEqual(
      out.hook.map((h) => h.source),
      ['~/.claude/settings.json', 'parked', 'tools', 'other.json']
    )
    assert.equal(out.hook[0].key, 'hook:a:global:0:1')
    assert.equal(out.hook[1].key, 'hook:b:projectLocal:0:1:parked')
    assert.equal(out.hook[0].description, 'PreToolUse · *')
    assert.equal(out.hook[3].name, '')
  } finally {
    state.inventory = null
  }
})

test('normalize names MCP sources by origin or plugin and describes them by command or URL', () => {
  state.inventory = inventory({ plugins: [plugin()] })
  try {
    const out = normalize(
      inventory({
        plugins: [plugin()],
        mcp: [
          { name: 'fs', origin: 'user', command: 'npx' },
          { name: 'web', origin: 'mcpjson', url: 'https://x' },
          { name: 'db', origin: 'plugin', plugin: 'tools@market' },
          { name: 'odd', origin: 'weird' }
        ]
      })
    )
    assert.deepEqual(
      out.mcp.map((m) => m.source),
      ['~/.claude.json', '.mcp.json', 'tools', 'weird']
    )
    assert.deepEqual(
      out.mcp.map((m) => m.description),
      ['npx', 'https://x', '', '']
    )
    assert.equal(out.mcp[2].key, 'mcp:plugin:tools@market:db')
    assert.equal(out.mcp[0].key, 'mcp:user::fs')
  } finally {
    state.inventory = null
  }
})

test('normalize of a scanned fixture inventory gives every item a unique key in the item map', () => {
  const fx = makeFixture()
  const managedDir = path.join(fx.home, 'no-managed')
  fs.mkdirSync(managedDir)
  try {
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir, managedDir })
    state.inventory = inv
    const out = normalize(inv)
    assert.equal(out.skill.length, inv.skills.length)
    assert.equal(out.agent.length, inv.agents.length)
    assert.equal(out.plugin.length, inv.plugins.length)
    assert.equal(out.hook.length, inv.hooks.length)
    assert.equal(out.mcp.length, inv.mcp.length)
    const all = [...out.skill, ...out.agent, ...out.plugin, ...out.hook, ...out.mcp]
    assert.ok(all.length > 0)
    for (const item of all) assert.equal(items.get(item.key), item)
  } finally {
    state.inventory = null
    fx.cleanup()
  }
})

test('pluginLabel gives the plugin name, or the id when the plugin is unknown', () => {
  withState({ inventory: inventory({ plugins: [plugin()] }) }, () => {
    assert.equal(pluginLabel('tools@market'), 'tools')
    assert.equal(pluginLabel('gone@x'), 'gone@x')
  })
})

test('matches is true for an empty or blank query', () => {
  withState({ query: '   ' }, () => assert.equal(matches({ name: 'x' }), true))
})

test('matches searches name, description, source, plugin, id, model, and tools without case', () => {
  const item = {
    name: 'Alpha',
    description: 'does beta',
    source: 'global',
    plugin: 'kit@m',
    id: 'id-9',
    model: 'opus',
    tools: ['Read', 'Grep']
  }
  for (const q of ['ALPHA', 'beta', 'glob', 'kit@', 'id-9', 'OPUS', 'read grep', '  alpha  '])
    withState({ query: q }, () => assert.equal(matches(item), true, q))
  withState({ query: 'zeta' }, () => assert.equal(matches(item), false))
})

test('visible with scope global keeps global, plugin, and dev items and hides project items', () => {
  withState({ scope: 'global', query: '' }, () => {
    assert.equal(visible({ scope: 'global' }), true)
    assert.equal(visible({ scope: 'plugin' }), true)
    assert.equal(visible({ scope: 'dev' }), true)
    assert.equal(visible({ scope: 'project' }), false)
  })
})

test('visible with scope project keeps only project items', () => {
  withState({ scope: 'project', query: '' }, () => {
    assert.equal(visible({ scope: 'project' }), true)
    assert.equal(visible({ scope: 'global' }), false)
    assert.equal(visible({ scope: 'plugin' }), false)
  })
})

test('visible with scope all still applies the search', () => {
  withState({ scope: 'all', query: 'foo' }, () => {
    assert.equal(visible({ scope: 'project', name: 'foo' }), true)
    assert.equal(visible({ scope: 'global', name: 'bar' }), false)
  })
})

test('switchInfo for a plugin names enabledPlugins in the file of its scope', () => {
  assert.deepEqual(switchInfo({ kind: 'plugin', id: 'p@m', scope: 'global' }), {
    disabled: false,
    title: 'Writes enabledPlugins["p@m"] in ~/.claude/settings.json'
  })
  assert.match(switchInfo({ kind: 'plugin', id: 'p@m', scope: 'project' }).title, /\.claude\/settings\.local\.json$/)
})

test('switchInfo disables dev mods and missing plugins', () => {
  assert.equal(switchInfo({ kind: 'plugin', dev: true, session: 's1' }).text, 'dev mod')
  assert.equal(switchInfo({ kind: 'plugin', dev: true, session: 's1' }).disabled, true)
  assert.equal(switchInfo({ kind: 'plugin', missing: true, id: 'p' }).text, 'not installed')
})

test('switchInfo for a local hook parks it in storehouse.json or puts it back', () => {
  const hook = { kind: 'hook', canToggle: true, file: 'global', enabled: true }
  assert.equal(switchInfo(hook).title, 'Off moves this hook from ~/.claude/settings.json to ~/.claude/storehouse.json')
  assert.equal(switchInfo({ ...hook, enabled: false }).title, 'On puts this hook back in ~/.claude/settings.json')
  assert.equal(switchInfo({ ...hook, canToggle: false }).text, 'cannot switch')
})

test('switchInfo for MCP names the settings key for .mcp.json and disabledMcpServers otherwise', () => {
  assert.match(switchInfo({ kind: 'mcp', canToggle: true, origin: 'mcpjson' }).title, /disabledMcpjsonServers/)
  assert.match(
    switchInfo({ kind: 'mcp', canToggle: true, origin: 'user' }).title,
    /disabledMcpServers .* ~\/\.claude\.json/
  )
  assert.equal(switchInfo({ kind: 'mcp', canToggle: false, name: 'x' }).disabled, true)
})

test('switchInfo for a plugin skill or hook says it follows the plugin', () => {
  withState({ inventory: inventory({ plugins: [plugin()] }) }, () => {
    const info = switchInfo({ kind: 'skill', canToggle: false, plugin: 'tools@market', source: 'tools@market' })
    assert.equal(info.disabled, true)
    assert.equal(info.text, 'via plugin tools')
    const hook = switchInfo({ kind: 'hook', plugin: 'tools@market', canToggle: false })
    assert.equal(hook.text, 'via plugin tools')
  })
  assert.equal(switchInfo({ kind: 'skill', canToggle: false, source: 'market' }).text, 'via plugin market')
})

test('switchInfo for an agent renames the file to .disabled and back', () => {
  assert.equal(
    switchInfo({ kind: 'agent', canToggle: true, enabled: true, path: '/h/.claude/agents/a.md' }).title,
    'Renames a.md to a.md.disabled'
  )
  assert.equal(
    switchInfo({ kind: 'agent', canToggle: true, enabled: false, path: '/h/.claude/agents/a.md.disabled' }).title,
    'Renames a.md.disabled back to a.md'
  )
})

test('switchInfo for a local skill names skillOverrides in the file of its scope', () => {
  assert.equal(
    switchInfo({ kind: 'skill', canToggle: true, name: 'r', scope: 'global' }).title,
    'Writes skillOverrides["r"] in ~/.claude/settings.json'
  )
  assert.equal(
    switchInfo({ kind: 'skill', canToggle: true, name: 'r', scope: 'project' }).title,
    'Writes skillOverrides["r"] in .claude/settings.local.json'
  )
})

test('favoriteEntries pairs each favorite with its item, or null when the item is gone', () => {
  const inv = inventory({
    skills: [{ name: 'review', source: 'global', scope: 'global' }],
    favorites: [{ id: 'skill:global:review' }, { id: 'skill:global:gone' }]
  })
  normalize(inv)
  withState({ inventory: inv }, () => {
    const out = favoriteEntries()
    assert.equal(out[0].item.name, 'review')
    assert.equal(out[1].item, null)
    assert.equal(out[1].fav.id, 'skill:global:gone')
  })
})

test('counts counts visible items and the ones that are on', () => {
  const list = [
    { scope: 'global', name: 'a', enabled: true },
    { scope: 'global', name: 'b', enabled: false },
    { scope: 'project', name: 'c', enabled: true }
  ]
  withState({ scope: 'global', query: '' }, () => assert.deepEqual(counts(list), { total: 2, on: 1 }))
  withState({ scope: 'all', query: 'c' }, () => assert.deepEqual(counts(list), { total: 1, on: 1 }))
  assert.deepEqual(counts([]), { total: 0, on: 0 })
})

test('otherCounts matches raw hooks by command, event, and plugin', () => {
  const list = [
    { scope: 'global', command: 'lint.sh', event: 'PostToolUse', enabled: true },
    { scope: 'global', command: 'fmt.sh', event: 'Stop', plugin: 'kit', enabled: false }
  ]
  withState({ scope: 'all', query: 'lint' }, () => assert.deepEqual(otherCounts(list), { total: 1, on: 1 }))
  withState({ scope: 'all', query: 'stop' }, () => assert.deepEqual(otherCounts(list), { total: 1, on: 0 }))
  withState({ scope: 'all', query: 'kit' }, () => assert.deepEqual(otherCounts(list), { total: 1, on: 0 }))
  withState({ scope: 'project', query: '' }, () => assert.deepEqual(otherCounts(list), { total: 0, on: 0 }))
})

test('favCats returns the categories or an empty list', () => {
  withState({ inventory: inventory() }, () => assert.deepEqual(favCats(), []))
  withState({ inventory: inventory({ favoriteCategories: ['Daily'] }) }, () => assert.deepEqual(favCats(), ['Daily']))
})

test('favOf finds the favorite by item key', () => {
  withState({ inventory: inventory({ favorites: [{ id: 'skill:global:a', order: 0 }] }) }, () => {
    assert.deepEqual(favOf({ key: 'skill:global:a' }), { id: 'skill:global:a', order: 0 })
    assert.equal(favOf({ key: 'skill:global:b' }), null)
  })
})

test('favNameError rejects empty, too long, and reserved names', () => {
  assert.equal(favNameError(''), 'Type a category name.')
  assert.equal(favNameError('x'.repeat(41)), 'Use 40 characters or fewer.')
  assert.equal(favNameError('x'.repeat(40)), null)
  assert.equal(favNameError('UnCategorized'), 'Uncategorized is a reserved name.')
  assert.equal(favNameError('Daily'), null)
})

test('itemLabel adds the plugin name for plugin items', () => {
  withState({ inventory: inventory({ plugins: [plugin()] }) }, () => {
    assert.equal(itemLabel({ name: 'r', plugin: 'tools@market' }), 'r · via plugin tools')
    assert.equal(itemLabel({ name: 'r' }), 'r')
  })
})

test('favPopOptions lists Uncategorized and every category without a query', () => {
  withState({ inventory: inventory({ favoriteCategories: ['Daily', 'Review'] }) }, () => {
    assert.deepEqual(favPopOptions(''), [
      { value: '', label: 'Uncategorized' },
      { value: 'Daily', label: 'Daily' },
      { value: 'Review', label: 'Review' }
    ])
  })
})

test('favPopOptions filters by query and offers to create a new name', () => {
  withState({ inventory: inventory({ favoriteCategories: ['Daily', 'Review'] }) }, () => {
    assert.deepEqual(favPopOptions(' dai '), [{ value: 'Daily', label: 'Daily' }, { create: 'dai' }])
    assert.deepEqual(favPopOptions('REVIEW'), [{ value: 'Review', label: 'Review' }])
    assert.deepEqual(favPopOptions('new'), [{ create: 'new' }])
  })
})

test('favBody uses the plugin id and source plugin for plugins and adds category only when given', () => {
  assert.deepEqual(favBody({ kind: 'plugin', id: 'p@m', name: 'p', source: 'm' }, true), {
    kind: 'plugin',
    name: 'p@m',
    source: 'plugin',
    favorite: true
  })
  assert.deepEqual(favBody({ kind: 'skill', name: 'r', source: 'global' }, false, ''), {
    kind: 'skill',
    name: 'r',
    source: 'global',
    favorite: false,
    category: ''
  })
})

test('switchable uses canToggle on the MCP page and scope elsewhere', () => {
  assert.equal(switchable('mcp', { canToggle: false, scope: 'global' }), false)
  assert.equal(switchable('mcp', { canToggle: true, scope: 'plugin' }), true)
  assert.equal(switchable('skills', { scope: 'plugin' }), false)
  assert.equal(switchable('skills', { scope: 'project' }), true)
})

test('projectOn is true only when the inventory has a project folder', () => {
  withState({ inventory: null }, () => assert.equal(projectOn(), false))
  withState({ inventory: { project: null } }, () => assert.equal(projectOn(), false))
  withState({ inventory: { project: { dir: '/p' } } }, () => assert.equal(projectOn(), true))
})

test('isPluginOwned is true for items of a plugin but never for a plugin itself', () => {
  assert.equal(isPluginOwned({ kind: 'skill', plugin: 'p' }), true)
  assert.equal(isPluginOwned({ kind: 'agent', scope: 'plugin' }), true)
  assert.equal(isPluginOwned({ kind: 'skill', scope: 'global' }), false)
  assert.equal(isPluginOwned({ kind: 'plugin', scope: 'plugin' }), false)
})

test('ownerPlugin finds the catalog plugin of a plugin item', () => {
  const p = { kind: 'plugin', id: 'tools@market' }
  withState({ catalog: { skill: [], agent: [], plugin: [p], mod: [], hook: [], mcp: [] } }, () => {
    assert.equal(ownerPlugin({ kind: 'skill', plugin: 'tools@market' }), p)
    assert.equal(ownerPlugin({ kind: 'skill', scope: 'plugin', source: 'tools@market' }), p)
    assert.equal(ownerPlugin({ kind: 'skill', plugin: 'gone' }), null)
    assert.equal(ownerPlugin({ kind: 'skill', scope: 'global' }), null)
  })
})

test('hasSwitch is true only for local skills, agents, and installed plugins', () => {
  assert.equal(hasSwitch({ kind: 'skill', scope: 'global' }), true)
  assert.equal(hasSwitch({ kind: 'agent', scope: 'project' }), true)
  assert.equal(hasSwitch({ kind: 'plugin', scope: 'global' }), true)
  assert.equal(hasSwitch({ kind: 'plugin', missing: true }), false)
  assert.equal(hasSwitch({ kind: 'plugin', dev: true }), false)
  assert.equal(hasSwitch({ kind: 'skill', plugin: 'p' }), false)
  assert.equal(hasSwitch({ kind: 'hook', scope: 'global' }), false)
  assert.equal(hasSwitch({ kind: 'mcp', scope: 'global' }), false)
})
