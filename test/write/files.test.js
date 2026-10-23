import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { readText, writeText, deleteToTrash } from '../../src/write/files.js'
import { listBackups } from '../../src/write/json-file.js'

function withFixture(fn) {
  const fx = makeFixture()
  try {
    fn(fx, { home: fx.home, projectDir: fx.projectDir })
  } finally {
    fx.cleanup()
  }
}

test('readText returns content of an allowed file', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.projectDir, 'CLAUDE.md')
    fs.writeFileSync(file, 'hello')
    assert.deepEqual(readText(file, ctx), { ok: true, content: 'hello' })
  })
})

test('readText refuses a path outside the allow-list', () => {
  withFixture((fx, ctx) => {
    const result = readText(path.join(os.tmpdir(), 'nope.txt'), ctx)
    assert.equal(result.ok, false)
    assert.equal(typeof result.error, 'string')
  })
})

test('readText returns error for a missing file', () => {
  withFixture((fx, ctx) => {
    const result = readText(path.join(fx.projectDir, 'missing.md'), ctx)
    assert.equal(result.ok, false)
  })
})

test('readText can read plugin cache files', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.home, '.claude', 'plugins', 'cache', 'm', 'SKILL.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'cached')
    assert.equal(readText(file, ctx).content, 'cached')
  })
})

test('writeText backs up then writes', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.projectDir, 'CLAUDE.md')
    fs.writeFileSync(file, 'old')
    const result = writeText(file, 'new', ctx)
    assert.equal(result.ok, true)
    assert.equal(fs.readFileSync(file, 'utf8'), 'new')
    assert.equal(fs.readFileSync(result.backup, 'utf8'), 'old')
    assert.equal(listBackups(file, fx.home).length, 1)
    assert.equal(fs.existsSync(file + '.tmp'), false)
  })
})

test('writeText creates a new file with parent folders and null backup', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.home, '.claude', 'skills', 'new', 'SKILL.md')
    const result = writeText(file, 'fresh', ctx)
    assert.equal(result.ok, true)
    assert.equal(result.backup, null)
    assert.equal(fs.readFileSync(file, 'utf8'), 'fresh')
  })
})

test('writeText refuses readOnly', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.home, '.claude', 'plugins', 'cache', 'm', 'SKILL.md')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'cached')
    const result = writeText(file, 'changed', ctx)
    assert.equal(result.ok, false)
    assert.equal(fs.readFileSync(file, 'utf8'), 'cached')
  })
})

test('writeText refuses a path outside the allow-list', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.home, '.ssh', 'authorized_keys')
    const result = writeText(file, 'x', ctx)
    assert.equal(result.ok, false)
    assert.equal(fs.existsSync(file), false)
  })
})

test('writeText writes through a symlink and keeps the symlink', () => {
  withFixture((fx, ctx) => {
    const target = path.join(fx.home, '.agents', 'SKILL.md')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'old')
    const link = path.join(fx.home, '.claude', 'linked.md')
    fs.symlinkSync(target, link)
    const result = writeText(link, 'new', ctx)
    assert.equal(result.ok, true)
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true)
    assert.equal(fs.readFileSync(target, 'utf8'), 'new')
  })
})

test('writeText removes the tmp file and reports error when rename fails', (t) => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.projectDir, 'CLAUDE.md')
    fs.writeFileSync(file, 'old')
    t.mock.method(fs, 'renameSync', () => {
      throw new Error('rename boom')
    })
    const result = writeText(file, 'x', ctx)
    assert.equal(result.ok, false)
    assert.match(result.error, /rename boom/)
    assert.equal(fs.existsSync(file + '.tmp'), false)
    assert.equal(fs.readFileSync(file, 'utf8'), 'old')
  })
})

test('deleteToTrash moves file to home/.claude/backups/storehouse/trash/<stamp>-<name>', () => {
  withFixture((fx, ctx) => {
    const file = path.join(fx.projectDir, 'gone.md')
    fs.writeFileSync(file, 'bye')
    const result = deleteToTrash(file, ctx)
    assert.equal(result.ok, true)
    const trashDir = path.join(fx.home, '.claude', 'backups', 'storehouse', 'trash')
    assert.equal(path.dirname(result.trashPath), trashDir)
    assert.match(path.basename(result.trashPath), /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-gone\.md$/)
    assert.equal(fs.existsSync(file), false)
    assert.equal(fs.readFileSync(result.trashPath, 'utf8'), 'bye')
  })
})

test('deleteToTrash moves a whole folder', () => {
  withFixture((fx, ctx) => {
    const dir = path.join(fx.home, '.claude', 'skills', 'sk')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 's')
    const result = deleteToTrash(dir, ctx)
    assert.equal(result.ok, true)
    assert.equal(fs.existsSync(dir), false)
    assert.equal(fs.readFileSync(path.join(result.trashPath, 'SKILL.md'), 'utf8'), 's')
  })
})

test('deleteToTrash refuses readOnly, outside, and missing', () => {
  withFixture((fx, ctx) => {
    const cached = path.join(fx.home, '.claude', 'plugins', 'cache', 'm', 'f.md')
    fs.mkdirSync(path.dirname(cached), { recursive: true })
    fs.writeFileSync(cached, 'c')
    assert.equal(deleteToTrash(cached, ctx).ok, false)
    assert.equal(fs.existsSync(cached), true)
    assert.equal(deleteToTrash(path.join(os.tmpdir(), 'x.txt'), ctx).ok, false)
    assert.equal(deleteToTrash(path.join(fx.projectDir, 'missing'), ctx).ok, false)
  })
})

test('deleteToTrash twice in the same millisecond does not collide', () => {
  withFixture((fx, ctx) => {
    const a = path.join(fx.projectDir, 'same.md')
    fs.writeFileSync(a, '1')
    const first = deleteToTrash(a, ctx)
    fs.writeFileSync(a, '2')
    const second = deleteToTrash(a, ctx)
    assert.equal(first.ok && second.ok, true)
    assert.notEqual(first.trashPath, second.trashPath)
  })
})

test('deleteToTrash refuses every root', () => {
  withFixture((fx, ctx) => {
    fs.writeFileSync(path.join(fx.home, '.claude.json'), '{}')
    for (const root of [path.join(fx.home, '.claude'), path.join(fx.home, '.claude.json'), fx.projectDir]) {
      assert.equal(deleteToTrash(root, ctx).ok, false)
      assert.equal(fs.existsSync(root), true)
    }
  })
})

test('deleteToTrash refuses a directory whose parent is a root', () => {
  withFixture((fx, ctx) => {
    const skills = path.join(fx.home, '.claude', 'skills')
    const projClaude = path.join(fx.projectDir, '.claude')
    fs.mkdirSync(skills, { recursive: true })
    fs.mkdirSync(projClaude, { recursive: true })
    assert.equal(deleteToTrash(skills, ctx).ok, false)
    assert.equal(deleteToTrash(projClaude, ctx).ok, false)
    assert.equal(fs.existsSync(skills), true)
    assert.equal(fs.existsSync(projClaude), true)
  })
})

test('deleteToTrash still deletes a skill folder and a file directly under a root', () => {
  withFixture((fx, ctx) => {
    const skill = path.join(fx.home, '.claude', 'skills', 'x')
    fs.mkdirSync(skill, { recursive: true })
    assert.equal(deleteToTrash(skill, ctx).ok, true)
    const file = path.join(fx.projectDir, 'a.md')
    fs.writeFileSync(file, 'a')
    assert.equal(deleteToTrash(file, ctx).ok, true)
  })
})
