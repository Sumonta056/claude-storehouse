import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { readJson, writeJsonAtomic, backupFile, listBackups, restoreBackup } from '../../src/write/json-file.js'

test('readJson returns ok false with error on bad json', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.home, 'bad.json')
    fs.writeFileSync(file, '{bad')
    const result = readJson(file)
    assert.equal(result.ok, false)
    assert.equal(typeof result.error, 'string')
    assert.equal(result.raw, '{bad')
  } finally {
    fx.cleanup()
  }
})

test('readJson returns data for valid json', () => {
  const fx = makeFixture()
  try {
    const result = readJson(path.join(fx.home, '.claude', 'settings.json'))
    assert.equal(result.ok, true)
    assert.equal(result.data.model, 'fable')
  } finally {
    fx.cleanup()
  }
})

test('writeJsonAtomic writes backup then file, keeps other keys', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.home, '.claude', 'settings.json')
    const data = readJson(file).data
    data.skillOverrides.new = 'off'
    const { backup } = writeJsonAtomic(file, data, fx.home)
    const written = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(written.model, 'fable')
    assert.deepEqual(written.skillOverrides, { old: 'off', 'java-clean-code': 'off', new: 'off' })
    assert.ok(fs.readFileSync(file, 'utf8').endsWith('}\n'))
    assert.ok(backup.startsWith(path.join(fx.home, '.claude', 'backups', 'storehouse') + path.sep))
    assert.ok(fs.existsSync(backup))
    assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')).skillOverrides, {
      old: 'off',
      'java-clean-code': 'off'
    })
    assert.equal(fs.existsSync(file + '.tmp'), false)
  } finally {
    fx.cleanup()
  }
})

test('writeJsonAtomic creates a missing file and returns null backup', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.projectDir, '.claude', 'fresh.json')
    const { backup } = writeJsonAtomic(file, { a: 1 }, fx.home)
    assert.equal(backup, null)
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 })
  } finally {
    fx.cleanup()
  }
})

test('writeJsonAtomic keeps at most 20 backups', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.home, '.claude', 'settings.json')
    for (let i = 0; i < 22; i++) {
      writeJsonAtomic(file, { n: i }, fx.home)
    }
    assert.equal(listBackups(file, fx.home).length, 20)
  } finally {
    fx.cleanup()
  }
})

test('listBackups returns newest first', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.home, '.claude', 'settings.json')
    for (let i = 0; i < 3; i++) {
      writeJsonAtomic(file, { n: i }, fx.home)
    }
    const list = listBackups(file, fx.home)
    assert.deepEqual(list, [...list].sort().reverse())
    assert.equal(JSON.parse(fs.readFileSync(list[0], 'utf8')).n, 1)
  } finally {
    fx.cleanup()
  }
})

test('backupFile returns null when file is missing', () => {
  const fx = makeFixture()
  try {
    assert.equal(backupFile(path.join(fx.home, 'nope.json'), fx.home), null)
  } finally {
    fx.cleanup()
  }
})

test('writeJsonAtomic writes through a symlink and keeps it', () => {
  const fx = makeFixture()
  try {
    const target = path.join(fx.home, 'real.json')
    fs.writeFileSync(target, '{"a":0}')
    const link = path.join(fx.home, '.claude', 'link.json')
    fs.symlinkSync(target, link)
    writeJsonAtomic(link, { a: 1 }, fx.home)
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true)
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { a: 1 })
  } finally {
    fx.cleanup()
  }
})

test('writeJsonAtomic removes the tmp file and rethrows when rename fails', (t) => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.home, '.claude', 'settings.json')
    t.mock.method(fs, 'renameSync', () => {
      throw new Error('rename boom')
    })
    assert.throws(() => writeJsonAtomic(file, { a: 1 }, fx.home), /rename boom/)
    assert.equal(fs.existsSync(file + '.tmp'), false)
  } finally {
    fx.cleanup()
  }
})

function skillFile(fx, folder) {
  const file = path.join(fx.projectDir, '.claude', 'skills', folder, 'SKILL.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${folder}\n`)
  return file
}

test('backup names carry basename, 12 hex path id and stamp', () => {
  const fx = makeFixture()
  try {
    const file = skillFile(fx, 'a')
    const backup = backupFile(file, fx.home)
    assert.match(path.basename(backup), /^SKILL\.md\.[0-9a-f]{12}\.\d{4}-\d{2}-\d{2}T/)
  } finally {
    fx.cleanup()
  }
})

test('two SKILL.md files in different folders keep separate backup lists', () => {
  const fx = makeFixture()
  try {
    const a = skillFile(fx, 'a')
    const b = skillFile(fx, 'b')
    writeJsonAtomic(a, { n: 1 }, fx.home)
    writeJsonAtomic(b, { n: 1 }, fx.home)
    writeJsonAtomic(b, { n: 2 }, fx.home)
    assert.equal(listBackups(a, fx.home).length, 1)
    assert.equal(listBackups(b, fx.home).length, 2)
  } finally {
    fx.cleanup()
  }
})

test('22 saves of file A do not prune file B backups', () => {
  const fx = makeFixture()
  try {
    const a = skillFile(fx, 'a')
    const b = skillFile(fx, 'b')
    for (let i = 0; i < 3; i++) writeJsonAtomic(b, { n: i }, fx.home)
    for (let i = 0; i < 22; i++) writeJsonAtomic(a, { n: i }, fx.home)
    assert.equal(listBackups(a, fx.home).length, 20)
    assert.equal(listBackups(b, fx.home).length, 3)
  } finally {
    fx.cleanup()
  }
})

test('restoreBackup refuses a backup of another file with the same basename', () => {
  const fx = makeFixture()
  try {
    const a = skillFile(fx, 'a')
    const b = skillFile(fx, 'b')
    writeJsonAtomic(b, { n: 1 }, fx.home)
    const [bBackup] = listBackups(b, fx.home)
    const before = fs.readFileSync(a, 'utf8')
    const ctx = { home: fx.home, projectDir: fx.projectDir }
    const result = restoreBackup(bBackup, a, fx.home, ctx)
    assert.equal(result.ok, false)
    assert.match(result.error, /does not belong/)
    assert.equal(fs.readFileSync(a, 'utf8'), before)
    const own = restoreBackup(bBackup, b, fx.home, ctx)
    assert.equal(own.ok, true, own.error)
    assert.equal(fs.readFileSync(b, 'utf8'), 'b\n')
  } finally {
    fx.cleanup()
  }
})

test('global and project settings.json have separate backup lists', () => {
  const fx = makeFixture()
  try {
    const global = path.join(fx.home, '.claude', 'settings.json')
    const project = path.join(fx.projectDir, '.claude', 'settings.json')
    fs.mkdirSync(path.dirname(project), { recursive: true })
    fs.writeFileSync(project, '{}\n')
    fs.writeFileSync(global, '{}\n')
    writeJsonAtomic(global, { n: 1 }, fx.home)
    writeJsonAtomic(project, { n: 1 }, fx.home)
    writeJsonAtomic(project, { n: 2 }, fx.home)
    assert.equal(listBackups(global, fx.home).length, 1)
    assert.equal(listBackups(project, fx.home).length, 2)
  } finally {
    fx.cleanup()
  }
})

test('listBackups ignores and keeps legacy backups without an id', () => {
  const fx = makeFixture()
  try {
    const file = skillFile(fx, 'a')
    const dir = path.join(fx.home, '.claude', 'backups', 'storehouse')
    fs.mkdirSync(dir, { recursive: true })
    const legacy = path.join(dir, 'SKILL.md.2026-01-01T00-00-00-000Z')
    fs.writeFileSync(legacy, 'old')
    for (let i = 0; i < 22; i++) writeJsonAtomic(file, { n: i }, fx.home)
    assert.equal(listBackups(file, fx.home).length, 20)
    assert.ok(fs.existsSync(legacy))
  } finally {
    fx.cleanup()
  }
})
