import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { loadStore, setFavorite, reorderFavorites } from '../../src/write/favorites.js'
import { toggle } from '../../src/write/toggles.js'
import { scanAll } from '../../src/scan/index.js'

const SP = 'superpowers@claude-plugins-official'

function withFixture(fn) {
  const fx = makeFixture()
  const ctx = { home: fx.home, projectDir: fx.projectDir }
  const storeFile = path.join(fx.home, '.claude', 'storehouse.json')
  try {
    fn({ fx, ctx, storeFile })
  } finally {
    fx.cleanup()
  }
}

test('loadStore creates the store file when missing', () => {
  withFixture(({ fx, storeFile }) => {
    assert.equal(fs.existsSync(storeFile), false)
    assert.deepEqual(loadStore(fx.home), { favorites: [], parkedHooks: [] })
    assert.equal(fs.existsSync(storeFile), true)
  })
})

test('setFavorite adds then removes', () => {
  withFixture(({ fx }) => {
    const added = setFavorite({ kind: 'skill', name: 'a', source: 'local', favorite: true }, fx.home)
    assert.deepEqual(added, [{ id: 'skill:local:a', kind: 'skill', name: 'a', source: 'local', order: 0 }])
    const again = setFavorite({ kind: 'skill', name: 'a', source: 'local', favorite: true }, fx.home)
    assert.equal(again.length, 1)
    const removed = setFavorite({ kind: 'skill', name: 'a', source: 'local', favorite: false }, fx.home)
    assert.deepEqual(removed, [])
  })
})

test('setFavorite refuses other kinds', () => {
  withFixture(({ fx }) => {
    assert.throws(() => setFavorite({ kind: 'hook', name: 'a', source: 'local', favorite: true }, fx.home))
    assert.throws(() => setFavorite({ kind: 'skill', name: '', source: 'local', favorite: true }, fx.home))
  })
})

test('setFavorite keeps parkedHooks and unknown keys, and parkedHooks writes keep favorites', () => {
  withFixture(({ fx, storeFile }) => {
    fs.writeFileSync(storeFile, JSON.stringify({ parkedHooks: [{ id: 'x' }], extra: 1 }))
    setFavorite({ kind: 'agent', name: 'b', source: 'local', favorite: true }, fx.home)
    const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
    assert.deepEqual(store.parkedHooks, [{ id: 'x' }])
    assert.equal(store.extra, 1)
    assert.equal(store.favorites.length, 1)
  })
})

test('setFavorite refuses an unparseable store', () => {
  withFixture(({ fx, storeFile }) => {
    fs.writeFileSync(storeFile, '{bad')
    assert.throws(() => setFavorite({ kind: 'skill', name: 'a', source: 'local', favorite: true }, fx.home))
    assert.equal(fs.readFileSync(storeFile, 'utf8'), '{bad')
  })
})

test('reorderFavorites sets order by position', () => {
  withFixture(({ fx }) => {
    for (const name of ['a', 'b', 'c']) setFavorite({ kind: 'skill', name, source: 'local', favorite: true }, fx.home)
    const list = reorderFavorites(['skill:local:c', 'skill:local:a', 'skill:local:b'], fx.home)
    assert.deepEqual(list.map((f) => [f.id, f.order]), [['skill:local:c', 0], ['skill:local:a', 1], ['skill:local:b', 2]])
  })
})

test('reorderFavorites keeps unlisted favorites after listed ones and ignores unknown ids', () => {
  withFixture(({ fx }) => {
    for (const name of ['a', 'b', 'c']) setFavorite({ kind: 'skill', name, source: 'local', favorite: true }, fx.home)
    const list = reorderFavorites(['skill:local:c', 'nope'], fx.home)
    assert.deepEqual(list.map((f) => f.id), ['skill:local:c', 'skill:local:a', 'skill:local:b'])
  })
})

test('scanAll marks favorite items and resolves favorites', () => {
  withFixture(({ fx, ctx }) => {
    const inv0 = scanAll(ctx)
    const skill = inv0.skills.find((s) => s.source === 'local')
    setFavorite({ kind: 'skill', name: skill.name, source: 'local', favorite: true }, fx.home)
    setFavorite({ kind: 'plugin', name: SP, source: 'plugin', favorite: true }, fx.home)
    const inv = scanAll(ctx)
    assert.equal(inv.skills.find((s) => s.name === skill.name && s.source === 'local').favorite, true)
    assert.equal(inv.plugins.find((p) => p.id === SP).favorite, true)
    assert.equal(inv.skills.filter((s) => s.favorite).length, 1)
    const fav = inv.favorites.find((f) => f.kind === 'skill')
    assert.equal(fav.exists, true)
    assert.equal(fav.enabled, true)
    assert.equal(typeof fav.description, 'string')
    assert.equal(inv.favorites.find((f) => f.kind === 'plugin').id, `plugin:plugin:${SP}`)
  })
})

test('favorite survives item toggle off and reports enabled false', () => {
  withFixture(({ fx, ctx }) => {
    const skill = scanAll(ctx).skills.find((s) => s.source === 'local' && s.scope === 'global')
    setFavorite({ kind: 'skill', name: skill.name, source: 'local', favorite: true }, fx.home)
    const r = toggle({ kind: 'skill', name: skill.name, scope: 'global', enabled: false }, ctx)
    assert.equal(r.ok, true, r.error)
    const fav = scanAll(ctx).favorites[0]
    assert.equal(fav.exists, true)
    assert.equal(fav.enabled, false)
  })
})

test('favorite of a missing item reports exists false', () => {
  withFixture(({ fx, ctx }) => {
    setFavorite({ kind: 'skill', name: 'ghost', source: 'local', favorite: true }, fx.home)
    const fav = scanAll(ctx).favorites[0]
    assert.equal(fav.exists, false)
    assert.equal(fav.enabled, false)
  })
})

test('a parked-hook toggle keeps favorites in storehouse.json', () => {
  withFixture(({ fx, ctx, storeFile }) => {
    setFavorite({ kind: 'skill', name: 'a', source: 'local', favorite: true }, fx.home)
    const off = toggle(
      { kind: 'hook', name: 'echo guard-rm', scope: 'project', file: 'project', event: 'PreToolUse', index: { event: 'PreToolUse', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assert.equal(off.ok, true, off.error)
    const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
    assert.equal(store.parkedHooks.length, 1)
    assert.deepEqual(store.favorites.map((f) => f.id), ['skill:local:a'])
  })
})
