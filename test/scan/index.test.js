import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanAll } from '../../src/scan/index.js'

test('scanAll returns every section and errors array', () => {
  const fx = makeFixture()
  try {
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(inv.project, { dir: fx.projectDir, hasClaudeDir: true })
    assert.deepEqual(inv.global, { dir: path.join(fx.home, '.claude') })
    assert.ok(inv.skills.length > 0)
    assert.ok(inv.agents.length > 0)
    assert.ok(inv.plugins.length > 0)
    assert.deepEqual(
      inv.devMods.map((m) => m.id),
      ['abc-session/band-mod']
    )
    assert.ok(inv.mcp.length > 0)
    assert.deepEqual(Object.keys(inv.settings), ['global', 'project', 'projectLocal'])
    assert.equal(inv.settings.global.exists, true)
    assert.deepEqual(Object.keys(inv.claudeMd), ['global', 'project', 'projectLocal', 'projectClaudeDir', 'rules'])
    assert.deepEqual(inv.favorites, [])
    assert.deepEqual(inv.errors, [])
    assert.ok(inv.hooks.some((h) => h.scope === 'global'))
    assert.ok(inv.hooks.some((h) => h.scope === 'plugin'))
  } finally {
    fx.cleanup()
  }
})

test('scanAll records a parse error and still returns other sections', () => {
  const fx = makeFixture()
  try {
    const bad = path.join(fx.home, '.claude.json')
    fs.writeFileSync(bad, '{ nope')
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
    assert.ok(inv.errors.some((e) => e.path === bad && e.error))
    assert.ok(inv.skills.length > 0)
    assert.ok(inv.plugins.length > 0)
    assert.ok(inv.mcp.some((m) => m.name === 'postgres'))
  } finally {
    fx.cleanup()
  }
})

test('scanAll reports settings parse errors', () => {
  const fx = makeFixture()
  try {
    const bad = path.join(fx.projectDir, '.claude', 'settings.json')
    fs.writeFileSync(bad, '{ nope')
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
    assert.ok(inv.errors.some((e) => e.path === bad))
    assert.equal(inv.settings.project.ok, false)
    assert.ok(inv.agents.length > 0)
  } finally {
    fx.cleanup()
  }
})

test('scanAll error paths are files or section:<name>', async () => {
  const fx = makeFixture()
  try {
    const bad = path.join(fx.home, '.claude.json')
    fs.writeFileSync(bad, '{ nope')
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
    assert.ok(inv.errors.every((e) => path.isAbsolute(e.path) || e.path.startsWith('section:')))
  } finally {
    fx.cleanup()
  }
})

test('scanAll gives skills, agents, and plugins a numeric mtime from disk', () => {
  const fx = makeFixture()
  try {
    const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
    for (const item of [...inv.skills, ...inv.agents, ...inv.plugins.filter((p) => !p.missing)]) {
      assert.equal(typeof item.mtime, 'number', `${item.kind ?? 'plugin'} ${item.name} has no mtime`)
      assert.ok(Number.isFinite(item.mtime))
    }
    const skill = inv.skills.find((s) => s.name === 'html-report')
    const when = new Date('2026-01-02T03:04:05Z')
    fs.utimesSync(skill.path, when, when)
    const again = scanAll({ home: fx.home, projectDir: fx.projectDir }).skills.find((s) => s.name === 'html-report')
    assert.equal(again.mtime, when.getTime())
    const ghost = inv.plugins.find((p) => p.missing)
    if (ghost) assert.equal(ghost.mtime, null)
  } finally {
    fx.cleanup()
  }
})
