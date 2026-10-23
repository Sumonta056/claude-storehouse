import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanClaudeMd } from '../../src/scan/claudemd.js'

test('scanClaudeMd reports exists and size', () => {
  const fx = makeFixture()
  try {
    const r = scanClaudeMd({ home: fx.home, projectDir: fx.projectDir })
    assert.deepEqual(r.global, { path: path.join(fx.home, '.claude', 'CLAUDE.md'), exists: true, size: 15 })
    assert.equal(r.project.exists, true)
    assert.equal(r.project.size, 25)
    assert.equal(r.projectLocal.exists, false)
    assert.equal(r.projectLocal.size, 0)
    assert.equal(r.projectLocal.path, path.join(fx.projectDir, 'CLAUDE.local.md'))
    assert.equal(r.projectClaudeDir.path, path.join(fx.projectDir, '.claude', 'CLAUDE.md'))
    assert.equal(r.projectClaudeDir.exists, false)
  } finally {
    fx.cleanup()
  }
})

test('scanClaudeMd lists global and project rules with conditional flag', () => {
  const fx = makeFixture()
  try {
    const r = scanClaudeMd({ home: fx.home, projectDir: fx.projectDir })
    const byPath = Object.fromEntries(r.rules.map((rule) => [rule.path, rule]))
    const style = path.join(fx.home, '.claude', 'rules', 'style.md')
    const ui = path.join(fx.projectDir, '.claude', 'rules', 'ui.md')
    const deep = path.join(fx.projectDir, '.claude', 'rules', 'sub', 'deep.md')
    assert.deepEqual(Object.keys(byPath).sort(), [deep, style, ui].sort())
    assert.deepEqual(byPath[style], { path: style, size: fs.statSync(style).size, scope: 'global', conditional: false })
    assert.equal(byPath[ui].scope, 'project')
    assert.equal(byPath[ui].conditional, true)
    assert.equal(byPath[deep].conditional, false)
  } finally {
    fx.cleanup()
  }
})

test('scanClaudeMd skips hidden rule files and non-md files', () => {
  const fx = makeFixture()
  try {
    const names = scanClaudeMd({ home: fx.home, projectDir: fx.projectDir }).rules.map((rule) =>
      path.basename(rule.path)
    )
    assert.ok(!names.includes('.hidden.md'))
    assert.ok(!names.includes('notes.txt'))
  } finally {
    fx.cleanup()
  }
})

test('scanClaudeMd without project lists only global rules', () => {
  const fx = makeFixture()
  try {
    const r = scanClaudeMd({ home: fx.home, projectDir: null })
    assert.deepEqual(
      r.rules.map((rule) => rule.scope),
      ['global']
    )
  } finally {
    fx.cleanup()
  }
})

test('rule with trailing space after closing frontmatter line is conditional', () => {
  const fx = makeFixture()
  try {
    const file = path.join(fx.projectDir, '.claude', 'rules', 'ui.md')
    fs.writeFileSync(file, "---\npaths:\n  - 'src/**'\n--- \n\nBody\n")
    const rule = scanClaudeMd({ home: fx.home, projectDir: fx.projectDir }).rules.find((r) => r.path === file)
    assert.equal(rule.conditional, true)
  } finally {
    fx.cleanup()
  }
})

test('symlinked rule is listed only when its real path is under home or project', () => {
  const fx = makeFixture()
  try {
    const rules = path.join(fx.home, '.claude', 'rules')
    const outside = path.join(path.dirname(fx.home), 'outside.md')
    fs.writeFileSync(outside, '# Outside\n')
    fs.symlinkSync(outside, path.join(rules, 'out.md'))
    fs.symlinkSync(path.join(fx.home, '.claude', 'CLAUDE.md'), path.join(rules, 'in.md'))
    const names = scanClaudeMd({ home: fx.home, projectDir: fx.projectDir }).rules.map((r) => path.basename(r.path))
    assert.ok(names.includes('in.md'))
    assert.ok(!names.includes('out.md'))
  } finally {
    fx.cleanup()
  }
})
