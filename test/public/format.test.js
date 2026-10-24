import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esc,
  keyOf,
  tilde,
  money,
  compact,
  modelName,
  monthName,
  ago,
  slug,
  plural,
  shortVersion,
  tok,
  isFolderSkill,
  parentDir,
  baseName,
  relTo,
  fmtSize,
  isPlain,
  opt,
  unquote,
  lineCount
} from '../../public/core/format.js'
import { state } from '../../public/core/state.js'

test('esc escapes the five HTML characters and turns null into an empty string', () => {
  assert.equal(esc(`<a href="x">Tom & 'Jo'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/a&gt;')
  assert.equal(esc(null), '')
  assert.equal(esc(undefined), '')
  assert.equal(esc(42), '42')
})

test('keyOf joins kind, source, and name', () => {
  assert.equal(keyOf('skill', 'global', 'review'), 'skill:global:review')
})

test('tilde shortens paths under the home folder of the inventory only', () => {
  state.inventory = { global: { dir: '/Users/demo/.claude' } }
  try {
    assert.equal(tilde('/Users/demo/.claude/skills/a/SKILL.md'), '~/.claude/skills/a/SKILL.md')
    assert.equal(tilde('/opt/other/file.md'), '/opt/other/file.md')
    state.inventory = null
    assert.equal(tilde('/Users/demo/x'), '/Users/demo/x')
  } finally {
    state.inventory = null
  }
})

test('money shows dollars with two decimals and thousands separators', () => {
  assert.equal(money(0), '$0.00')
  assert.equal(money(1234.5), '$1,234.50')
})

test('compact shortens large numbers', () => {
  assert.equal(compact(950), '950')
  assert.equal(compact(1_250_000), '1.25M')
})

test('modelName turns a model id into a readable name without the date', () => {
  assert.equal(modelName('claude-opus-4-1-20250805'), 'Opus 4.1')
  assert.equal(modelName('claude-sonnet-4-5'), 'Sonnet 4.5')
  assert.equal(modelName('claude-haiku'), 'Haiku')
})

test('monthName names the month of a YYYY-MM key', () => {
  assert.equal(monthName('2026-10'), 'October 2026')
})

test('ago uses minutes, hours, and days, and a date after 30 days', () => {
  const now = Date.now()
  assert.equal(ago(now), 'just now')
  assert.equal(ago(now + 60_000), 'just now')
  assert.equal(ago(now - 5 * 60_000), '5 min ago')
  assert.equal(ago(now - 3 * 3_600_000), '3 h ago')
  assert.equal(ago(now - 2 * 86_400_000), '2 d ago')
  const old = now - 40 * 86_400_000
  assert.equal(ago(old), new Date(old).toLocaleDateString())
})

test('slug keeps letters, digits, dash, and underscore only', () => {
  assert.equal(slug('plugin:my skill/v2'), 'plugin_my_skill_v2')
})

test('plural adds an s for every count except 1', () => {
  assert.equal(plural(1, 'skill'), '1 skill')
  assert.equal(plural(0, 'skill'), '0 skills')
  assert.equal(plural(3, 'skill'), '3 skills')
})

test('shortVersion adds v to numbers and cuts commit hashes to 7 characters', () => {
  assert.equal(shortVersion('1.2.0'), 'v1.2.0')
  assert.equal(shortVersion('v2.0'), 'v2.0')
  assert.equal(shortVersion('abcdef1234567890'), 'abcdef1')
  assert.equal(shortVersion('latest'), 'latest')
  assert.equal(shortVersion(null), '')
  assert.equal(shortVersion('  '), '')
})

test('tok formats a token count', () => {
  assert.equal(tok(12345), '12,345 tok')
})

test('isFolderSkill is true only for a skill whose file is SKILL.md', () => {
  assert.equal(isFolderSkill({ kind: 'skill', path: '/h/.claude/skills/a/SKILL.md' }), true)
  assert.equal(isFolderSkill({ kind: 'skill', path: '/h/.claude/skills/a.md' }), false)
  assert.equal(isFolderSkill({ kind: 'agent', path: '/h/.claude/agents/SKILL.md' }), false)
})

test('path helpers work with slash and backslash', () => {
  assert.equal(parentDir('/a/b/c.md'), '/a/b')
  assert.equal(parentDir('C:\\a\\b\\c.md'), 'C:\\a\\b')
  assert.equal(baseName('/a/b/c.md'), 'c.md')
  assert.equal(baseName('C:\\a\\c.md'), 'c.md')
})

test('relTo gives the path under a root, or the base name outside it', () => {
  assert.equal(relTo('/a/b', '/a/b/c/d.md'), 'c/d.md')
  assert.equal(relTo('/a/b', '/x/y.md'), 'y.md')
  assert.equal(relTo('', '/x/y.md'), 'y.md')
})

test('fmtSize uses B, KB, and MB', () => {
  assert.equal(fmtSize(512), '512 B')
  assert.equal(fmtSize(1536), '1.5 KB')
  assert.equal(fmtSize(3 * 1024 * 1024), '3.0 MB')
})

test('isPlain is true only for plain objects', () => {
  assert.equal(isPlain({}), true)
  assert.equal(isPlain([]), false)
  assert.equal(isPlain(null), false)
  assert.equal(isPlain('x'), false)
})

test('opt builds an escaped option and marks the current value', () => {
  assert.equal(opt('a"b', 'A & B', 'x'), '<option value="a&quot;b">A &amp; B</option>')
  assert.equal(opt('x', 'X', 'x'), '<option value="x" selected>X</option>')
})

test('unquote removes matching outer quotes only', () => {
  assert.equal(unquote('"a b"'), 'a b')
  assert.equal(unquote("'a'"), 'a')
  assert.equal(unquote('"a\''), '"a\'')
})

test('lineCount ignores one trailing newline', () => {
  assert.equal(lineCount(''), 0)
  assert.equal(lineCount('a'), 1)
  assert.equal(lineCount('a\nb\n'), 2)
  assert.equal(lineCount('a\r\nb'), 2)
})
