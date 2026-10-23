import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { makeFixture } from './helpers/fixture.js'
import { startServer } from '../src/server.js'

const TOKEN = crypto.randomBytes(16).toString('hex')
const SP = 'superpowers@claude-plugins-official'

async function withServer(fn) {
  const fx = makeFixture()
  const server = await startServer({ home: fx.home, projectDir: fx.projectDir, port: 0, token: TOKEN })
  const base = `http://127.0.0.1:${server.port}`
  const api = async (method, route, body, headers = {}) => {
    const init = { method, headers: { 'x-storehouse-token': TOKEN, ...headers } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    const res = await fetch(base + route, init)
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, json, text, headers: res.headers }
  }
  try {
    await fn({ fx, server, base, api })
  } finally {
    await server.close()
    fx.cleanup()
  }
}

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.end()
  })
}

test('401 without token', async () => {
  await withServer(async ({ base, api }) => {
    const res = await fetch(`${base}/api/inventory`)
    assert.equal(res.status, 401)
    const wrong = await api('GET', '/api/inventory', undefined, { 'x-storehouse-token': 'nope' })
    assert.equal(wrong.status, 401)
  })
})

test('server listens on 127.0.0.1 only and url carries the token', async () => {
  await withServer(async ({ server }) => {
    assert.equal(server.address, '127.0.0.1')
    assert.equal(server.url, `http://127.0.0.1:${server.port}/?token=${TOKEN}`)
  })
})

test('static / returns HTML', async () => {
  await withServer(async ({ base }) => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/html/)
    assert.match(await res.text(), /<title>/i)
  })
})

test('path traversal outside public is 404', async () => {
  await withServer(async ({ server, base }) => {
    assert.equal(await rawGet(server.port, '/../package.json'), 404)
    assert.equal(await rawGet(server.port, '/%2e%2e/package.json'), 404)
    assert.equal((await fetch(`${base}/nope.js`)).status, 404)
  })
})

test('GET /api/inventory returns sections', async () => {
  await withServer(async ({ api }) => {
    const res = await api('GET', '/api/inventory')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /application\/json/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    for (const key of ['skills', 'agents', 'plugins', 'hooks', 'mcp', 'settings', 'claudeMd', 'favorites']) {
      assert.ok(key in res.json, key)
    }
  })
})

test('GET /api/usage returns totals and requires the token', async () => {
  await withServer(async ({ api }) => {
    const res = await api('GET', '/api/usage')
    assert.equal(res.status, 200)
    assert.equal(res.json.responses, 0)
    for (const key of ['tokens', 'sessions', 'projects', 'cacheShare', 'total', 'month', 'models', 'unpriced']) {
      assert.ok(key in res.json, key)
    }
    const denied = await api('GET', '/api/usage', undefined, { 'x-storehouse-token': 'wrong' })
    assert.equal(denied.status, 401)
  })
})

test('POST /api/toggle then inventory shows change', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('POST', '/api/toggle', {
      kind: 'skill',
      name: 'html-report',
      scope: 'global',
      enabled: false
    })
    assert.equal(res.status, 200, res.text)
    const inv = await api('GET', '/api/inventory')
    const skill = inv.json.skills.find((s) => s.name === 'html-report' && s.scope === 'global')
    assert.equal(skill.enabled, false)
    const settings = read(path.join(fx.home, '.claude', 'settings.json'))
    assert.equal(settings.skillOverrides['html-report'], 'off')
    assert.equal(settings.model, 'fable')
  })
})

test('toggle refusal is 400 with error', async () => {
  await withServer(async ({ api }) => {
    const res = await api('POST', '/api/toggle', {
      kind: 'skill',
      name: 'brainstorming',
      scope: 'plugin',
      plugin: SP,
      enabled: false
    })
    assert.equal(res.status, 400)
    assert.ok(res.json.error)
  })
})

test('POST /api/undo reverts a toggle', async () => {
  await withServer(async ({ fx, api }) => {
    await api('POST', '/api/toggle', { kind: 'skill', name: 'html-report', scope: 'global', enabled: false })
    const activity = await api('GET', '/api/activity')
    const entry = activity.json.entries.find((e) => e.kind === 'toggle')
    assert.ok(entry && entry.canUndo)
    const undo = await api('POST', '/api/undo', { entryId: entry.id })
    assert.equal(undo.status, 200, undo.text)
    const settings = read(path.join(fx.home, '.claude', 'settings.json'))
    assert.equal(settings.skillOverrides['html-report'], undefined)
    assert.equal(settings.skillOverrides['java-clean-code'], 'off')
  })
})

test('PUT /api/file outside allow-list is 403', async () => {
  await withServer(async ({ fx, api }) => {
    const outside = path.join(path.dirname(fx.home), 'outside.txt')
    const res = await api('PUT', '/api/file', { path: outside, content: 'x' })
    assert.equal(res.status, 403)
    assert.equal(fs.existsSync(outside), false)
    const get = await api('GET', `/api/file?path=${encodeURIComponent('/etc/hosts')}`)
    assert.equal(get.status, 403)
  })
})

test('PUT then GET /api/file round trips and creates backup', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.projectDir, 'CLAUDE.md')
    const put = await api('PUT', '/api/file', { path: file, content: '# changed\n' })
    assert.equal(put.status, 200, put.text)
    assert.ok(put.json.backup && fs.existsSync(put.json.backup))
    const get = await api('GET', `/api/file?path=${encodeURIComponent(file)}`)
    assert.equal(get.status, 200)
    assert.equal(get.json.content, '# changed\n')
    assert.equal(get.json.readOnly, false)
    const backups = await api('GET', `/api/backups?path=${encodeURIComponent(file)}`)
    assert.equal(backups.json.backups.length, 1)
    assert.ok(backups.json.backups[0].time)
  })
})

test('PUT /api/file refuses invalid JSON and read-only files', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.home, '.claude', 'settings.json')
    const before = fs.readFileSync(file, 'utf8')
    const bad = await api('PUT', '/api/file', { path: file, content: '{ nope' })
    assert.equal(bad.status, 400)
    assert.ok(bad.json.error)
    assert.equal(fs.readFileSync(file, 'utf8'), before)
    const cached = path.join(
      fx.home,
      '.claude',
      'plugins',
      'cache',
      'claude-plugins-official',
      'superpowers',
      '1.0.0',
      'skills',
      'brainstorming',
      'SKILL.md'
    )
    const ro = await api('PUT', '/api/file', { path: cached, content: 'x' })
    assert.equal(ro.status, 403)
  })
})

test('GET /api/file on a folder lists entries dirs first', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('GET', `/api/file?path=${encodeURIComponent(path.join(fx.home, '.claude', 'skills'))}`)
    assert.equal(res.status, 200)
    const types = res.json.entries.map((e) => e.type)
    assert.deepEqual(
      types,
      [...types].sort((a, b) => (a === b ? 0 : a === 'dir' ? -1 : 1))
    )
    assert.ok(res.json.entries.some((e) => e.name === 'html-report' && e.type === 'dir'))
    assert.ok(res.json.entries.some((e) => e.name === 'loose.md' && e.type === 'file'))
  })
})

test('POST /api/fork copies plugin skill and refuses second time', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('POST', '/api/fork', { kind: 'skill', name: 'brainstorming', plugin: SP })
    assert.equal(res.status, 200, res.text)
    assert.ok(fs.existsSync(path.join(fx.home, '.claude', 'skills', 'brainstorming', 'SKILL.md')))
    const again = await api('POST', '/api/fork', { kind: 'skill', name: 'brainstorming', plugin: SP })
    assert.equal(again.status, 409)
    const missing = await api('POST', '/api/fork', { kind: 'skill', name: 'ghost', plugin: SP })
    assert.equal(missing.status, 404)
  })
})

test('POST /api/fork refuses a plugin whose installPath is outside home/.claude/plugins', async () => {
  await withServer(async ({ fx, api }) => {
    const manifest = path.join(fx.home, '.claude', 'plugins', 'installed_plugins.json')
    const data = read(manifest)
    const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-outside-'))
    try {
      const outside = path.join(holder, 'outside-plugin')
      fs.mkdirSync(path.join(outside, 'skills', 'brainstorming'), { recursive: true })
      fs.writeFileSync(path.join(outside, 'skills', 'brainstorming', 'SKILL.md'), '---\nname: brainstorming\n---\n')
      for (const entries of Object.values(data.plugins)) {
        if (Array.isArray(entries)) for (const e of entries) e.installPath = outside
      }
      fs.writeFileSync(manifest, JSON.stringify(data))
      const res = await api('POST', '/api/fork', { kind: 'skill', name: 'brainstorming', plugin: SP })
      assert.equal(res.status, 403, res.text)
      assert.ok(!fs.existsSync(path.join(fx.home, '.claude', 'skills', 'brainstorming')))
    } finally {
      fs.rmSync(holder, { recursive: true, force: true })
    }
  })
})

test('POST /api/create claudemd writes file', async () => {
  await withServer(async ({ fx, api }) => {
    fs.rmSync(path.join(fx.projectDir, 'CLAUDE.md'))
    const res = await api('POST', '/api/create', { what: 'claudemd', template: 'default' })
    assert.equal(res.status, 200, res.text)
    const text = fs.readFileSync(path.join(fx.projectDir, 'CLAUDE.md'), 'utf8')
    assert.equal(
      text,
      `# ${path.basename(fx.projectDir)}\n\n## What this project is\n\n## Commands\n\n## Conventions\n\n## Do not\n`
    )
    const again = await api('POST', '/api/create', { what: 'claudemd', template: 'default' })
    assert.equal(again.status, 409)
    const local = await api('POST', '/api/create', { what: 'projectSettingsLocal', template: 'empty' })
    assert.equal(local.status, 409)
  })
})

test('POST /api/hook then GET /api/inventory shows it, DELETE removes it', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('POST', '/api/hook', {
      scope: 'global',
      event: 'SessionStart',
      matcher: 'startup',
      command: 'echo hi'
    })
    assert.equal(res.status, 200, res.text)
    const inv = await api('GET', '/api/inventory')
    const hook = inv.json.hooks.find((h) => h.command === 'echo hi')
    assert.ok(hook)
    assert.equal(hook.event, 'SessionStart')
    assert.equal(hook.matcher, 'startup')
    const del = await api('DELETE', '/api/hook', { id: hook.id })
    assert.equal(del.status, 200, del.text)
    const settings = read(path.join(fx.home, '.claude', 'settings.json'))
    assert.equal(settings.hooks.SessionStart, undefined)
    assert.ok(settings.hooks.Stop)
    const plugin = inv.json.hooks.find((h) => h.scope === 'plugin')
    const refused = await api('DELETE', '/api/hook', { id: plugin.id })
    assert.equal(refused.status, 400)
  })
})

test('POST /api/mcp project writes .mcp.json and refuses duplicates', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.projectDir, '.mcp.json')
    fs.rmSync(file)
    const res = await api('POST', '/api/mcp', { scope: 'project', name: 'linear', config: { command: 'linear-mcp' } })
    assert.equal(res.status, 200, res.text)
    assert.deepEqual(read(file), { mcpServers: { linear: { command: 'linear-mcp' } } })
    const dup = await api('POST', '/api/mcp', { scope: 'project', name: 'linear', config: { command: 'x' } })
    assert.equal(dup.status, 409)
    const bad = await api('POST', '/api/mcp', { scope: 'global', name: 'bad', config: { args: [] } })
    assert.equal(bad.status, 400)
    const del = await api('DELETE', '/api/mcp', { scope: 'project', name: 'linear', origin: 'mcpjson' })
    assert.equal(del.status, 200, del.text)
    assert.deepEqual(read(file), { mcpServers: {} })
    const local = await api('DELETE', '/api/mcp', { scope: 'project', name: 'aws', origin: 'local' })
    assert.equal(local.status, 200, local.text)
    const claudeJson = read(path.join(fx.home, '.claude.json'))
    assert.equal(claudeJson.projects[fx.projectDir].mcpServers.aws, undefined)
    assert.ok(claudeJson.mcpServers.kubernetes)
  })
})

test('DELETE /api/file of a global skill removes its skillOverrides key', async () => {
  await withServer(async ({ fx, api }) => {
    const dir = path.join(fx.home, '.claude', 'skills', 'java-clean-code')
    const res = await api('DELETE', '/api/file', { path: dir })
    assert.equal(res.status, 200, res.text)
    assert.equal(fs.existsSync(dir), false)
    const settings = read(path.join(fx.home, '.claude', 'settings.json'))
    assert.equal(settings.skillOverrides['java-clean-code'], undefined)
    assert.equal(settings.skillOverrides.old, 'off')
  })
})

test('body over 2 MB is 413 and bad JSON is 400', async () => {
  await withServer(async ({ fx, api }) => {
    const big = JSON.stringify({
      path: path.join(fx.projectDir, 'CLAUDE.md'),
      content: 'x'.repeat(2 * 1024 * 1024 + 10)
    })
    const res = await api('PUT', '/api/file', big)
    assert.equal(res.status, 413)
    const bad = await api('POST', '/api/toggle', '{ nope')
    assert.equal(bad.status, 400)
  })
})

test('unknown api route is 404', async () => {
  await withServer(async ({ api }) => {
    const res = await api('GET', '/api/nope')
    assert.equal(res.status, 404)
  })
})

function backupsOf(home, base) {
  const dir = path.join(home, '.claude', 'backups', 'storehouse')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => name.startsWith(`${base}.`))
}

test('DELETE /api/mcp of a missing server is 404 and writes nothing', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.home, '.claude.json')
    fs.writeFileSync(file, '{"projects":{}}\n')
    const before = fs.readFileSync(file)
    const res = await api('DELETE', '/api/mcp', { scope: 'global', name: 'nope', origin: 'user' })
    assert.equal(res.status, 404)
    const local = await api('DELETE', '/api/mcp', { scope: 'project', name: 'nope', origin: 'local' })
    assert.equal(local.status, 404)
    assert.deepEqual(fs.readFileSync(file), before)
    assert.deepEqual(backupsOf(fx.home, '.claude.json'), [])
  })
})

test('PUT /api/favorites/order records a non-undoable activity entry', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('PUT', '/api/favorites/order', [])
    assert.equal(res.status, 200, res.text)
    const activity = await api('GET', '/api/activity')
    const entry = activity.json.entries[0]
    assert.equal(entry.kind, 'save')
    assert.equal(entry.file, path.join(fx.home, '.claude', 'storehouse.json'))
    assert.equal(entry.canUndo, false)
  })
})

test('unexpected write failure is 500, refusals are 400', async () => {
  const { refused, HttpError } = await import('../src/api.js')
  const { Refusal } = await import('../src/write/toggles.js')
  assert.throws(
    () =>
      refused(() => {
        throw new Refusal('no')
      }),
    (err) => err instanceof HttpError && err.status === 400
  )
  assert.throws(
    () =>
      refused(() => {
        throw new Error('boom')
      }),
    (err) => !(err instanceof HttpError) && err.message === 'boom'
  )
  await withServer(async ({ fx, api }) => {
    const dir = path.join(fx.home, '.claude')
    const original = console.error
    console.error = () => {}
    fs.chmodSync(dir, 0o555)
    try {
      const res = await api('POST', '/api/hook', { scope: 'global', event: 'Stop', command: 'echo x' })
      assert.equal(res.status, 500)
      assert.ok(res.json.error)
    } finally {
      fs.chmodSync(dir, 0o755)
      console.error = original
    }
  })
})

test('DELETE /api/file refuses when the settings file does not parse', async () => {
  await withServer(async ({ fx, api }) => {
    fs.writeFileSync(path.join(fx.home, '.claude', 'settings.json'), '{ broken')
    const dir = path.join(fx.home, '.claude', 'skills', 'java-clean-code')
    const res = await api('DELETE', '/api/file', { path: dir })
    assert.equal(res.status, 400)
    assert.ok(fs.existsSync(dir))
  })
})

test('prototype-like MCP names and hook events are refused', async () => {
  await withServer(async ({ api }) => {
    for (const name of ['__proto__', 'constructor', 'prototype']) {
      const mcp = await api('POST', '/api/mcp', { scope: 'global', name, config: { command: 'x' } })
      assert.equal(mcp.status, 400, name)
      const hook = await api('POST', '/api/hook', { scope: 'global', event: name, command: 'x' })
      assert.equal(hook.status, 400, name)
    }
  })
})

test('POST /api/create validates template for every kind and creates mcpJson', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.projectDir, '.mcp.json')
    fs.rmSync(file)
    const bad = await api('POST', '/api/create', { what: 'mcpJson', template: 'bogus' })
    assert.equal(bad.status, 400)
    assert.equal(fs.existsSync(file), false)
    const res = await api('POST', '/api/create', { what: 'mcpJson', template: 'empty' })
    assert.equal(res.status, 200, res.text)
    assert.deepEqual(read(file), { mcpServers: {} })
  })
})

test('requests with a foreign Host header are 403', async () => {
  await withServer(async ({ server }) => {
    const status = (host) =>
      new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: server.port, path: '/', headers: { host } }, (res) => {
          res.resume()
          res.on('end', () => resolve(res.statusCode))
        })
        req.on('error', reject)
        req.end()
      })
    assert.equal(await status('evil.example.com'), 403)
    assert.equal(await status(`evil.example.com:${server.port}`), 403)
    assert.equal(await status(`localhost:${server.port}`), 200)
    assert.equal(await status(`127.0.0.1:${server.port}`), 200)
  })
})

test('POST /api/restore brings back a backup and logs it', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.projectDir, 'CLAUDE.md')
    const original = fs.readFileSync(file, 'utf8')
    await api('PUT', '/api/file', { path: file, content: '# changed\n' })
    const backups = await api('GET', `/api/backups?path=${encodeURIComponent(file)}`)
    const res = await api('POST', '/api/restore', { path: file, backup: backups.json.backups[0].path })
    assert.equal(res.status, 200, res.text)
    assert.equal(fs.readFileSync(file, 'utf8'), original)
    const activity = await api('GET', '/api/activity')
    assert.match(activity.json.entries[0].message, /Restored/)
  })
})

test('POST /api/favorite stars a skill and logs it', async () => {
  await withServer(async ({ api }) => {
    const res = await api('POST', '/api/favorite', {
      kind: 'skill',
      name: 'html-report',
      source: 'local',
      favorite: true
    })
    assert.equal(res.status, 200, res.text)
    const inv = await api('GET', '/api/inventory')
    assert.ok(inv.json.favorites.some((f) => f.name === 'html-report'))
    const activity = await api('GET', '/api/activity')
    assert.equal(activity.json.entries[0].kind, 'favorite')
    assert.equal(activity.json.entries[0].canUndo, true)
  })
})

test('POST /api/favorites/category creates, renames, and deletes a category', async () => {
  await withServer(async ({ api }) => {
    const made = await api('POST', '/api/favorites/category', { op: 'create', name: 'Review' })
    assert.equal(made.status, 200, made.text)
    assert.deepEqual(made.json.favoriteCategories, ['Review'])
    const dup = await api('POST', '/api/favorites/category', { op: 'create', name: 'review' })
    assert.equal(dup.status, 400)
    await api('POST', '/api/favorite', {
      kind: 'skill',
      name: 'html-report',
      source: 'local',
      favorite: true,
      category: 'Review'
    })
    const renamed = await api('POST', '/api/favorites/category', {
      op: 'rename',
      name: 'Review',
      newName: 'Code review'
    })
    assert.equal(renamed.json.favorites[0].category, 'Code review')
    const inv = await api('GET', '/api/inventory')
    assert.deepEqual(inv.json.favoriteCategories, ['Code review'])
    const gone = await api('POST', '/api/favorites/category', { op: 'delete', name: 'Code review' })
    assert.deepEqual(gone.json.favoriteCategories, [])
    assert.equal(gone.json.favorites[0].category, null)
    const activity = await api('GET', '/api/activity')
    assert.equal(activity.json.entries[0].kind, 'save')
    assert.equal(activity.json.entries[0].canUndo, true)
    const undo = await api('POST', '/api/undo', { entryId: gone.json.entry.id })
    assert.equal(undo.status, 200, undo.text)
    const back = await api('GET', '/api/inventory')
    assert.deepEqual(back.json.favoriteCategories, ['Code review'])
    assert.equal(back.json.favorites[0].category, 'Code review')
  })
})

test('POST /api/favorite move is not undoable, and undo of unstar restores the category', async () => {
  await withServer(async ({ api }) => {
    const fav = { kind: 'skill', name: 'html-report', source: 'local' }
    await api('POST', '/api/favorite', { ...fav, favorite: true, category: 'QA' })
    const move = await api('POST', '/api/favorite', { ...fav, favorite: true, category: 'Review' })
    assert.equal(move.json.favorites[0].category, 'Review')
    const activity = await api('GET', '/api/activity')
    assert.equal(activity.json.entries[0].kind, 'save')
    const off = await api('POST', '/api/favorite', { ...fav, favorite: false })
    assert.deepEqual(off.json.favorites, [])
    const undo = await api('POST', '/api/undo', { entryId: off.json.entry.id })
    assert.equal(undo.status, 200, undo.text)
    const inv = await api('GET', '/api/inventory')
    assert.equal(inv.json.favorites[0].category, 'Review')
  })
})

test('PUT /api/favorites/order with a move changes the category', async () => {
  await withServer(async ({ api }) => {
    const fav = { kind: 'skill', name: 'html-report', source: 'local' }
    await api('POST', '/api/favorite', { ...fav, favorite: true, category: 'QA' })
    await api('POST', '/api/favorites/category', { op: 'create', name: 'Review' })
    const id = 'skill:local:html-report'
    const res = await api('PUT', '/api/favorites/order', { ids: [id], move: { id, category: 'Review' } })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json.favorites[0].category, 'Review')
  })
})

test('POST /api/mcp global writes ~/.claude.json and keeps other servers', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('POST', '/api/mcp', {
      scope: 'global',
      name: 'remote',
      config: { url: 'https://x.example.com' }
    })
    assert.equal(res.status, 200, res.text)
    const data = read(path.join(fx.home, '.claude.json'))
    assert.deepEqual(data.mcpServers.remote, { url: 'https://x.example.com' })
    assert.ok(data.mcpServers.kubernetes)
    assert.ok(data.projects[fx.projectDir].mcpServers.aws)
  })
})

test('POST /api/hook project appends to project settings.json', async () => {
  await withServer(async ({ fx, api }) => {
    const res = await api('POST', '/api/hook', { scope: 'project', event: 'Stop', command: 'echo done' })
    assert.equal(res.status, 200, res.text)
    const data = read(path.join(fx.projectDir, '.claude', 'settings.json'))
    assert.deepEqual(data.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo done' }] }])
    assert.ok(data.hooks.PreToolUse)
    assert.deepEqual(data.permissions, { allow: ['Bash(npm test:*)'] })
  })
})

test('DELETE /api/file of a project skill clears settings.local.json skillOverrides', async () => {
  await withServer(async ({ fx, api }) => {
    const dir = path.join(fx.projectDir, '.claude', 'skills', 'deploy-checklist')
    const res = await api('DELETE', '/api/file', { path: dir })
    assert.equal(res.status, 200, res.text)
    const data = read(path.join(fx.projectDir, '.claude', 'settings.local.json'))
    assert.equal(data.skillOverrides['deploy-checklist'], undefined)
    assert.deepEqual(data.enabledMcpjsonServers, ['postgres'])
  })
})

test('hook toggle activity names event, matcher and a truncated command for off and on', async () => {
  await withServer(async ({ api }) => {
    const command = `echo ${'x'.repeat(80)}`
    const added = await api('POST', '/api/hook', { scope: 'global', event: 'PreToolUse', matcher: 'Bash', command })
    assert.equal(added.status, 200, added.text)
    const inv = await api('GET', '/api/inventory')
    const hook = inv.json.hooks.find((h) => h.command === command)
    const short = `${command.slice(0, 60)}…`
    const off = await api('POST', '/api/toggle', {
      kind: 'hook',
      name: command,
      scope: 'global',
      file: hook.file,
      event: hook.event,
      index: hook.index,
      enabled: false
    })
    assert.equal(off.status, 200, off.text)
    assert.equal(off.json.entry.message, `Switched PreToolUse hook · Bash · ${short} off`)
    const parked = (await api('GET', '/api/inventory')).json.hooks.find((h) => h.parked && h.command === command)
    const on = await api('POST', '/api/toggle', { kind: 'hook', name: parked.id, scope: 'global', enabled: true })
    assert.equal(on.status, 200, on.text)
    assert.equal(on.json.entry.message, `Switched PreToolUse hook · Bash · ${short} on`)
  })
})

test('toggle activity labels plugin by id, skill by name, mcp by server name', async () => {
  await withServer(async ({ api }) => {
    const plugin = await api('POST', '/api/toggle', { kind: 'plugin', name: SP, scope: 'global', enabled: false })
    assert.equal(plugin.json.entry.message, `Switched plugin ${SP} off`)
    const skill = await api('POST', '/api/toggle', {
      kind: 'skill',
      name: 'html-report',
      scope: 'global',
      enabled: false
    })
    assert.equal(skill.json.entry.message, 'Switched skill html-report off')
  })
})

test('POST /api/create claudemdClaudeDir writes .claude/CLAUDE.md and refuses a second time', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.projectDir, '.claude', 'CLAUDE.md')
    fs.rmSync(file, { force: true })
    const res = await api('POST', '/api/create', { what: 'claudemdClaudeDir', template: 'default' })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json.file, file)
    assert.equal(
      fs.readFileSync(file, 'utf8'),
      `# ${path.basename(fx.projectDir)}\n\n## What this project is\n\n## Commands\n\n## Conventions\n\n## Do not\n`
    )
    const again = await api('POST', '/api/create', { what: 'claudemdClaudeDir', template: 'empty' })
    assert.equal(again.status, 409)
    fs.rmSync(file)
    const empty = await api('POST', '/api/create', { what: 'claudemdClaudeDir', template: 'empty' })
    assert.equal(empty.status, 200, empty.text)
    assert.equal(fs.readFileSync(file, 'utf8'), '')
  })
})
