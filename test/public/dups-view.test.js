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
const { renderDups } = await import('../../public/pages/dups.js')

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

const project = { source: 'project', scope: 'project', description: 'Other text' }

function inventory(over = {}) {
  return {
    plugins: [{ id: 'tools@market', name: 'tools', enabled: true, skills: [], agents: [], hooks: [], mcp: [] }],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    favorites: [],
    ...over
  }
}

function dups(inv, patch = {}, chip = 'all') {
  const fields = { inventory: inv, page: 'dups', query: '', scope: 'all', usage: null, menuKey: null, ...patch }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  const chipBefore = chipFilter.dups
  Object.assign(state, fields)
  chipFilter.dups = chip
  try {
    state.catalog = normalize(inv)
    renderDups()
    return nodes.get('p-dups').innerHTML
  } finally {
    Object.assign(state, before)
    chipFilter.dups = chipBefore
    items.clear()
  }
}

function withGroupOpen(key, value, fn) {
  groupOpen.set(key, value)
  try {
    return fn()
  } finally {
    groupOpen.delete(key)
  }
}

test('Duplicates says there are none when every name is unique', () => {
  const html = dups(inventory({ skills: [skill('a'), skill('b')] }))
  assert.ok(html.includes('No duplicates. Each skill, agent, and MCP server has its own name.'))
})

test('a group with two items on is a Conflict, open, with Keep only this on each row', () => {
  const html = dups(inventory({ skills: [skill('review'), skill('review', project)] }))
  assert.ok(html.includes('Same name <span class="pill">1</span>'))
  assert.ok(html.includes('<span class="gstate bad">Conflict · 2 on</span>'))
  assert.ok(html.includes('<span class="gcount">2 skills</span>'))
  assert.match(html, /data-group="dup:skill:review" aria-expanded="true"/)
  assert.ok(html.includes('Claude Code sees 2 skills named <code>review</code>. Switch off the ones you do not want.'))
  assert.equal(html.match(/data-act="keep">Keep only this/g).length, 2)
  assert.ok(html.includes('<span class="src">Global</span>'))
  assert.ok(html.includes('<span class="src">Project</span>'))
})

test('a group with one item on is OK and starts closed with no rows', () => {
  const html = dups(inventory({ skills: [skill('review'), skill('review', { ...project, enabled: false })] }))
  assert.ok(html.includes('<span class="gstate ok">OK · 1 on</span>'))
  assert.match(html, /aria-expanded="false" aria-controls="gp-dup-skill_review"/)
  assert.ok(html.includes('id="gp-dup-skill_review" hidden></div>'))
  assert.ok(!html.includes('data-rows="dups"'))
})

test('a group the user opened stays open even when it is OK, and has no keep button', () => {
  const inv = inventory({ skills: [skill('review'), skill('review', { ...project, enabled: false })] })
  const html = withGroupOpen('dup:skill:review', true, () => dups(inv))
  assert.match(html, /aria-expanded="true"/)
  assert.ok(html.includes('data-rows="dups"'))
  assert.ok(!html.includes('data-act="keep"'))
  assert.ok(!html.includes('Claude Code sees'))
})

test('a conflict group the user closed stays closed', () => {
  const inv = inventory({ skills: [skill('review'), skill('review', project)] })
  const html = withGroupOpen('dup:skill:review', false, () => dups(inv))
  assert.match(html, /aria-expanded="false"/)
  assert.ok(html.includes('<span class="gstate bad">Conflict · 2 on</span>'))
})

test('items with the same description get a copy note', () => {
  const html = dups(
    inventory({ skills: [skill('review'), skill('review', { ...project, description: 'Does a thing' })] })
  )
  assert.ok(html.includes('<b>Same description.</b> One skill looks like a copy of the other.'))
})

test('a plugin item in a conflict names its plugin and only the plugin row offers Keep only this', () => {
  const inv = inventory({
    skills: [
      skill('review'),
      skill('review', { source: 'tools', scope: 'plugin', plugin: 'tools@market', canToggle: false })
    ]
  })
  const html = dups(inv)
  assert.ok(
    html.includes(
      '<code>review</code> follows the plugin <b>tools</b>. Switch the plugin off on the Plugins page, or keep it.'
    )
  )
  assert.ok(html.includes('<span class="src">via plugin tools</span>'))
  assert.equal(html.match(/data-act="keep"/g).length, 1)
})

test('a group name with HTML is escaped in the header and the note', () => {
  const html = dups(inventory({ skills: [skill('<x>'), skill('<x>', project)] }))
  assert.ok(html.includes('<span class="gname">&lt;x&gt;</span>'))
  assert.ok(html.includes('named <code>&lt;x&gt;</code>'))
  assert.ok(!html.includes('<x>'))
})

test('MCP servers with one name form a group that uses the MCP server word', () => {
  const mcp = [
    { name: 'srv', origin: 'user', scope: 'global', command: 'a', enabled: true, canToggle: true },
    { name: 'srv', origin: 'mcpjson', scope: 'project', command: 'b', enabled: true, canToggle: true }
  ]
  const html = dups(inventory({ mcp }))
  assert.ok(html.includes('<span class="gcount">2 MCP servers</span>'))
  assert.ok(html.includes('Claude Code sees 2 MCP servers named <code>srv</code>'))
})

test('a skill and an agent with one name do not form a group', () => {
  const agents = [
    { kind: 'agent', name: 'review', source: 'local', scope: 'global', enabled: true, canToggle: true, path: '/a.md' }
  ]
  assert.ok(dups(inventory({ skills: [skill('review')], agents })).includes('No duplicates.'))
})

test('the Needs action chip says so when no group has a conflict', () => {
  const inv = inventory({ skills: [skill('review'), skill('review', { ...project, enabled: false })] })
  const html = dups(inv, {}, 'needs')
  assert.ok(html.includes('No group needs action. In each group, only one item is on.'))
})

test('a search that hides every group shows the nothing-matches note', () => {
  const html = dups(inventory({ skills: [skill('review'), skill('review', project)] }), { query: 'zzz' })
  assert.ok(html.includes('Nothing matches &quot;zzz&quot; in this scope.'))
})
