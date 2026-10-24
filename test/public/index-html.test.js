import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
const linked = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map((m) => m[1])

test('index.html links every stylesheet in public/css exactly once', () => {
  const files = fs
    .readdirSync(path.join(publicDir, 'css'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => `css/${f}`)
  assert.deepEqual([...linked].sort(), files.sort())
  assert.equal(new Set(linked).size, linked.length)
})

test('index.html loads base.css first and app.js as the only module entry', () => {
  assert.equal(linked[0], 'css/base.css')
  assert.deepEqual(
    [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1]),
    ['app.js']
  )
})
