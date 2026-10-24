import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dupSource, duplicateGroups, onCount, needsAction, DUP_KINDS } from '../../public/logic/duplicates.js'
import { state } from '../../public/core/state.js'

function catalog(over = {}) {
  return { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [], ...over }
}

function withCatalog(cat, fn) {
  const before = state.catalog
  state.catalog = cat
  try {
    return fn()
  } finally {
    state.catalog = before
  }
}

function withInventory(inv, fn) {
  const before = state.inventory
  state.inventory = inv
  try {
    return fn()
  } finally {
    state.inventory = before
  }
}

test('DUP_KINDS covers skills, agents, and MCP servers only', () => {
  assert.deepEqual(
    DUP_KINDS.map(([k]) => k),
    ['skill', 'agent', 'mcp']
  )
})

test('duplicateGroups is empty when every name is unique', () => {
  const cat = catalog({ skill: [{ name: 'a' }, { name: 'b' }], agent: [{ name: 'c' }], mcp: [{ name: 'd' }] })
  withCatalog(cat, () => assert.deepEqual(duplicateGroups(), []))
})

test('duplicateGroups is empty for an empty catalog', () => {
  withCatalog(catalog(), () => assert.deepEqual(duplicateGroups(), []))
})

test('duplicateGroups groups a global and a project skill with one name', () => {
  const g = { name: 'review', scope: 'global', enabled: true }
  const p = { name: 'review', scope: 'project', enabled: true }
  withCatalog(catalog({ skill: [g, { name: 'other' }, p] }), () => {
    const groups = duplicateGroups()
    assert.equal(groups.length, 1)
    assert.equal(groups[0].key, 'skill:review')
    assert.equal(groups[0].kind, 'skill')
    assert.equal(groups[0].name, 'review')
    assert.deepEqual(groups[0].items, [g, p])
  })
})

test('duplicateGroups does not group a skill and an agent with one name', () => {
  withCatalog(catalog({ skill: [{ name: 'helper' }], agent: [{ name: 'helper' }] }), () =>
    assert.deepEqual(duplicateGroups(), [])
  )
})

test('duplicateGroups includes plugin items and MCP servers', () => {
  const cat = catalog({
    skill: [{ name: 'review' }, { name: 'review', plugin: 'kit@m', scope: 'plugin' }],
    mcp: [
      { name: 'fs', origin: 'user' },
      { name: 'fs', origin: 'mcpjson' },
      { name: 'fs', plugin: 'kit@m' }
    ]
  })
  withCatalog(cat, () => {
    const groups = duplicateGroups()
    assert.deepEqual(
      groups.map((g) => [g.key, g.items.length]),
      [
        ['skill:review', 2],
        ['mcp:fs', 3]
      ]
    )
  })
})

test('duplicateGroups ignores the scope filter and the search', () => {
  const before = { scope: state.scope, query: state.query }
  state.scope = 'project'
  state.query = 'nothing-matches'
  try {
    withCatalog(
      catalog({
        agent: [
          { name: 'a', scope: 'global' },
          { name: 'a', scope: 'global' }
        ]
      }),
      () => assert.equal(duplicateGroups().length, 1)
    )
  } finally {
    Object.assign(state, before)
  }
})

test('duplicateGroups treats names as case sensitive', () => {
  withCatalog(catalog({ skill: [{ name: 'Review' }, { name: 'review' }] }), () =>
    assert.deepEqual(duplicateGroups(), [])
  )
})

test('onCount counts items that are on', () => {
  assert.equal(onCount({ items: [{ enabled: true }, { enabled: false }, { enabled: true }] }), 2)
  assert.equal(onCount({ items: [] }), 0)
})

test('needsAction is a conflict only when more than one item is on', () => {
  assert.equal(needsAction({ items: [{ enabled: true }, { enabled: true }] }), true)
  assert.equal(needsAction({ items: [{ enabled: true }, { enabled: false }] }), false)
  assert.equal(needsAction({ items: [{ enabled: false }, { enabled: false }] }), false)
})

test('needsAction counts plugin items that are on', () => {
  assert.equal(needsAction({ items: [{ enabled: true }, { enabled: true, plugin: 'kit@m', scope: 'plugin' }] }), true)
})

test('dupSource names the plugin, the MCP source, or the scope', () => {
  withInventory({ plugins: [{ id: 'kit@m', name: 'kit' }] }, () => {
    assert.equal(dupSource({ kind: 'skill', plugin: 'kit@m' }), 'via plugin kit')
    assert.equal(dupSource({ kind: 'mcp', plugin: 'gone@m' }), 'via plugin gone@m')
  })
  assert.equal(dupSource({ kind: 'mcp', source: '.mcp.json', scope: 'project' }), '.mcp.json')
  assert.equal(dupSource({ kind: 'skill', scope: 'project' }), 'Project')
  assert.equal(dupSource({ kind: 'agent', scope: 'global' }), 'Global')
})
