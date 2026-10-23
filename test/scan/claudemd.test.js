import { test } from 'node:test'
import assert from 'node:assert/strict'
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
