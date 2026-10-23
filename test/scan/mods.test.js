import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanDevMods } from '../../src/scan/mods.js'

test('lists dev mods that have a plugin manifest', () => {
  const fx = makeFixture()
  try {
    const mods = scanDevMods({ home: fx.home })
    assert.equal(mods.length, 1)
    const [mod] = mods
    assert.equal(mod.id, 'abc-session/band-mod')
    assert.equal(mod.name, 'band-mod')
    assert.equal(mod.session, 'abc-session')
    assert.equal(mod.version, '0.1.0')
    assert.equal(mod.description, 'A band mod')
    assert.deepEqual(mod.modules, ['./register.tsx'])
    assert.equal(mod.path, path.join(fx.home, '.claude', 'dev-mods', 'abc-session', 'band-mod'))
  } finally {
    fx.cleanup()
  }
})

test('returns an empty list when dev-mods is absent', () => {
  const fx = makeFixture()
  try {
    fs.rmSync(path.join(fx.home, '.claude', 'dev-mods'), { recursive: true })
    assert.deepEqual(scanDevMods({ home: fx.home }), [])
  } finally {
    fx.cleanup()
  }
})

test('lists a symlinked dev mod whose real path is under home', () => {
  const fx = makeFixture()
  try {
    const real = path.join(fx.home, 'code', 'linked-mod')
    fs.cpSync(path.join(fx.home, '.claude', 'dev-mods', 'abc-session', 'band-mod'), real, { recursive: true })
    fs.symlinkSync(real, path.join(fx.home, '.claude', 'dev-mods', 'abc-session', 'linked-mod'))
    const ids = scanDevMods({ home: fx.home }).map((m) => m.id)
    assert.deepEqual(ids, ['abc-session/band-mod', 'abc-session/linked-mod'])
  } finally {
    fx.cleanup()
  }
})

test('skips a symlinked dev mod whose real path is outside home', () => {
  const fx = makeFixture()
  const outside = fs.mkdtempSync(path.join(path.dirname(fx.home), 'outside-'))
  try {
    fs.cpSync(path.join(fx.home, '.claude', 'dev-mods', 'abc-session', 'band-mod'), outside, { recursive: true })
    fs.symlinkSync(outside, path.join(fx.home, '.claude', 'dev-mods', 'abc-session', 'far-mod'))
    const ids = scanDevMods({ home: fx.home }).map((m) => m.id)
    assert.deepEqual(ids, ['abc-session/band-mod'])
  } finally {
    fx.cleanup()
  }
})

test('skips dot folders and keeps a dev mod with a broken manifest', () => {
  const fx = makeFixture()
  try {
    const base = path.join(fx.home, '.claude', 'dev-mods')
    fs.mkdirSync(path.join(base, '.hidden', 'x', '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(base, '.hidden', 'x', '.claude-plugin', 'plugin.json'), '{}')
    fs.mkdirSync(path.join(base, 'abc-session', 'broken', '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(base, 'abc-session', 'broken', '.claude-plugin', 'plugin.json'), '{ "name": ')
    const mods = scanDevMods({ home: fx.home })
    assert.deepEqual(
      mods.map((m) => m.id),
      ['abc-session/band-mod', 'abc-session/broken']
    )
    const broken = mods.find((m) => m.id === 'abc-session/broken')
    assert.equal(broken.name, 'broken')
    assert.deepEqual(broken.modules, [])
  } finally {
    fx.cleanup()
  }
})
