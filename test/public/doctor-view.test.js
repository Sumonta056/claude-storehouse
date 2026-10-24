import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOC_SEVERITY, DOC_KIND, doctorIssues, doctorItem, doctorMatches } from '../../public/logic/doctor.js'
import { normalize } from '../../public/logic/catalog.js'
import { items, state } from '../../public/core/state.js'

function withState(fields, fn) {
  const saved = {}
  for (const k of Object.keys(fields)) saved[k] = state[k]
  Object.assign(state, fields)
  try {
    return fn()
  } finally {
    Object.assign(state, saved)
  }
}

function inventory() {
  return {
    plugins: [{ id: 'tools@market', name: 'tools', skills: [], agents: [], hooks: [], mcp: [] }],
    mods: [],
    skills: [
      { name: 'review', source: 'global', scope: 'global', enabled: true },
      { name: 'review', source: 'project', scope: 'project', enabled: true },
      { name: 'review', source: 'tools', scope: 'global', plugin: 'tools@market', enabled: true }
    ],
    agents: [{ name: 'helper', source: 'global', scope: 'global', enabled: true }],
    hooks: [{ id: 'h1', event: 'PreToolUse', matcher: '*', command: 'run.sh', file: 'global', index: {} }],
    mcp: [
      { name: 'srv', origin: 'user', scope: 'global', command: 'node' },
      { name: 'srv', origin: 'mcpjson', plugin: 'tools@market', scope: 'project', command: 'node' }
    ]
  }
}

function withCatalog(fn) {
  const inv = inventory()
  return withState({ inventory: inv }, () => {
    const catalog = normalize(inv)
    try {
      return withState({ catalog }, fn)
    } finally {
      items.clear()
    }
  })
}

test('DOC_SEVERITY lists error, warning, and info in that order', () => {
  assert.deepEqual(
    DOC_SEVERITY.map(([k]) => k),
    ['error', 'warning', 'info']
  )
})

test('DOC_KIND names every issue kind', () => {
  assert.deepEqual(Object.keys(DOC_KIND).sort(), ['agent', 'claudemd', 'file', 'hook', 'mcp', 'plugin', 'skill'])
})

test('doctorIssues returns the issues or an empty list', () => {
  withState({ doctor: null }, () => assert.deepEqual(doctorIssues(), []))
  withState({ doctor: {} }, () => assert.deepEqual(doctorIssues(), []))
  const issues = [{ id: 'a' }]
  withState({ doctor: { issues, checked: 3 } }, () => assert.equal(doctorIssues(), issues))
})

test('doctorItem returns null for a missing target or a target without a kind', () => {
  withCatalog(() => {
    assert.equal(doctorItem(null), null)
    assert.equal(doctorItem(undefined), null)
    assert.equal(doctorItem({ name: 'review' }), null)
  })
})

test('doctorItem finds a skill by name, scope, and no plugin', () => {
  withCatalog(() => {
    const global = doctorItem({ kind: 'skill', name: 'review', scope: 'global' })
    const project = doctorItem({ kind: 'skill', name: 'review', scope: 'project' })
    assert.equal(global.source, 'global')
    assert.equal(global.plugin, undefined)
    assert.equal(project.source, 'project')
  })
})

test('doctorItem finds a plugin skill only when the plugin matches', () => {
  withCatalog(() => {
    const item = doctorItem({ kind: 'skill', name: 'review', scope: 'global', plugin: 'tools@market' })
    assert.equal(item.plugin, 'tools@market')
    assert.equal(doctorItem({ kind: 'skill', name: 'review', scope: 'global', plugin: 'gone@market' }), null)
  })
})

test('doctorItem finds an agent and returns null for an unknown name', () => {
  withCatalog(() => {
    assert.equal(doctorItem({ kind: 'agent', name: 'helper', scope: 'global' }).name, 'helper')
    assert.equal(doctorItem({ kind: 'agent', name: 'nobody', scope: 'global' }), null)
  })
})

test('doctorItem finds a hook by id', () => {
  withCatalog(() => {
    assert.equal(doctorItem({ kind: 'hook', id: 'h1' }).name, 'run.sh')
    assert.equal(doctorItem({ kind: 'hook', id: 'h2' }), null)
  })
})

test('doctorItem finds an MCP server by origin, plugin, and name', () => {
  withCatalog(() => {
    assert.equal(doctorItem({ kind: 'mcp', origin: 'user', name: 'srv' }).origin, 'user')
    assert.equal(
      doctorItem({ kind: 'mcp', origin: 'mcpjson', plugin: 'tools@market', name: 'srv' }).plugin,
      'tools@market'
    )
    assert.equal(doctorItem({ kind: 'mcp', origin: 'local', name: 'srv' }), null)
  })
})

test('doctorItem returns null for a kind with no catalog list', () => {
  withCatalog(() => assert.equal(doctorItem({ kind: 'file', name: 'settings.json' }), null))
})

test('doctorMatches keeps every issue when the search is empty or blank', () => {
  withState({ query: '' }, () => assert.equal(doctorMatches({}), true))
  withState({ query: '   ' }, () => assert.equal(doctorMatches({}), true))
})

test('doctorMatches searches name, message, and file without case', () => {
  const issue = { name: 'Review', message: 'Has no description', file: '/h/.claude/skills/review/SKILL.md' }
  withState({ query: 'REVIEW' }, () => assert.equal(doctorMatches(issue), true))
  withState({ query: ' description ' }, () => assert.equal(doctorMatches(issue), true))
  withState({ query: 'skill.md' }, () => assert.equal(doctorMatches(issue), true))
  withState({ query: 'hook' }, () => assert.equal(doctorMatches(issue), false))
})

test('doctorMatches handles missing fields', () => {
  withState({ query: 'x' }, () => assert.equal(doctorMatches({ name: null }), false))
})
