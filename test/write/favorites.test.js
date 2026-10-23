import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { loadStore, setFavorite, reorderFavorites, editCategory } from '../../src/write/favorites.js'
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
    assert.deepEqual(added, [{ id: 'skill:local:a', kind: 'skill', name: 'a', source: 'local', order: 0, category: null }])
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

function backupsOf(home) {
  const dir = path.join(home, '.claude', 'backups', 'storehouse')
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.startsWith('storehouse.json.')) : []
}

const star = (home, name, extra = {}) => setFavorite({ kind: 'skill', name, source: 'local', favorite: true, ...extra }, home)

test('setFavorite with a new category creates it and files the favorite under it', () => {
  withFixture(({ fx, storeFile }) => {
    fs.writeFileSync(storeFile, JSON.stringify({ favorites: [], extra: 1 }))
    const list = star(fx.home, 'a', { category: ' Review ' })
    assert.equal(list[0].category, 'Review')
    const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
    assert.deepEqual(store.favoriteCategories, ['Review'])
    assert.equal(store.favorites[0].category, 'Review')
    assert.equal(store.extra, 1)
    assert.ok(backupsOf(fx.home).length > 0)
  })
})

test('setFavorite on an existing favorite moves it, and without category keeps it', () => {
  withFixture(({ fx }) => {
    editCategory({ op: 'create', name: 'QA' }, fx.home)
    star(fx.home, 'a', { category: 'qa' })
    assert.equal(star(fx.home, 'a')[0].category, 'QA')
    const moved = star(fx.home, 'a', { category: null })
    assert.equal(moved.length, 1)
    assert.equal(moved[0].category, null)
  })
})

test('setFavorite refuses a bad category name', () => {
  withFixture(({ fx }) => {
    assert.throws(() => star(fx.home, 'a', { category: 'Uncategorized' }), /reserved/)
    assert.throws(() => star(fx.home, 'a', { category: '   ' }), /required/)
    assert.throws(() => star(fx.home, 'a', { category: 'x'.repeat(41) }), /40/)
    assert.throws(() => star(fx.home, 'a', { category: 5 }), /string or null/)
    assert.deepEqual(readFavoritesSafe(fx.home), [])
  })
})

function readFavoritesSafe(home) {
  const file = path.join(home, '.claude', 'storehouse.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).favorites ?? [] : []
}

test('editCategory create refuses duplicates without case', () => {
  withFixture(({ fx }) => {
    const r = editCategory({ op: 'create', name: 'Review' }, fx.home)
    assert.deepEqual(r.categories, ['Review'])
    assert.throws(() => editCategory({ op: 'create', name: 'review' }, fx.home), /already exists/)
    assert.throws(() => editCategory({ op: 'drop', name: 'Review' }, fx.home), /op must be/)
  })
})

test('editCategory rename updates its favorites and keeps others', () => {
  withFixture(({ fx }) => {
    star(fx.home, 'a', { category: 'Review' })
    star(fx.home, 'b', { category: 'QA' })
    star(fx.home, 'c')
    const r = editCategory({ op: 'rename', name: 'Review', newName: 'Code review' }, fx.home)
    assert.deepEqual(r.categories, ['Code review', 'QA'])
    assert.deepEqual(r.favorites.map((f) => [f.name, f.category]), [['a', 'Code review'], ['b', 'QA'], ['c', null]])
    assert.throws(() => editCategory({ op: 'rename', name: 'QA', newName: 'code REVIEW' }, fx.home), /already exists/)
    assert.equal(editCategory({ op: 'rename', name: 'QA', newName: 'qa' }, fx.home).categories[1], 'qa')
    assert.throws(() => editCategory({ op: 'rename', name: 'Nope', newName: 'X' }, fx.home), /does not exist/)
  })
})

test('editCategory delete moves its favorites to Uncategorized', () => {
  withFixture(({ fx, storeFile }) => {
    star(fx.home, 'a', { category: 'Review' })
    star(fx.home, 'b', { category: 'QA' })
    const r = editCategory({ op: 'delete', name: 'Review' }, fx.home)
    assert.deepEqual(r.categories, ['QA'])
    assert.deepEqual(r.favorites.map((f) => [f.name, f.category]), [['a', null], ['b', 'QA']])
    const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
    assert.equal(Object.hasOwn(store.favorites[0], 'category'), false)
  })
})

test('reorderFavorites with a move changes one category in the same write', () => {
  withFixture(({ fx }) => {
    star(fx.home, 'a', { category: 'Review' })
    star(fx.home, 'b', { category: 'QA' })
    const list = reorderFavorites(['skill:local:b', 'skill:local:a'], fx.home, { id: 'skill:local:a', category: 'QA' })
    assert.deepEqual(list.map((f) => [f.name, f.category, f.order]), [['b', 'QA', 0], ['a', 'QA', 1]])
    assert.throws(() => reorderFavorites([], fx.home, { id: 'skill:local:a', category: 'Nope' }), /does not exist/)
    assert.throws(() => reorderFavorites([], fx.home, 'x'), /move must be/)
  })
})

test('an old store without categories reads every favorite as Uncategorized', () => {
  withFixture(({ fx, storeFile }) => {
    fs.writeFileSync(storeFile, JSON.stringify({ favorites: [{ kind: 'skill', name: 'a', source: 'local', category: 'Ghost' }] }))
    const list = scanAll({ home: fx.home, projectDir: fx.projectDir })
    assert.equal(list.favorites[0].category, null)
    assert.deepEqual(list.favoriteCategories, [])
  })
})

test('category writes keep parkedHooks and unknown keys, and refuse an unparseable store', () => {
  withFixture(({ fx, storeFile }) => {
    fs.writeFileSync(storeFile, JSON.stringify({ parkedHooks: [{ id: 'x' }], extra: 1 }))
    star(fx.home, 'a', { category: 'Review' })
    editCategory({ op: 'rename', name: 'review', newName: 'Code review' }, fx.home)
    reorderFavorites(['skill:local:a'], fx.home, { id: 'skill:local:a', category: null })
    const r = editCategory({ op: 'delete', name: 'Code review' }, fx.home)
    assert.ok(r.backup && fs.existsSync(r.backup))
    const store = JSON.parse(fs.readFileSync(storeFile, 'utf8'))
    assert.deepEqual(store.parkedHooks, [{ id: 'x' }])
    assert.equal(store.extra, 1)
    fs.writeFileSync(storeFile, '{bad')
    assert.throws(() => editCategory({ op: 'create', name: 'QA' }, fx.home))
    assert.throws(() => reorderFavorites([], fx.home, { id: 'skill:local:a', category: null }))
    assert.equal(fs.readFileSync(storeFile, 'utf8'), '{bad')
  })
})

test('reorderFavorites refuses a move without category or with an unknown id', () => {
  withFixture(({ fx }) => {
    star(fx.home, 'a', { category: 'QA' })
    assert.throws(() => reorderFavorites([], fx.home, { id: 'skill:local:a' }), /move must be/)
    assert.throws(() => reorderFavorites([], fx.home, { id: 'skill:local:typo', category: 'QA' }), /does not exist/)
    assert.equal(readFavoritesSafe(fx.home)[0].category, 'QA')
  })
})

test('hand-edited category names are trimmed, and reserved or duplicate names are dropped', () => {
  withFixture(({ fx, storeFile }) => {
    fs.writeFileSync(storeFile, JSON.stringify({ favoriteCategories: [' B ', 'Uncategorized', 'b', 3], favorites: [{ kind: 'skill', name: 'a', source: 'local', category: ' B ' }] }))
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(inv.favoriteCategories, ['B'])
    assert.equal(inv.favorites[0].category, 'B')
    const r = editCategory({ op: 'rename', name: 'B', newName: 'C' }, fx.home)
    assert.deepEqual(r.favorites.map((f) => f.category), ['C'])
  })
})

test('a write that never used categories does not add favoriteCategories', () => {
  withFixture(({ fx, storeFile }) => {
    star(fx.home, 'a')
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(storeFile, 'utf8')), 'favoriteCategories'), false)
  })
})
