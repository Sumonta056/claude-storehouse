import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from './fixture.js'

test('makeFixture copies home and project and returns realpaths', () => {
  const fx = makeFixture()
  try {
    assert.equal(fx.home, fs.realpathSync(fx.home))
    assert.equal(fx.projectDir, fs.realpathSync(fx.projectDir))
    assert.ok(fs.existsSync(path.join(fx.home, '.claude', 'settings.json')))
  } finally {
    fx.cleanup()
  }
})

test('makeFixture replaces __PROJECT__ in json files with projectDir', () => {
  const fx = makeFixture()
  try {
    const data = JSON.parse(fs.readFileSync(path.join(fx.home, '.claude.json'), 'utf8'))
    assert.deepEqual(Object.keys(data.projects), [fx.projectDir])
  } finally {
    fx.cleanup()
  }
})
