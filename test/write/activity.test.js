import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { Activity } from '../../src/write/activity.js'
import { toggle } from '../../src/write/toggles.js'
import { writeText } from '../../src/write/files.js'
import { restoreBackup, listBackups } from '../../src/write/json-file.js'
import { setFavorite, loadStore } from '../../src/write/favorites.js'
import { scanAll } from '../../src/scan/index.js'

const SP = 'superpowers@claude-plugins-official'

function withFixture(fn) {
  const fx = makeFixture()
  const ctx = { home: fx.home, projectDir: fx.projectDir }
  try {
    fn({ fx, ctx })
  } finally {
    fx.cleanup()
  }
}

function recordToggle(activity, req, ctx) {
  const r = toggle(req, ctx)
  assert.equal(r.ok, true, r.error)
  return activity.record({ file: r.file, message: `${req.name} ${req.enabled}`, kind: 'toggle', undo: r.undo })
}

test('record returns entry without undo payload and list is newest first', () => {
  const activity = new Activity()
  const a = activity.record({ file: '/x', message: 'one', kind: 'toggle', undo: { kind: 'plugin' } })
  const b = activity.record({ file: '/y', message: 'two', kind: 'toggle', undo: null })
  assert.equal(a.canUndo, true)
  assert.equal(b.canUndo, false)
  assert.equal('undo' in a, false)
  const list = activity.list()
  assert.deepEqual(list.map((e) => e.message), ['two', 'one'])
  assert.deepEqual(Object.keys(list[0]).sort(), ['canUndo', 'file', 'id', 'kind', 'message', 'time'])
  assert.notEqual(a.id, b.id)
  assert.equal(typeof a.id, 'string')
})

test('undo of first toggle does not revert second toggle on same file', () => {
  withFixture(({ ctx }) => {
    const activity = new Activity()
    const first = recordToggle(activity, { kind: 'plugin', name: SP, scope: 'global', enabled: false }, ctx)
    const skill = scanAll(ctx).skills.find((s) => s.source === 'local' && s.scope === 'global')
    recordToggle(activity, { kind: 'skill', name: skill.name, scope: 'global', enabled: false }, ctx)
    const result = activity.undo(first.id, ctx)
    assert.equal(result.ok, true, result.error)
    const inv = scanAll(ctx)
    assert.equal(inv.plugins.find((p) => p.id === SP).enabled, true)
    assert.equal(inv.skills.find((s) => s.name === skill.name && s.source === 'local').enabled, false)
    const list = activity.list()
    assert.equal(list.find((e) => e.id === first.id).canUndo, false)
    assert.equal(list[0].canUndo, false)
    assert.equal(list.length, 3)
    assert.equal(activity.undo(first.id, ctx).ok, false)
  })
})

test('undo of a favorite flips it back', () => {
  withFixture(({ ctx }) => {
    const activity = new Activity()
    const req = { kind: 'skill', name: 'a', source: 'local', favorite: true }
    setFavorite(req, ctx.home)
    const entry = activity.record({ file: 'f', message: 'fav', kind: 'favorite', undo: req })
    assert.equal(activity.undo(entry.id, ctx).ok, true)
    assert.deepEqual(loadStore(ctx.home).favorites, [])
  })
})

test('undo of an older file save is refused, latest save restores', () => {
  withFixture(({ ctx }) => {
    const activity = new Activity()
    const file = path.join(ctx.home, '.claude', 'CLAUDE.md')
    const original = fs.readFileSync(file, 'utf8')
    const saves = ['one\n', 'two\n'].map((content) => {
      const r = writeText(file, content, ctx)
      assert.equal(r.ok, true, r.error)
      return activity.record({ file, message: 'save', kind: 'save', backup: r.backup })
    })
    const [older, latest] = saves
    assert.equal(older.canUndo, true)
    const list = activity.list()
    assert.equal(list.find((e) => e.id === older.id).canUndo, false)
    assert.equal(list.find((e) => e.id === latest.id).canUndo, true)
    const refused = activity.undo(older.id, ctx)
    assert.equal(refused.ok, false)
    assert.equal(fs.readFileSync(file, 'utf8'), 'two\n')
    const done = activity.undo(latest.id, ctx)
    assert.equal(done.ok, true, done.error)
    assert.equal(fs.readFileSync(file, 'utf8'), 'one\n')
    assert.equal(activity.list().find((e) => e.id === older.id).canUndo, true)
    assert.equal(activity.undo(older.id, ctx).ok, true)
    assert.equal(fs.readFileSync(file, 'utf8'), original)
  })
})

test('unknown id and save without backup cannot be undone', () => {
  const activity = new Activity()
  assert.equal(activity.undo('999', { home: '/h' }).ok, false)
  const e = activity.record({ file: '/x', message: 'new file', kind: 'save', backup: null })
  assert.equal(e.canUndo, false)
})

test('restoreBackup backs up current target then restores bytes', () => {
  withFixture(({ ctx }) => {
    const file = path.join(ctx.home, '.claude', 'CLAUDE.md')
    const before = fs.readFileSync(file, 'utf8')
    const r = writeText(file, 'changed\n', ctx)
    const restored = restoreBackup(r.backup, file, ctx.home)
    assert.equal(restored.ok, true, restored.error)
    assert.equal(fs.readFileSync(file, 'utf8'), before)
    assert.equal(fs.readFileSync(restored.backup, 'utf8'), 'changed\n')
    assert.ok(listBackups(file, ctx.home).includes(restored.backup))
  })
})

test('restoreBackup refuses a target outside the allow-list', () => {
  withFixture(({ fx, ctx }) => {
    const file = path.join(ctx.home, '.claude', 'CLAUDE.md')
    const r = writeText(file, 'changed\n', ctx)
    const target = path.join(fx.home, 'CLAUDE.md')
    const copy = path.join(path.dirname(r.backup), 'CLAUDE.md.2026-01-01')
    fs.copyFileSync(r.backup, copy)
    fs.writeFileSync(target, 'keep')
    const result = restoreBackup(copy, target, ctx.home)
    assert.equal(result.ok, false)
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep')
  })
})

test('restoreBackup refuses a backup outside the backup folder or with wrong name', () => {
  withFixture(({ ctx }) => {
    const file = path.join(ctx.home, '.claude', 'CLAUDE.md')
    const outside = path.join(ctx.home, 'evil.txt')
    fs.writeFileSync(outside, 'x')
    assert.equal(restoreBackup(outside, file, ctx.home).ok, false)
    const r = writeText(file, 'changed\n', ctx)
    const other = path.join(ctx.home, '.claude', 'settings.json')
    assert.equal(restoreBackup(r.backup, other, ctx.home).ok, false)
    assert.equal(restoreBackup(path.join(path.dirname(r.backup), '..', 'storehouse', path.basename(r.backup)), file, ctx.home).ok, true)
    assert.equal(restoreBackup(path.join(path.dirname(r.backup), 'nope'), file, ctx.home).ok, false)
  })
})

test('record rejects an unknown kind', () => {
  const activity = new Activity()
  assert.throws(() => activity.record({ file: '/x', message: 'm', kind: 'hook', undo: null }))
  assert.throws(() => activity.record({ file: '/x', message: 'm', undo: null }))
})

test('undo of a save is refused after a later toggle changed the same file', () => {
  withFixture(({ ctx }) => {
    const activity = new Activity()
    const file = path.join(ctx.home, '.claude', 'settings.json')
    const r = writeText(file, fs.readFileSync(file, 'utf8'), ctx)
    const entry = activity.record({ file, message: 'save', kind: 'save', backup: r.backup })
    assert.equal(entry.canUndo, true)
    const t = toggle({ kind: 'plugin', name: SP, scope: 'global', enabled: false }, ctx)
    assert.equal(t.ok, true, t.error)
    assert.equal(t.file, file)
    assert.equal(activity.list().find((e) => e.id === entry.id).canUndo, false)
    const result = activity.undo(entry.id, ctx)
    assert.equal(result.ok, false)
    assert.match(result.error, /changed/)
    assert.equal(scanAll(ctx).plugins.find((p) => p.id === SP).enabled, false)
  })
})
