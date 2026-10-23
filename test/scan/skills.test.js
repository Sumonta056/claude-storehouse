import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanSettings } from '../../src/scan/settings.js'
import { scanPlugins } from '../../src/scan/plugins.js'
import { scanSkills } from '../../src/scan/skills.js'

function run(fx) {
  const settings = scanSettings({ home: fx.home, projectDir: fx.projectDir })
  const plugins = scanPlugins({ home: fx.home, projectDir: fx.projectDir, enabledPlugins: settings.enabledPlugins })
  return scanSkills({ home: fx.home, projectDir: fx.projectDir, plugins, skillOverrides: settings.skillOverrides })
}

function withFixture(fn) {
  const fx = makeFixture()
  try {
    fn(fx)
  } finally {
    fx.cleanup()
  }
}

test('scanSkills lists global project and plugin skills', () => {
  withFixture((fx) => {
    const items = run(fx)
    const g = items.find((i) => i.name === 'html-report')
    assert.equal(g.kind, 'skill')
    assert.equal(g.scope, 'global')
    assert.equal(g.source, 'local')
    assert.equal(g.description, 'Build a dark report: with sidebar')
    assert.equal(g.path, path.join(fx.home, '.claude', 'skills', 'html-report', 'SKILL.md'))
    assert.equal(g.favorite, false)
    const p = items.find((i) => i.name === 'deploy-checklist')
    assert.equal(p.scope, 'project')
    assert.equal(p.source, 'project')
    const pl = items.find((i) => i.name === 'brainstorming')
    assert.equal(pl.scope, 'plugin')
    assert.equal(pl.source, 'superpowers@claude-plugins-official')
    assert.equal(pl.plugin, 'superpowers@claude-plugins-official')
  })
})

test('skips folder without SKILL.md and .trash, lists loose md', () => {
  withFixture((fx) => {
    const names = run(fx).map((i) => i.name)
    assert.ok(!names.includes('nodesc'))
    assert.ok(!names.includes('x'))
    assert.ok(!names.includes('.trash'))
    const loose = run(fx).find((i) => i.name === 'loose')
    assert.equal(loose.description, 'A loose skill file')
    assert.equal(loose.path, path.join(fx.home, '.claude', 'skills', 'loose.md'))
  })
})

test('falls back to folder name and first body line without frontmatter', () => {
  withFixture((fx) => {
    const item = run(fx).find((i) => i.name === 'nofm')
    assert.equal(item.description, 'First real line of the body.')
  })
})

test('truncates fallback description to 200 chars', () => {
  withFixture((fx) => {
    fs.writeFileSync(path.join(fx.home, '.claude', 'skills', 'nofm', 'SKILL.md'), 'a'.repeat(300))
    const item = run(fx).find((i) => i.name === 'nofm')
    assert.equal(item.description.length, 200)
  })
})

test('skill enabled follows skillOverrides', () => {
  withFixture((fx) => {
    const items = run(fx)
    assert.equal(items.find((i) => i.name === 'java-clean-code').enabled, false)
    assert.equal(items.find((i) => i.name === 'java-clean-code').canToggle, true)
    assert.equal(items.find((i) => i.name === 'html-report').enabled, true)
    assert.equal(items.find((i) => i.name === 'deploy-checklist').enabled, false)
  })
})

test('plugin skill is readOnly and canToggle false', () => {
  withFixture((fx) => {
    const pl = run(fx).find((i) => i.name === 'brainstorming')
    assert.equal(pl.readOnly, true)
    assert.equal(pl.canToggle, false)
    assert.equal(pl.enabled, true)
    const g = run(fx).find((i) => i.name === 'html-report')
    assert.equal(g.readOnly, false)
  })
})

test('symlinked skill folder is listed with lexical path and realPath', () => {
  withFixture((fx) => {
    fs.symlinkSync(
      path.join(fx.home, '.agents', 'skills', 'archify'),
      path.join(fx.home, '.claude', 'skills', 'archify')
    )
    const item = run(fx).find((i) => i.name === 'archify')
    assert.equal(item.path, path.join(fx.home, '.claude', 'skills', 'archify', 'SKILL.md'))
    assert.equal(item.realPath, fs.realpathSync(path.join(fx.home, '.agents', 'skills', 'archify', 'SKILL.md')))
  })
})

test('missing skills folders give empty list', () => {
  const items = scanSkills({ home: '/nonexistent-h', projectDir: '/nonexistent-p', plugins: [], skillOverrides: {} })
  assert.deepEqual(items, [])
})

test('empty frontmatter description falls back to first body line', () => {
  withFixture((fx) => {
    fs.writeFileSync(
      path.join(fx.home, '.claude', 'skills', 'nofm', 'SKILL.md'),
      '---\nname: nofm\ndescription: ""\n---\nBody text here\n'
    )
    assert.equal(run(fx).find((i) => i.name === 'nofm').description, 'Body text here')
  })
})

test('frontmatter name differs from folder and overrides use it', () => {
  withFixture((fx) => {
    const dir = path.join(fx.home, '.claude', 'skills', 'folder-x')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: real-name\ndescription: d\n---\n')
    const items = scanSkills({
      home: fx.home,
      projectDir: fx.projectDir,
      plugins: [],
      skillOverrides: { 'real-name': 'off', 'folder-x': 'on' }
    })
    const item = items.find((i) => i.name === 'real-name')
    assert.equal(item.enabled, false)
    assert.ok(!items.some((i) => i.name === 'folder-x'))
  })
})
