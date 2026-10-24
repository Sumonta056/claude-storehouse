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

test('index.html links palette.css after lists.css and before responsive.css', () => {
  const at = (f) => linked.indexOf(`css/${f}`)
  assert.ok(at('palette.css') > at('lists.css'))
  assert.ok(at('palette.css') < at('responsive.css'))
})

test('index.html has the header palette button and the palette dialog outside .app', () => {
  assert.match(html, /<button[^>]*id="pal-open"[^>]*>[\s\S]*?<kbd[^>]*id="pal-key"/)
  assert.match(html, /id="pal"[^>]*hidden/)
  assert.match(html, /role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Command palette"/)
  assert.match(html, /<input[^>]*id="pal-q"[^>]*role="combobox"[^>]*aria-controls="pal-list"/)
  assert.match(html, /<ul[^>]*id="pal-list"[^>]*role="listbox"/)
  assert.ok(html.indexOf('id="pal"') > html.indexOf('id="cf"'))
})
