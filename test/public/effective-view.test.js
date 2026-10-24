import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SCOPE_KEY, SCOPE_TAG, EFF_GROUPS, effRows, effRow } from '../../public/logic/effective.js'
import { state } from '../../public/core/state.js'

function withInventory(inventory, fn) {
  const saved = state.inventory
  state.inventory = inventory
  try {
    return fn()
  } finally {
    state.inventory = saved
  }
}

test('SCOPE_KEY and SCOPE_TAG cover the 3 settings files', () => {
  assert.deepEqual(Object.keys(SCOPE_KEY), ['global', 'project', 'projectLocal'])
  assert.deepEqual(Object.keys(SCOPE_TAG), ['global', 'project', 'projectLocal'])
  assert.deepEqual(SCOPE_TAG.projectLocal, ['local', 'local'])
})

test('EFF_GROUPS lists model, rules, env, plugins, and other in order', () => {
  assert.deepEqual(
    EFF_GROUPS.map(([k]) => k),
    ['model', 'rules', 'env', 'plugins', 'other']
  )
})

test('effRows returns the effective rows of the inventory', () => {
  const rows = [{ key: 'model' }, { key: 'theme' }]
  withInventory({ settings: { effective: { rows, skipped: [], invalid: [] } } }, () => assert.equal(effRows(), rows))
})

test('effRows returns an empty list when settings or effective are missing', () => {
  withInventory({}, () => assert.deepEqual(effRows(), []))
  withInventory({ settings: {} }, () => assert.deepEqual(effRows(), []))
  withInventory({ settings: { effective: {} } }, () => assert.deepEqual(effRows(), []))
})

test('effRow finds a row by key and returns undefined for an unknown key', () => {
  const rows = [
    { key: 'model', value: 'opus' },
    { key: 'permissions.defaultMode', value: 'plan' }
  ]
  withInventory({ settings: { effective: { rows } } }, () => {
    assert.equal(effRow('permissions.defaultMode').value, 'plan')
    assert.equal(effRow('theme'), undefined)
  })
  withInventory({}, () => assert.equal(effRow('model'), undefined))
})
