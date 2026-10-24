import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelShares, useReady, useOf, isUnused, sharedWith, lastText, sortRows } from '../../public/logic/usage.js'
import { state } from '../../public/core/state.js'

const DAY = 86400000

function emptyCatalog() {
  return { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [] }
}

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

function usage(items, extra = {}) {
  return { all: { responses: 10 }, since: Date.now() - 60 * DAY, items, ...extra }
}

function base(extra = {}) {
  return {
    inventory: { plugins: [{ id: 'tools@market', name: 'tools' }] },
    catalog: emptyCatalog(),
    usage: usage({}),
    page: 'skills',
    usageSort: 'name',
    ...extra
  }
}

function skill(name, extra = {}) {
  return { kind: 'skill', name, enabled: true, mtime: Date.now() - 90 * DAY, ...extra }
}

test('modelShares returns an empty list when the cost is zero', () => {
  assert.deepEqual(modelShares({ cost: 0, models: [{ model: 'claude-opus-4-1', cost: 0 }] }), [])
})

test('modelShares keeps the top 3 models and groups the rest as Other', () => {
  const out = modelShares({
    cost: 100,
    models: [
      { model: 'claude-opus-4-1', cost: 50 },
      { model: 'claude-sonnet-4-5', cost: 30 },
      { model: 'claude-haiku-4-5', cost: 10 },
      { model: 'claude-opus-4', cost: 10 }
    ]
  })
  assert.deepEqual(
    out.map((m) => [m.name, m.cost, m.share, m.cls]),
    [
      ['Opus 4.1', 50, 50, 'm0'],
      ['Sonnet 4.5', 30, 30, 'm1'],
      ['Haiku 4.5', 10, 10, 'm2'],
      ['Other', 10, 10, 'm3']
    ]
  )
})

test('modelShares leaves out Other when the rest is below half a cent', () => {
  const out = modelShares({ cost: 10.004, models: [{ model: 'claude-opus-4-1', cost: 10 }] })
  assert.deepEqual(
    out.map((m) => m.name),
    ['Opus 4.1']
  )
})

test('useReady needs items and at least one response', () => {
  withState({ usage: null }, () => assert.equal(useReady(), false))
  withState({ usage: { items: {}, all: { responses: 0 } } }, () => assert.equal(useReady(), false))
  withState({ usage: { all: { responses: 3 } } }, () => assert.equal(useReady(), false))
  withState({ usage: { items: {}, all: { responses: 3 } } }, () => assert.equal(useReady(), true))
})

test('useOf returns null before usage is ready and for kinds without use counts', () => {
  withState(base({ usage: null }), () => assert.equal(useOf(skill('a')), null))
  withState(base(), () => assert.equal(useOf({ kind: 'plugin', name: 'x' }), null))
  withState(base(), () => assert.equal(useOf({ kind: 'hook', name: 'x' }), null))
})

test('useOf matches a local skill and agent by kind and name', () => {
  const now = Date.now()
  withState(
    base({ usage: usage({ 'skill:review': { count30: 4, last: now }, 'agent:review': { count30: 1, last: 1 } }) }),
    () => {
      assert.deepEqual(useOf(skill('review')), { count30: 4, last: now })
      assert.deepEqual(useOf({ kind: 'agent', name: 'review' }), { count30: 1, last: 1 })
      assert.deepEqual(useOf(skill('other')), { count30: 0, last: 0 })
    }
  )
})

test('useOf adds the plugin key and the bare key for a plugin skill with no local twin', () => {
  const item = skill('lint', { plugin: 'tools@market' })
  withState(
    base({
      catalog: { ...emptyCatalog(), skill: [item] },
      usage: usage({ 'skill:tools:lint': { count30: 2, last: 100 }, 'skill:lint': { count30: 3, last: 200 } })
    }),
    () => assert.deepEqual(useOf(item), { count30: 5, last: 200 })
  )
})

test('useOf drops the bare key for a plugin skill when a local skill has the name', () => {
  const plug = skill('lint', { plugin: 'tools@market' })
  const local = skill('lint')
  withState(
    base({
      catalog: { ...emptyCatalog(), skill: [plug, local] },
      usage: usage({ 'skill:tools:lint': { count30: 2, last: 100 }, 'skill:lint': { count30: 3, last: 200 } })
    }),
    () => {
      assert.deepEqual(useOf(plug), { count30: 2, last: 100 })
      assert.deepEqual(useOf(local), { count30: 3, last: 200 })
    }
  )
})

test('useOf uses the plugin id without the marketplace when the plugin is unknown', () => {
  const item = skill('lint', { plugin: 'ghost@market' })
  withState(
    base({
      catalog: { ...emptyCatalog(), skill: [item] },
      usage: usage({ 'skill:ghost:lint': { count30: 1, last: 5 } })
    }),
    () => assert.deepEqual(useOf(item), { count30: 1, last: 5 })
  )
})

test('useOf builds MCP keys and replaces characters outside A-Z, a-z, 0-9, _ and - with _', () => {
  withState(
    base({
      usage: usage({
        'mcp:my_server_v2': { count30: 7, last: 1 },
        'mcp:plugin:tools:git-hub': { count30: 2, last: 2 }
      })
    }),
    () => {
      assert.deepEqual(useOf({ kind: 'mcp', name: 'my.server v2' }), { count30: 7, last: 1 })
      assert.deepEqual(useOf({ kind: 'mcp', name: 'git-hub', plugin: 'tools@market' }), { count30: 2, last: 2 })
      assert.deepEqual(useOf({ kind: 'mcp', name: 'git-hub' }), { count30: 0, last: 0 })
    }
  )
})

test('isUnused is true for an on skill with no calls, 30 days of history, and an old file', () => {
  withState(base(), () => assert.equal(isUnused(skill('a')), true))
})

test('isUnused is false when the item has a call in 30 days', () => {
  withState(base({ usage: usage({ 'skill:a': { count30: 1, last: Date.now() } }) }), () =>
    assert.equal(isUnused(skill('a')), false)
  )
})

test('isUnused is false for an item that is off', () => {
  withState(base(), () => assert.equal(isUnused(skill('a', { enabled: false })), false))
})

test('isUnused is false for a skill with disable-model-invocation', () => {
  withState(base(), () => assert.equal(isUnused(skill('a', { disableModelInvocation: true })), false))
})

test('isUnused is false when usage history covers less than 30 days', () => {
  withState(base({ usage: usage({}, { since: Date.now() - 10 * DAY }) }), () =>
    assert.equal(isUnused(skill('a')), false)
  )
  withState(base({ usage: usage({}, { since: null }) }), () => assert.equal(isUnused(skill('a')), false))
})

test('isUnused is false when the file changed in the last 30 days', () => {
  withState(base(), () => assert.equal(isUnused(skill('a', { mtime: Date.now() - 5 * DAY })), false))
})

test('isUnused uses only the call count for an MCP server with no file time', () => {
  withState(base(), () => assert.equal(isUnused({ kind: 'mcp', name: 'srv', enabled: true }), true))
})

test('isUnused is false for kinds without use counts and before usage is ready', () => {
  withState(base(), () => assert.equal(isUnused({ kind: 'plugin', name: 'p', enabled: true }), false))
  withState(base({ usage: null }), () => assert.equal(isUnused(skill('a')), false))
})

test('sharedWith counts other items with the same use key', () => {
  const global = skill('a', { scope: 'global' })
  const project = skill('a', { scope: 'project' })
  const lone = skill('b')
  withState(base({ catalog: { ...emptyCatalog(), skill: [global, project, lone] } }), () => {
    assert.equal(sharedWith(global), 1)
    assert.equal(sharedWith(lone), 0)
  })
})

test('sharedWith counts 2 plugin skills that both take the bare key', () => {
  const p1 = skill('fmt', { plugin: 'tools@market' })
  const p2 = skill('fmt', { plugin: 'other@market' })
  withState(base({ catalog: { ...emptyCatalog(), skill: [p1, p2] } }), () => {
    assert.equal(sharedWith(p1), 1)
    assert.equal(sharedWith(p2), 1)
  })
})

test('lastText shows whole days after one day and relative time before', () => {
  const now = Date.now()
  assert.equal(lastText(now - 3 * DAY - 1000), '3 d ago')
  assert.equal(lastText(now - 45 * DAY), '45 d ago')
  assert.equal(lastText(now - 5 * 60_000), '5 min ago')
})

test('sortRows returns the list unchanged before usage is ready or on other pages', () => {
  const list = [skill('b'), skill('a')]
  withState(base({ usage: null }), () => assert.equal(sortRows(list), list))
  withState(base({ page: 'plugins' }), () => assert.equal(sortRows(list), list))
})

test('sortRows sorts by name without changing the input', () => {
  const list = [skill('c'), skill('a'), skill('b')]
  withState(base(), () => {
    assert.deepEqual(
      sortRows(list).map((i) => i.name),
      ['a', 'b', 'c']
    )
    assert.deepEqual(
      list.map((i) => i.name),
      ['c', 'a', 'b']
    )
  })
})

test('sortRows Most used orders by count, then last call, then name', () => {
  const list = [skill('d'), skill('c'), skill('b'), skill('a')]
  const u = usage({
    'skill:a': { count30: 1, last: 10 },
    'skill:b': { count30: 5, last: 10 },
    'skill:c': { count30: 1, last: 20 }
  })
  withState(base({ usage: u, usageSort: 'most' }), () =>
    assert.deepEqual(
      sortRows(list).map((i) => i.name),
      ['b', 'c', 'a', 'd']
    )
  )
  withState(base({ usage: u, usageSort: 'least' }), () =>
    assert.deepEqual(
      sortRows(list).map((i) => i.name),
      ['d', 'a', 'c', 'b']
    )
  )
})

test('sortRows puts items without use counts as zero', () => {
  const list = [{ kind: 'plugin', name: 'z' }, skill('a')]
  withState(base({ usage: usage({ 'skill:a': { count30: 2, last: 1 } }), usageSort: 'most' }), () =>
    assert.deepEqual(
      sortRows(list).map((i) => i.name),
      ['a', 'z']
    )
  )
})
