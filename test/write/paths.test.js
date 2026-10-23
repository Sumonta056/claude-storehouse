import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { isAllowed } from '../../src/write/paths.js'

function withFixture(fn) {
  const fx = makeFixture()
  try {
    fn(fx, { home: fx.home, projectDir: fx.projectDir })
  } finally {
    fx.cleanup()
  }
}

test('allows path under home/.claude', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(fx.home, '.claude', 'settings.json'), ctx)
    assert.equal(result.allowed, true)
    assert.equal(result.readOnly, false)
  })
})

test('allows a not yet existing path under home/.claude', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(fx.home, '.claude', 'skills', 'new', 'SKILL.md'), ctx)
    assert.equal(result.allowed, true)
  })
})

test('allows ~/.claude.json', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(fx.home, '.claude.json'), ctx)
    assert.equal(result.allowed, true)
    assert.equal(result.readOnly, false)
  })
})

test('allows path under projectDir', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(fx.projectDir, '.claude', 'settings.local.json'), ctx)
    assert.equal(result.allowed, true)
  })
})

test('marks plugins/cache as readOnly', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(fx.home, '.claude', 'plugins', 'cache', 'm', 'p', 'SKILL.md'), ctx)
    assert.equal(result.allowed, true)
    assert.equal(result.readOnly, true)
  })
})

test('rejects path outside', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(os.tmpdir(), 'elsewhere.txt'), ctx)
    assert.equal(result.allowed, false)
    assert.equal(typeof result.reason, 'string')
  })
})

test('rejects a sibling of home that is not .claude', () => {
  withFixture((fx, ctx) => {
    assert.equal(isAllowed(path.join(fx.home, '.ssh', 'id_rsa'), ctx).allowed, false)
    assert.equal(isAllowed(path.join(fx.home, '.claude-evil', 'x'), ctx).allowed, false)
  })
})

test('rejects dot-dot traversal out of an allowed root', () => {
  withFixture((fx, ctx) => {
    const result = isAllowed(path.join(fx.home, '.claude', '..', '.ssh', 'id_rsa'), ctx)
    assert.equal(result.allowed, false)
  })
})

test('allows symlink whose real path is under home', () => {
  withFixture((fx, ctx) => {
    const target = path.join(fx.home, '.agents', 'skills', 'x')
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'SKILL.md'), 'x')
    fs.mkdirSync(path.join(fx.home, '.claude', 'skills'), { recursive: true })
    const link = path.join(fx.home, '.claude', 'skills', 'x')
    fs.symlinkSync(target, link)
    const result = isAllowed(path.join(link, 'SKILL.md'), ctx)
    assert.equal(result.allowed, true)
  })
})

test('rejects symlink whose real path is outside home', () => {
  withFixture((fx, ctx) => {
    const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'outside-'))
    try {
      fs.writeFileSync(path.join(outside, 'secret.txt'), 's')
      fs.mkdirSync(path.join(fx.home, '.claude', 'skills'), { recursive: true })
      const link = path.join(fx.home, '.claude', 'skills', 'bad')
      fs.symlinkSync(outside, link)
      assert.equal(isAllowed(path.join(link, 'secret.txt'), ctx).allowed, false)
      assert.equal(isAllowed(link, ctx).allowed, false)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})

test('rejects symlink under project that points outside', () => {
  withFixture((fx, ctx) => {
    const outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'outside-'))
    try {
      const link = path.join(fx.projectDir, 'link')
      fs.symlinkSync(outside, link)
      assert.equal(isAllowed(path.join(link, 'new.txt'), ctx).allowed, false)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})

test('works when home itself is reached through a symlink', () => {
  withFixture((fx) => {
    const alias = path.join(path.dirname(fx.home), 'home-alias')
    fs.symlinkSync(fx.home, alias)
    const result = isAllowed(path.join(alias, '.claude', 'settings.json'), { home: alias, projectDir: fx.projectDir })
    assert.equal(result.allowed, true)
  })
})

test('rejects symlink to a dot folder under home other than .claude and .agents', () => {
  withFixture((fx, ctx) => {
    fs.mkdirSync(path.join(fx.home, '.ssh'))
    fs.writeFileSync(path.join(fx.home, '.ssh', 'id_rsa'), 'k')
    fs.mkdirSync(path.join(fx.home, '.aws'))
    fs.writeFileSync(path.join(fx.home, '.aws', 'credentials'), 'c')
    const a = path.join(fx.home, '.claude', 'a')
    const b = path.join(fx.home, '.claude', 'b')
    fs.symlinkSync(path.join(fx.home, '.ssh', 'id_rsa'), a)
    fs.symlinkSync(path.join(fx.home, '.aws', 'credentials'), b)
    assert.equal(isAllowed(a, ctx).allowed, false)
    assert.equal(isAllowed(b, ctx).allowed, false)
  })
})

test('rejects symlink to a dot segment nested below an allowed one', () => {
  withFixture((fx, ctx) => {
    fs.mkdirSync(path.join(fx.home, '.agents', '.secret'), { recursive: true })
    const link = path.join(fx.home, '.claude', 'n')
    fs.symlinkSync(path.join(fx.home, '.agents', '.secret'), link)
    assert.equal(isAllowed(link, ctx).allowed, false)
  })
})
