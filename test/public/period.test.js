import { test } from 'node:test'
import assert from 'node:assert/strict'
import { state } from '../../public/core/state.js'

globalThis.location ??= { search: '', href: 'http://localhost/', hash: '' }
const { periodHtml, periodLabel, refreshHtml, setPeriod } = await import('../../public/ui/period.js')

function withState(patch, fn) {
  const before = {}
  for (const k of Object.keys(patch)) before[k] = state[k]
  Object.assign(state, patch)
  try {
    return fn()
  } finally {
    Object.assign(state, before)
  }
}

test('periodHtml marks the chosen period as pressed', () => {
  withState({ usagePeriod: 'month' }, () => {
    const html = periodHtml()
    assert.ok(html.includes('role="group" aria-label="Usage period"'))
    assert.ok(html.includes('data-period="month" aria-pressed="true"'))
    assert.ok(html.includes('data-period="all" aria-pressed="false"'))
  })
  withState({ usagePeriod: 'all' }, () => {
    assert.ok(periodHtml().includes('data-period="all" aria-pressed="true"'))
  })
})

test('refreshHtml is disabled and busy while usage loads', () => {
  withState({ usageBusy: false }, () => {
    const html = refreshHtml()
    assert.ok(html.includes('data-urefresh>Refresh<'))
    assert.ok(!html.includes('disabled'))
  })
  withState({ usageBusy: true }, () => {
    const html = refreshHtml()
    assert.ok(html.includes('disabled aria-busy="true"'))
    assert.ok(html.includes('Refreshing…'))
  })
})

test('periodLabel names the month or All time', () => {
  withState({ usagePeriod: 'month', usage: { monthKey: '2026-10' } }, () => {
    assert.equal(periodLabel(), 'October 2026')
  })
  withState({ usagePeriod: 'all', usage: { monthKey: '2026-10' } }, () => {
    assert.equal(periodLabel(), 'All time')
  })
})

test('setPeriod changes the period and keeps it in localStorage', () => {
  const store = new Map()
  const realStorage = globalThis.localStorage
  globalThis.localStorage = { setItem: (k, v) => store.set(k, v) }
  try {
    withState({ usagePeriod: 'month', inventory: null }, () => {
      setPeriod('all')
      assert.equal(state.usagePeriod, 'all')
      assert.equal(store.get('storehouse.usagePeriod'), 'all')
    })
  } finally {
    globalThis.localStorage = realStorage
  }
})
