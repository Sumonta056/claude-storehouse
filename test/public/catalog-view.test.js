import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chipFilter, groupOpen, items, state } from '../../public/core/state.js'
import { normalize } from '../../public/logic/catalog.js'

const nodes = new Map()
globalThis.location ??= { search: '', href: 'http://localhost/', hash: '' }
globalThis.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '' })
    return nodes.get(id)
  },
  querySelector: () => null
}
const { renderCatalog } = await import('../../public/pages/catalog.js')

const DAY = 86400000

function skill(name, over = {}) {
  return {
    kind: 'skill',
    name,
    source: 'local',
    scope: 'global',
    description: 'Does a thing',
    enabled: true,
    canToggle: true,
    path: `/h/.claude/skills/${name}/SKILL.md`,
    ...over
  }
}

function pluginSkill(name, over = {}) {
  return skill(name, { source: 'tools', scope: 'plugin', plugin: 'tools@market', canToggle: false, ...over })
}

function plugin(over = {}) {
  return { id: 'tools@market', name: 'tools', enabled: true, skills: [], agents: [], hooks: [], mcp: [], ...over }
}

function inventory(over = {}) {
  return { plugins: [plugin()], skills: [], agents: [], hooks: [], mcp: [], favorites: [], devMods: [], ...over }
}

function catalog(page, inv, patch = {}, chip = 'all') {
  const fields = {
    inventory: inv,
    page,
    query: '',
    scope: 'all',
    usage: null,
    usageSort: 'name',
    menuKey: null,
    ...patch
  }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  const chipBefore = chipFilter[page]
  Object.assign(state, fields)
  chipFilter[page] = chip
  try {
    state.catalog = normalize(inv)
    const list = {
      skills: state.catalog.skill,
      agents: state.catalog.agent,
      plugins: state.catalog.plugin,
      mods: state.catalog.mod
    }[page]
    renderCatalog(page, list, 'Note')
    return nodes.get(`p-${page}`).innerHTML
  } finally {
    Object.assign(state, before)
    chipFilter[page] = chipBefore
    items.clear()
  }
}

function withGroupOpen(key, fn) {
  groupOpen.set(key, true)
  try {
    return fn()
  } finally {
    groupOpen.delete(key)
  }
}

test('an empty catalog says where it looked', () => {
  assert.ok(catalog('skills', inventory()).includes('No skills found in ~/.claude or ./.claude.'))
  assert.ok(catalog('agents', inventory()).includes('No agents found in ~/.claude or ./.claude.'))
})

test('Skills shows a Global and a Project section with counts and the file the switch writes', () => {
  const html = catalog(
    'skills',
    inventory({ skills: [skill('a'), skill('b'), skill('p', { source: 'project', scope: 'project' })] })
  )
  assert.ok(
    html.includes(
      '<h2>Global · ~/.claude/skills <span class="pill">2</span><span class="hint">The switch writes skillOverrides in ~/.claude/settings.json</span></h2>'
    )
  )
  assert.ok(
    html.includes(
      '<h2>Project · ./.claude/skills <span class="pill">1</span><span class="hint">The switch writes .claude/settings.local.json</span></h2>'
    )
  )
})

test('an empty section is left out', () => {
  const html = catalog('skills', inventory({ skills: [skill('a')] }))
  assert.ok(!html.includes('Project · ./.claude/skills'))
})

test('Agents sections say that Off renames the file', () => {
  const agents = [
    { kind: 'agent', name: 'h', source: 'local', scope: 'global', enabled: true, canToggle: true, path: '/h.md' }
  ]
  assert.ok(catalog('agents', inventory({ agents })).includes('Off renames name.md to name.md.disabled'))
})

test('plugin skills group by plugin, closed by default, with the plugin state', () => {
  const html = catalog('skills', inventory({ skills: [pluginSkill('x'), pluginSkill('y')] }))
  assert.ok(
    html.includes(
      '<h2>From plugins <span class="pill">2</span><span class="hint">Grouped by plugin. These skills follow their plugin switch.</span></h2>'
    )
  )
  assert.ok(
    html.includes(
      '<span class="gname">tools</span><span class="gcount">2 skills</span><span class="gstate on">Plugin on</span>'
    )
  )
  assert.match(html, /data-group="skill:tools@market" aria-expanded="false"/)
  assert.ok(html.includes('id="gp-skill-tools_market" hidden></div>'))
})

test('an open plugin group explains the lock and offers the plugin switch and uninstall', () => {
  const html = withGroupOpen('skill:tools@market', () => catalog('skills', inventory({ skills: [pluginSkill('x')] })))
  assert.match(html, /aria-expanded="true"/)
  assert.ok(
    html.includes('These skills are part of the plugin <b>tools</b>. You cannot delete or switch them one by one.')
  )
  assert.ok(html.includes('data-act="toggle">Switch off plugin</button>'))
  assert.ok(html.includes('data-act="uninstall">Uninstall plugin…</button>'))
  assert.ok(html.includes('data-key="plugin:plugin:tools@market"'))
  assert.ok(html.includes('data-key="skill:tools:x"'))
})

test('a search opens plugin groups', () => {
  const html = catalog('skills', inventory({ skills: [pluginSkill('x')] }), { query: 'x' })
  assert.match(html, /data-group="skill:tools@market" aria-expanded="true"/)
})

test('a group for a plugin that is off says so and offers Switch on plugin', () => {
  const inv = inventory({ plugins: [plugin({ enabled: false })], skills: [pluginSkill('x')] })
  const html = withGroupOpen('skill:tools@market', () => catalog('skills', inv))
  assert.ok(html.includes('<div class="pgroup off">'))
  assert.ok(html.includes('<span class="gstate">Plugin off</span>'))
  assert.ok(html.includes('>Switch on plugin</button>'))
})

test('a group for an unknown plugin uses the plugin id and has no notice', () => {
  const inv = inventory({ plugins: [], skills: [pluginSkill('x', { plugin: 'gone@m', source: 'gone' })] })
  const html = withGroupOpen('skill:gone@m', () => catalog('skills', inv))
  assert.ok(html.includes('<span class="gname">gone@m</span>'))
  assert.ok(!html.includes('class="pnote"'))
})

test('Plugins and Mods pages have no From plugins section, and dev mods are read-only', () => {
  const inv = inventory({
    devMods: [{ id: 'd', name: 'd', session: 'abcdef123456', modules: ['m.js'], path: '/h/.claude/dev-mods/x/d' }]
  })
  assert.ok(!catalog('plugins', inv).includes('From plugins'))
  const mods = catalog('mods', inv)
  assert.ok(
    mods.includes(
      'Development · ~/.claude/dev-mods <span class="pill">1</span><span class="hint">Read-only. These mods have no switch.</span>'
    )
  )
  assert.ok(!mods.includes('From plugins'))
})

test('a chip that hides every item says no item matches the filter', () => {
  const html = catalog('skills', inventory({ skills: [skill('a')] }), {}, 'off')
  assert.ok(html.includes('No skills match this filter.'))
})

test('a search that hides every item shows the escaped search text', () => {
  const html = catalog('skills', inventory({ skills: [skill('a')] }), { query: '<z>' })
  assert.ok(html.includes('Nothing matches &quot;&lt;z&gt;&quot; in this scope.'))
})

test('the Most used sort puts the most used skill first', () => {
  const usage = {
    items: { 'skill:b': { count30: 9, last: Date.now() }, 'skill:a': { count30: 1, last: Date.now() } },
    all: { responses: 1 },
    since: Date.now() - 40 * DAY
  }
  const inv = inventory({ skills: [skill('a'), skill('b')] })
  const most = catalog('skills', inv, { usage, usageSort: 'most' })
  assert.ok(most.indexOf('data-key="skill:local:b"') < most.indexOf('data-key="skill:local:a"'))
  const name = catalog('skills', inv, { usage, usageSort: 'name' })
  assert.ok(name.indexOf('data-key="skill:local:a"') < name.indexOf('data-key="skill:local:b"'))
})

test('the chip bar comes first with the page note', () => {
  const html = catalog('skills', inventory({ skills: [skill('a')] }))
  assert.ok(html.startsWith('<div class="chipbar">'))
  assert.ok(html.includes('<p class="note">Note</p>'))
})
