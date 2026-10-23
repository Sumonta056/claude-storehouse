import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter } from '../../src/scan/frontmatter.js'

test('parseFrontmatter reads name and description', () => {
  const r = parseFrontmatter('---\nname: a\ndescription: Do: things\n---\nBody line\n')
  assert.equal(r.name, 'a')
  assert.equal(r.description, 'Do: things')
  assert.equal(r.body, 'Body line\n')
})

test('parseFrontmatter strips one pair of matching quotes', () => {
  assert.equal(parseFrontmatter('---\ndescription: "x: y"\n---\n').description, 'x: y')
  assert.equal(parseFrontmatter("---\ndescription: 'x y'\n---\n").description, 'x y')
  assert.equal(parseFrontmatter('---\ndescription: "x\n---\n').description, '"x')
})

test('parseFrontmatter without fences returns empty meta', () => {
  const r = parseFrontmatter('# Title\nText')
  assert.equal(r.name, undefined)
  assert.equal(r.description, undefined)
  assert.equal(r.body, '# Title\nText')
})

test('parseFrontmatter handles CRLF', () => {
  const r = parseFrontmatter('---\r\nname: a\r\n---\r\nB')
  assert.equal(r.name, 'a')
  assert.equal(r.body, 'B')
})

test('parseFrontmatter folds > block scalar with spaces', () => {
  const r = parseFrontmatter('---\nname: a\ndescription: >\n  First part\n  second: part\n\nother: x\n---\nB')
  assert.equal(r.description, 'First part second: part')
  assert.equal(r.name, 'a')
})

test('parseFrontmatter keeps newlines for | block scalar', () => {
  const r = parseFrontmatter('---\ndescription: |-\n    one\n      two\n    three\nname: z\n---\nB')
  assert.equal(r.description, 'one\n  two\nthree')
  assert.equal(r.name, 'z')
})

test('parseFrontmatter block scalar with + and - variants', () => {
  for (const ind of ['>-', '>+', '|+']) {
    const r = parseFrontmatter(`---\ndescription: ${ind}\n  x\n  y\n---\n`)
    assert.ok(r.description.startsWith('x'))
  }
})

test('parseFrontmatter joins indented continuation lines of a plain value', () => {
  const r = parseFrontmatter(
    '---\nname: a\ndescription: Reviews a change. Use\n  before it is done.\n  Read only.\ntools: Read\n---\nB'
  )
  assert.equal(r.description, 'Reviews a change. Use before it is done. Read only.')
  assert.equal(r.tools, 'Read')
})

test('parseFrontmatter stops a plain value at a comment line', () => {
  const r = parseFrontmatter('---\ndescription: a\n  # note\nname: n\n---\nB')
  assert.equal(r.description, 'a')
  assert.equal(r.name, 'n')
})

test('parseFrontmatter reads a plain value that starts on the next line', () => {
  const r = parseFrontmatter('---\ndescription:\n  text on\n  next line\nname: n\n---\nB')
  assert.equal(r.description, 'text on next line')
})

test('parseFrontmatter joins a multi-line quoted value and keeps nested maps out', () => {
  const r = parseFrontmatter('---\nmetadata:\n  description: inner\ndescription: "a b\n  c d"\n---\nB')
  assert.equal(r.description, 'a b c d')
})
