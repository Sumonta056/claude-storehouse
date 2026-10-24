import { test } from 'node:test'
import assert from 'node:assert/strict'

let fresh = 0

async function loadState(storage) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  try {
    fresh += 1
    return (await import(`../../public/core/state.js?fresh=${fresh}`)).state
  } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before)
    else delete globalThis.localStorage
  }
}

function storage(values) {
  return { getItem: (key) => values[key] ?? null }
}

test('state starts on the dashboard with all scopes and an empty catalog', async () => {
  const state = await loadState(storage({}))
  assert.equal(state.page, 'dash')
  assert.equal(state.scope, 'all')
  assert.equal(state.query, '')
  assert.equal(state.inventory, null)
  assert.deepEqual(state.catalog, { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [] })
})

test('state reads the usage period and sort that the browser saved', async () => {
  const state = await loadState(storage({ 'storehouse.usagePeriod': 'all', 'storehouse.usageSort': 'most' }))
  assert.equal(state.usagePeriod, 'all')
  assert.equal(state.usageSort, 'most')
})

test('state falls back to this month and name sort for unknown saved values', async () => {
  const state = await loadState(storage({ 'storehouse.usagePeriod': 'year', 'storehouse.usageSort': 'size' }))
  assert.equal(state.usagePeriod, 'month')
  assert.equal(state.usageSort, 'name')
})

test('state uses the defaults when the browser blocks storage', async () => {
  const blocked = {
    getItem() {
      throw new Error('SecurityError')
    }
  }
  const state = await loadState(blocked)
  assert.equal(state.usagePeriod, 'month')
  assert.equal(state.usageSort, 'name')
})
