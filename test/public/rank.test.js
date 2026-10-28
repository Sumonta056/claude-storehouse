import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIERS, rankOf } from '../../public/logic/rank.js'

test('has 8 tiers with rising minimums that start at zero', () => {
  assert.equal(TIERS.length, 8)
  assert.equal(TIERS[0].min, 0)
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].min > TIERS[i - 1].min)
})

test('puts a cost on each side of a boundary in the right tier', () => {
  assert.equal(rankOf(24.99).tier.name, 'Bronze')
  assert.equal(rankOf(25).tier.name, 'Silver')
  assert.equal(rankOf(2999.99).tier.name, 'Elite')
  assert.equal(rankOf(3000).tier.name, 'Epic')
})

test('gives the amount and share of the way to the next tier', () => {
  const r = rankOf(742.18)
  assert.equal(r.tier.name, 'Diamond')
  assert.equal(r.index, 4)
  assert.equal(r.next.name, 'Elite')
  assert.ok(Math.abs(r.toNext - 457.82) < 1e-9)
  assert.ok(Math.abs(r.pct - (242.18 / 700) * 100) < 1e-9)
})

test('treats zero, negative, and missing cost as Bronze at the start', () => {
  for (const cost of [0, -5, NaN, undefined]) {
    const r = rankOf(cost)
    assert.equal(r.tier.name, 'Bronze')
    assert.equal(r.toNext, 25)
    assert.equal(r.pct, 0)
  }
})

test('has no next tier at Legend', () => {
  const r = rankOf(20000)
  assert.equal(r.tier.name, 'Legend')
  assert.equal(r.next, null)
  assert.equal(r.toNext, 0)
  assert.equal(r.pct, 100)
})
