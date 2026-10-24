import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHIPS, keepChip, chipCounts } from '../../public/logic/chips.js'
import { chipFilter, state } from '../../public/core/state.js'

const DAY = 86400000

function withChip(page, value, fn) {
  const before = chipFilter[page]
  chipFilter[page] = value
  try {
    return fn()
  } finally {
    chipFilter[page] = before
  }
}

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

function usage(items = {}) {
  return { items, all: { responses: 5 }, since: Date.now() - 40 * DAY }
}

function catalog(over = {}) {
  return { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [], ...over }
}

const old = Date.now() - 60 * DAY

test('every chip list starts with All', () => {
  for (const [page, list] of Object.entries(CHIPS)) assert.deepEqual(list[0], ['all', 'All'], page)
})

test('every page with chips has a default filter of all', () => {
  for (const page of Object.keys(CHIPS)) assert.equal(chipFilter[page], 'all', page)
})

test('keepChip keeps every item under All', () => {
  assert.equal(keepChip('skills', { scope: 'plugin', enabled: false }), true)
})

test('keepChip on skills splits on and off and leaves plugin skills out of both', () => {
  const on = { kind: 'skill', scope: 'global', enabled: true }
  const off = { kind: 'skill', scope: 'project', enabled: false }
  const viaPlugin = { kind: 'skill', scope: 'plugin', enabled: true }
  withChip('skills', 'on', () => {
    assert.equal(keepChip('skills', on), true)
    assert.equal(keepChip('skills', off), false)
    assert.equal(keepChip('skills', viaPlugin), false)
  })
  withChip('skills', 'off', () => {
    assert.equal(keepChip('skills', off), true)
    assert.equal(keepChip('skills', on), false)
    assert.equal(keepChip('skills', viaPlugin), false)
  })
  withChip('skills', 'plugin', () => {
    assert.equal(keepChip('skills', viaPlugin), true)
    assert.equal(keepChip('skills', on), false)
  })
})

test('keepChip on MCP uses canToggle, so a switchable plugin MCP counts as on', () => {
  withChip('mcp', 'on', () => {
    assert.equal(keepChip('mcp', { kind: 'mcp', scope: 'plugin', canToggle: true, enabled: true }), true)
    assert.equal(keepChip('mcp', { kind: 'mcp', scope: 'global', canToggle: false, enabled: true }), false)
  })
})

test('keepChip on plugins keeps broken plugins only under Broken', () => {
  const broken = { kind: 'plugin', missing: true, enabled: true }
  const on = { kind: 'plugin', enabled: true }
  const off = { kind: 'plugin', enabled: false }
  withChip('plugins', 'broken', () => {
    assert.equal(keepChip('plugins', broken), true)
    assert.equal(keepChip('plugins', on), false)
  })
  withChip('plugins', 'on', () => {
    assert.equal(keepChip('plugins', on), true)
    assert.equal(keepChip('plugins', broken), false)
    assert.equal(keepChip('plugins', off), false)
  })
  withChip('plugins', 'off', () => assert.equal(keepChip('plugins', off), true))
})

test('keepChip on mods keeps dev mods only under Dev', () => {
  const dev = { kind: 'plugin', dev: true, enabled: true }
  const on = { kind: 'plugin', enabled: true }
  withChip('mods', 'dev', () => {
    assert.equal(keepChip('mods', dev), true)
    assert.equal(keepChip('mods', on), false)
  })
  withChip('mods', 'on', () => {
    assert.equal(keepChip('mods', on), true)
    assert.equal(keepChip('mods', dev), false)
  })
})

test('keepChip Unused keeps an old skill that is on and has no call in 30 days', () => {
  const idle = { kind: 'skill', name: 'idle', scope: 'global', enabled: true, mtime: old }
  const busy = { kind: 'skill', name: 'busy', scope: 'global', enabled: true, mtime: old }
  const cat = catalog({ skill: [idle, busy] })
  const u = usage({ 'skill:busy': { count30: 3, last: Date.now() - DAY } })
  withState({ usage: u, catalog: cat }, () =>
    withChip('skills', 'unused', () => {
      assert.equal(keepChip('skills', idle), true)
      assert.equal(keepChip('skills', busy), false)
      assert.equal(keepChip('skills', { ...idle, enabled: false }), false)
      assert.equal(keepChip('skills', { ...idle, mtime: Date.now() }), false)
      assert.equal(keepChip('skills', { ...idle, disableModelInvocation: true }), false)
    })
  )
})

test('keepChip Unused keeps nothing when usage history is shorter than 30 days', () => {
  const idle = { kind: 'skill', name: 'idle', scope: 'global', enabled: true, mtime: old }
  const u = { ...usage(), since: Date.now() - 5 * DAY }
  withState({ usage: u, catalog: catalog({ skill: [idle] }) }, () =>
    withChip('skills', 'unused', () => assert.equal(keepChip('skills', idle), false))
  )
})

test('chipCounts on Duplicates counts groups and groups that need action', () => {
  const groups = [{ items: [{ enabled: true }, { enabled: true }] }, { items: [{ enabled: true }, { enabled: false }] }]
  assert.deepEqual(chipCounts('dups', groups), { all: 2, needs: 1 })
  assert.deepEqual(chipCounts('dups', []), { all: 0, needs: 0 })
})

test('chipCounts on Doctor counts issues per severity', () => {
  const issues = [{ severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }, { severity: 'info' }]
  assert.deepEqual(chipCounts('doctor', issues), { all: 4, error: 1, warning: 2, info: 1 })
})

test('chipCounts on Context puts items that are off only under Off', () => {
  const list = [
    { type: 'claudemd', enabled: true },
    { type: 'skills', item: {}, enabled: true },
    { type: 'skills', item: {}, enabled: false },
    { type: 'mcp', item: {}, enabled: true }
  ]
  assert.deepEqual(chipCounts('context', list), {
    all: 3,
    claudemd: 1,
    rules: 0,
    skills: 1,
    agents: 0,
    mcp: 1,
    off: 1
  })
})

test('chipCounts on Plugins splits on, off, and broken among visible plugins', () => {
  const list = [
    { kind: 'plugin', scope: 'global', name: 'a', enabled: true },
    { kind: 'plugin', scope: 'global', name: 'b', enabled: false },
    { kind: 'plugin', scope: 'global', name: 'c', enabled: true, missing: true },
    { kind: 'plugin', scope: 'project', name: 'd', enabled: true }
  ]
  withState({ scope: 'all', query: '' }, () =>
    assert.deepEqual(chipCounts('plugins', list), { all: 4, on: 2, off: 1, broken: 1 })
  )
  withState({ scope: 'global', query: '' }, () =>
    assert.deepEqual(chipCounts('plugins', list), { all: 3, on: 1, off: 1, broken: 1 })
  )
})

test('chipCounts on Mods splits dev mods from installed mods', () => {
  const list = [
    { kind: 'plugin', scope: 'global', name: 'a', enabled: true },
    { kind: 'plugin', scope: 'global', name: 'b', enabled: false },
    { kind: 'plugin', scope: 'dev', name: 'c', dev: true, enabled: true }
  ]
  withState({ scope: 'all', query: '' }, () =>
    assert.deepEqual(chipCounts('mods', list), { all: 3, on: 1, off: 1, dev: 1 })
  )
  withState({ scope: 'project', query: '' }, () =>
    assert.deepEqual(chipCounts('mods', list), { all: 0, on: 0, off: 0, dev: 0 })
  )
})

test('chipCounts on Skills counts plugin skills under From plugins but not under On or Off', () => {
  const list = [
    { kind: 'skill', scope: 'global', name: 'a', enabled: true, mtime: old },
    { kind: 'skill', scope: 'project', name: 'b', enabled: false, mtime: old },
    { kind: 'skill', scope: 'plugin', name: 'c', plugin: 'kit@m', enabled: true, mtime: old }
  ]
  withState({ scope: 'all', query: '', usage: null, catalog: catalog({ skill: list }) }, () =>
    assert.deepEqual(chipCounts('skills', list), { all: 3, on: 1, off: 1, plugin: 1, unused: 0 })
  )
})

test('chipCounts on Skills follows the search box', () => {
  const list = [
    { kind: 'skill', scope: 'global', name: 'alpha', enabled: true },
    { kind: 'skill', scope: 'global', name: 'beta', enabled: false }
  ]
  withState({ scope: 'all', query: 'alp', usage: null }, () =>
    assert.deepEqual(chipCounts('skills', list), { all: 1, on: 1, off: 0, plugin: 0, unused: 0 })
  )
})

test('chipCounts counts unused skills when usage covers 30 days', () => {
  const list = [
    { kind: 'skill', scope: 'global', name: 'idle', enabled: true, mtime: old },
    { kind: 'skill', scope: 'global', name: 'busy', enabled: true, mtime: old }
  ]
  const u = usage({ 'skill:busy': { count30: 1, last: Date.now() } })
  withState({ scope: 'all', query: '', usage: u, catalog: catalog({ skill: list }) }, () =>
    assert.equal(chipCounts('skills', list).unused, 1)
  )
})

test('chipCounts on MCP counts on and off by canToggle', () => {
  const list = [
    { kind: 'mcp', scope: 'global', name: 'a', canToggle: true, enabled: true },
    { kind: 'mcp', scope: 'global', name: 'b', canToggle: false, enabled: false },
    { kind: 'mcp', scope: 'plugin', name: 'c', canToggle: true, enabled: false }
  ]
  withState({ scope: 'all', query: '', usage: null }, () =>
    assert.deepEqual(chipCounts('mcp', list), { all: 3, on: 1, off: 1, plugin: 1, unused: 0 })
  )
})
