import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('site build makes the landing page and a live demo from the current public/ code', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-site-test-')), '_site')
  const run = spawnSync(process.execPath, [path.join(root, 'site', 'build.js'), out], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)

  assert.ok(fs.existsSync(path.join(out, 'index.html')))
  assert.ok(fs.existsSync(path.join(out, 'icon.svg')))
  assert.ok(!fs.existsSync(path.join(out, 'build.js')))
  for (const img of fs.readFileSync(path.join(out, 'index.html'), 'utf8').matchAll(/src="(screenshots\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(out, img[1])), `missing ${img[1]}`)
  }

  const demo = fs.readFileSync(path.join(out, 'demo', 'index.html'), 'utf8')
  assert.match(demo, /<script src="demo-api.js"><\/script>\s*<script type="module" src="app.js">/)
  assert.match(demo, /noindex/)
  assert.equal(
    fs.readFileSync(path.join(out, 'demo', 'app.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8')
  )

  const raw = fs.readFileSync(path.join(out, 'demo', 'demo-data.json'), 'utf8')
  assert.ok(!raw.includes(os.tmpdir()), 'demo data leaks a temp path')
  const data = JSON.parse(raw)
  assert.equal(data.home, '/Users/demo')
  assert.ok(data.inventory.skills.length > 0)
  assert.ok(data.usage.all.cost > 0)
  assert.deepEqual(data.doctor.issues.map((i) => `${i.check}:${i.name}`).sort(), [
    '5:old-theme@demo-market',
    '7:code-reviewer',
    '7:debugging'
  ])
  assert.ok(data.files['/Users/demo/.claude/CLAUDE.md'].content.length > 0)
})
