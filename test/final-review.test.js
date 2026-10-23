import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from './helpers/fixture.js'
import { startServer } from '../src/server.js'
import { writeText, deleteToTrash } from '../src/write/files.js'
import { writeJsonAtomic, restoreBackup, listBackups } from '../src/write/json-file.js'
import { isAllowed, projectScope } from '../src/write/paths.js'
import { toggle } from '../src/write/toggles.js'
import { scanAll } from '../src/scan/index.js'
import { scanSettings } from '../src/scan/settings.js'

const TOKEN = crypto.randomBytes(16).toString('hex')

function mode(file) {
  return fs.statSync(file).mode & 0o7777
}

async function withServer(fn, { project = true } = {}) {
  const fx = makeFixture()
  const projectDir = project ? fx.projectDir : null
  const server = await startServer({ home: fx.home, projectDir, port: 0, token: TOKEN })
  const base = `http://127.0.0.1:${server.port}`
  const api = async (method, route, body) => {
    const init = { method, headers: { 'x-storehouse-token': TOKEN } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const res = await fetch(base + route, init)
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, json, headers: res.headers }
  }
  try {
    await fn({ fx, base, api })
  } finally {
    await server.close()
    fx.cleanup()
  }
}

test('C1 writeText keeps 0600 and 0755 modes', () => {
  const fx = makeFixture()
  try {
    const ctx = { home: fx.home, projectDir: fx.projectDir }
    const secret = path.join(fx.home, '.claude.json')
    const script = path.join(fx.home, '.claude', 'hooks', 'a.sh')
    fs.mkdirSync(path.dirname(script), { recursive: true })
    fs.writeFileSync(script, '#!/bin/sh\n')
    fs.chmodSync(secret, 0o600)
    fs.chmodSync(script, 0o755)
    assert.equal(writeText(secret, '{}\n', ctx).ok, true)
    assert.equal(writeText(script, '#!/bin/sh\necho hi\n', ctx).ok, true)
    assert.equal(mode(secret), 0o600)
    assert.equal(mode(script), 0o755)
  } finally {
    fx.cleanup()
  }
})

test('C1 a JSON toggle keeps the 0600 mode of ~/.claude.json and settings.json', () => {
  const fx = makeFixture()
  try {
    const ctx = { home: fx.home, projectDir: fx.projectDir }
    const claudeJson = path.join(fx.home, '.claude.json')
    const settings = path.join(fx.home, '.claude', 'settings.json')
    fs.chmodSync(claudeJson, 0o600)
    fs.chmodSync(settings, 0o600)
    const inv = scanAll(ctx)
    const global = inv.mcp.find((m) => m.origin === 'user')
    assert.ok(global, 'fixture has a global MCP server')
    assert.equal(
      toggle({ kind: 'mcp', name: global.name, scope: 'global', origin: 'user', enabled: false }, ctx).ok,
      true
    )
    assert.equal(toggle({ kind: 'skill', name: 'html-report', scope: 'global', enabled: false }, ctx).ok, true)
    assert.equal(mode(claudeJson), 0o600)
    assert.equal(mode(settings), 0o600)
  } finally {
    fx.cleanup()
  }
})

test('C1 a new ~/.claude.json is created with mode 0600', () => {
  const fx = makeFixture()
  try {
    const claudeJson = path.join(fx.home, '.claude.json')
    fs.rmSync(claudeJson)
    writeJsonAtomic(claudeJson, {}, fx.home)
    assert.equal(mode(claudeJson), 0o600)
  } finally {
    fx.cleanup()
  }
})

test('C1 restoreBackup keeps the 0600 mode', () => {
  const fx = makeFixture()
  try {
    const ctx = { home: fx.home, projectDir: fx.projectDir }
    const claudeJson = path.join(fx.home, '.claude.json')
    fs.chmodSync(claudeJson, 0o600)
    writeText(claudeJson, '{"a":1}\n', ctx)
    const [backup] = listBackups(claudeJson, fx.home)
    fs.chmodSync(backup, 0o644)
    assert.equal(restoreBackup(backup, claudeJson, fx.home, ctx).ok, true)
    assert.equal(mode(claudeJson), 0o600)
  } finally {
    fx.cleanup()
  }
})

test('C1 PUT /api/file and POST /api/restore keep 0755 and 0600 modes', async () => {
  await withServer(async ({ fx, api }) => {
    const script = path.join(fx.home, '.claude', 'hooks', 'b.sh')
    fs.mkdirSync(path.dirname(script), { recursive: true })
    fs.writeFileSync(script, '#!/bin/sh\n')
    fs.chmodSync(script, 0o755)
    const put = await api('PUT', '/api/file', { path: script, content: '#!/bin/sh\necho 1\n' })
    assert.equal(put.status, 200)
    assert.equal(mode(script), 0o755)
    const claudeJson = path.join(fx.home, '.claude.json')
    fs.chmodSync(claudeJson, 0o600)
    const put2 = await api('PUT', '/api/file', { path: claudeJson, content: '{}\n' })
    assert.equal(put2.status, 200)
    assert.equal(mode(claudeJson), 0o600)
    const restore = await api('POST', '/api/restore', { path: claudeJson, backup: put2.json.backup })
    assert.equal(restore.status, 200)
    assert.equal(mode(claudeJson), 0o600)
  })
})

test('I1 GET /api/file returns a stamp and PUT with a stale stamp answers 409', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.home, '.claude', 'CLAUDE.md')
    const got = await api('GET', `/api/file?path=${encodeURIComponent(file)}`)
    assert.equal(got.status, 200)
    const stat = fs.statSync(file)
    assert.equal(got.json.stamp, `${stat.mtimeMs}:${stat.size}`)
    fs.writeFileSync(file, 'changed by someone else, longer text\n')
    const stale = await api('PUT', '/api/file', { path: file, content: 'mine\n', stamp: got.json.stamp })
    assert.equal(stale.status, 409)
    assert.match(stale.json.error, /changed on disk/)
    const now = fs.statSync(file)
    assert.equal(stale.json.stamp, `${now.mtimeMs}:${now.size}`)
    assert.equal(fs.readFileSync(file, 'utf8'), 'changed by someone else, longer text\n')
    const fresh = await api('PUT', '/api/file', { path: file, content: 'mine\n', stamp: stale.json.stamp })
    assert.equal(fresh.status, 200)
    const after = fs.statSync(file)
    assert.equal(fresh.json.stamp, `${after.mtimeMs}:${after.size}`)
    assert.equal(fs.readFileSync(file, 'utf8'), 'mine\n')
  })
})

test('I1 PUT without a stamp keeps the old behavior', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.home, '.claude', 'CLAUDE.md')
    const put = await api('PUT', '/api/file', { path: file, content: 'x\n' })
    assert.equal(put.status, 200)
  })
})

test('I1 PUT with a stamp for a file that is gone answers 409', async () => {
  await withServer(async ({ fx, api }) => {
    const file = path.join(fx.home, '.claude', 'CLAUDE.md')
    const got = await api('GET', `/api/file?path=${encodeURIComponent(file)}`)
    fs.rmSync(file)
    const put = await api('PUT', '/api/file', { path: file, content: 'x\n', stamp: got.json.stamp })
    assert.equal(put.status, 409)
    assert.equal(put.json.stamp, null)
  })
})

test('I2 deleting a loose project skill trashes only that file', async () => {
  await withServer(async ({ fx, api }) => {
    const skills = path.join(fx.projectDir, '.claude', 'skills')
    const loose = path.join(skills, 'loose-p.md')
    fs.writeFileSync(loose, '---\nname: loose-p\ndescription: x\n---\n')
    const res = await api('DELETE', '/api/file', { path: loose })
    assert.equal(res.status, 200)
    assert.equal(fs.existsSync(loose), false)
    assert.equal(fs.existsSync(path.join(skills, 'deploy-checklist', 'SKILL.md')), true)
  })
})

test('I2 deleting the container folders is refused for both roots', () => {
  const fx = makeFixture()
  try {
    const ctx = { home: fx.home, projectDir: fx.projectDir }
    for (const root of [fx.home, fx.projectDir]) {
      for (const name of ['skills', 'agents', 'hooks', 'plugins']) {
        const dir = path.join(root, '.claude', name)
        fs.mkdirSync(dir, { recursive: true })
        const res = deleteToTrash(dir, ctx)
        assert.equal(res.ok, false, dir)
        assert.match(res.error, /protected/)
        assert.equal(fs.existsSync(dir), true)
      }
    }
  } finally {
    fx.cleanup()
  }
})

test('I2 DELETE /api/file of projectDir/.claude/skills is refused', async () => {
  await withServer(async ({ fx, api }) => {
    const dir = path.join(fx.projectDir, '.claude', 'skills')
    const res = await api('DELETE', '/api/file', { path: dir })
    assert.equal(res.status, 400)
    assert.equal(fs.existsSync(path.join(dir, 'deploy-checklist', 'SKILL.md')), true)
  })
})

test('I3 projectScope turns off the project for home, an ancestor of home, and /', () => {
  const fx = makeFixture()
  try {
    assert.equal(projectScope(fx.home, fx.home), null)
    assert.equal(projectScope(fx.home, path.dirname(fx.home)), null)
    assert.equal(projectScope(fx.home, '/'), null)
    assert.equal(projectScope(fx.home, fx.projectDir), fx.projectDir)
    assert.equal(projectScope(fx.home, path.join(fx.home, 'code', 'app')), path.join(fx.home, 'code', 'app'))
  } finally {
    fx.cleanup()
  }
})

test('I3 isAllowed refuses ~/.ssh when projectDir is home', () => {
  const fx = makeFixture()
  try {
    for (const projectDir of [fx.home, path.dirname(fx.home), '/', null]) {
      const ctx = { home: fx.home, projectDir }
      assert.equal(isAllowed(path.join(fx.home, '.ssh', 'id_rsa'), ctx).allowed, false, String(projectDir))
      assert.equal(isAllowed(path.join(fx.home, '.zshrc'), ctx).allowed, false)
      assert.equal(isAllowed(path.join(fx.home, '.claude', 'settings.json'), ctx).allowed, true)
      assert.equal(isAllowed(path.join(fx.home, '.claude.json'), ctx).allowed, true)
    }
  } finally {
    fx.cleanup()
  }
})

test('I3 scanAll with projectDir null lists only global and plugin items', () => {
  const fx = makeFixture()
  try {
    const inv = scanAll({ home: fx.home, projectDir: null })
    assert.deepEqual(inv.errors, [])
    assert.equal(inv.project.dir, null)
    assert.equal(inv.project.hasClaudeDir, false)
    assert.ok(inv.skills.length > 0)
    for (const list of [inv.skills, inv.agents, inv.hooks, inv.mcp]) {
      assert.equal(
        list.some((item) => item.scope === 'project'),
        false
      )
    }
    assert.equal(inv.settings.project, undefined)
    assert.equal(inv.settings.projectLocal, undefined)
    assert.equal(inv.claudeMd.project, null)
    assert.equal(inv.claudeMd.projectLocal, null)
    assert.equal(inv.claudeMd.projectClaudeDir, null)
    assert.equal(inv.claudeMd.global.exists, true)
    assert.equal(
      inv.mcp.every((m) => m.canToggle === false),
      true
    )
  } finally {
    fx.cleanup()
  }
})

test('I3 project routes answer 400 when project scope is off', async () => {
  await withServer(
    async ({ fx, api }) => {
      const inv = await api('GET', '/api/inventory')
      assert.equal(inv.status, 200)
      assert.equal(inv.json.project.dir, null)
      const cases = [
        ['POST', '/api/toggle', { kind: 'skill', name: 'deploy-checklist', scope: 'project', enabled: false }],
        ['POST', '/api/toggle', { kind: 'mcp', name: 'postgres', scope: 'project', origin: 'mcpjson', enabled: false }],
        [
          'POST',
          '/api/toggle',
          { kind: 'plugin', name: 'superpowers@claude-plugins-official', scope: 'project', enabled: false }
        ],
        ['POST', '/api/create', { what: 'claudemd', template: 'default' }],
        ['POST', '/api/create', { what: 'projectSettingsLocal', template: 'empty' }],
        ['POST', '/api/mcp', { scope: 'project', name: 'x', config: { command: 'x' } }],
        ['POST', '/api/hook', { scope: 'project', event: 'Stop', command: 'echo x' }]
      ]
      for (const [method, route, body] of cases) {
        const res = await api(method, route, body)
        assert.equal(res.status, 400, `${route} ${JSON.stringify(body)}`)
      }
      const global = inv.json.mcp.find((m) => m.origin === 'user')
      const mcpOff = await api('POST', '/api/toggle', {
        kind: 'mcp',
        name: global.name,
        scope: 'global',
        origin: 'user',
        enabled: false
      })
      assert.equal(mcpOff.status, 400)
      const skillOff = await api('POST', '/api/toggle', {
        kind: 'skill',
        name: 'html-report',
        scope: 'global',
        enabled: false
      })
      assert.equal(skillOff.status, 200)
      assert.equal(fs.existsSync(path.join(fx.home, '.claude', 'settings.local.json')), false)
    },
    { project: false }
  )
})

test('I3 server started with projectDir home runs in global-only mode', async () => {
  const fx = makeFixture()
  const server = await startServer({ home: fx.home, projectDir: fx.home, port: 0, token: TOKEN })
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/file?path=${encodeURIComponent(path.join(fx.home, '.zshrc'))}`,
      {
        headers: { 'x-storehouse-token': TOKEN }
      }
    )
    assert.equal(res.status, 403)
    const inv = await (
      await fetch(`http://127.0.0.1:${server.port}/api/inventory`, { headers: { 'x-storehouse-token': TOKEN } })
    ).json()
    assert.equal(inv.project.dir, null)
  } finally {
    await server.close()
    fx.cleanup()
  }
})

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}

function mcpjsonState(fx) {
  const inv = scanAll({ home: fx.home, projectDir: fx.projectDir })
  return Object.fromEntries(inv.mcp.filter((m) => m.origin === 'mcpjson').map((m) => [m.name, m.enabled]))
}

test('I4 .mcp.json lists merge across global, project and projectLocal settings; disabled wins', () => {
  const fx = makeFixture()
  try {
    writeJson(path.join(fx.projectDir, '.mcp.json'), {
      mcpServers: {
        postgres: { command: 'a' },
        redis: { command: 'b' },
        linear: { command: 'c' },
        jira: { command: 'd' }
      }
    })
    const globalFile = path.join(fx.home, '.claude', 'settings.json')
    const global = JSON.parse(fs.readFileSync(globalFile, 'utf8'))
    writeJson(globalFile, { ...global, enabledMcpjsonServers: ['linear', 'jira'] })
    writeJson(path.join(fx.projectDir, '.claude', 'settings.json'), { disabledMcpjsonServers: ['jira'] })
    assert.deepEqual(mcpjsonState(fx), { postgres: true, redis: false, linear: true, jira: false })
    const lists = scanSettings({ home: fx.home, projectDir: fx.projectDir }).mcpJsonLists
    assert.deepEqual([...lists.enabled].sort(), ['jira', 'linear', 'postgres'])
    assert.deepEqual([...lists.disabled].sort(), ['jira', 'redis'])
  } finally {
    fx.cleanup()
  }
})

test('I4 enableAllProjectMcpServers turns on every .mcp.json server that is not disabled', () => {
  const fx = makeFixture()
  try {
    writeJson(path.join(fx.projectDir, '.mcp.json'), {
      mcpServers: { postgres: { command: 'a' }, redis: { command: 'b' }, linear: { command: 'c' } }
    })
    writeJson(path.join(fx.projectDir, '.claude', 'settings.json'), { enableAllProjectMcpServers: true })
    assert.deepEqual(mcpjsonState(fx), { postgres: true, redis: false, linear: true })
  } finally {
    fx.cleanup()
  }
})

test('I4 the switch still writes settings.local.json', () => {
  const fx = makeFixture()
  try {
    const ctx = { home: fx.home, projectDir: fx.projectDir }
    writeJson(path.join(fx.projectDir, '.claude', 'settings.json'), { enableAllProjectMcpServers: true })
    const res = toggle({ kind: 'mcp', name: 'postgres', scope: 'project', origin: 'mcpjson', enabled: false }, ctx)
    assert.equal(res.ok, true)
    assert.equal(res.file, path.join(fx.projectDir, '.claude', 'settings.local.json'))
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fx.projectDir, '.claude', 'settings.json'), 'utf8')), {
      enableAllProjectMcpServers: true
    })
    assert.equal(mcpjsonState(fx).postgres, false)
  } finally {
    fx.cleanup()
  }
})

test('M3 DELETE of a loose global skill is refused before trashing when settings.json is not an object', async () => {
  await withServer(async ({ fx, api }) => {
    const settings = path.join(fx.home, '.claude', 'settings.json')
    fs.writeFileSync(settings, '[]\n')
    const loose = path.join(fx.home, '.claude', 'skills', 'loose.md')
    const res = await api('DELETE', '/api/file', { path: loose })
    assert.equal(res.status, 400)
    assert.match(res.json.error, /not .*object|JSON object/)
    assert.equal(fs.existsSync(loose), true)
  })
})

test('M4 the global CLAUDE.md template heading is "Global Claude instructions"', async () => {
  await withServer(async ({ fx, api }) => {
    fs.rmSync(path.join(fx.home, '.claude', 'CLAUDE.md'))
    const res = await api('POST', '/api/create', { what: 'globalClaudemd', template: 'default' })
    assert.equal(res.status, 200)
    assert.match(fs.readFileSync(path.join(fx.home, '.claude', 'CLAUDE.md'), 'utf8'), /^# Global Claude instructions\n/)
    const proj = await api('POST', '/api/create', { what: 'claudemd', template: 'default' })
    assert.equal(proj.status, 409)
  })
})

test('M7 every response has nosniff and HTML has a CSP', async () => {
  await withServer(async ({ base, api }) => {
    const html = await fetch(`${base}/`)
    assert.equal(html.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(
      html.headers.get('content-security-policy'),
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    )
    const js = await fetch(`${base}/app.js`)
    assert.equal(js.headers.get('x-content-type-options'), 'nosniff')
    const missing = await fetch(`${base}/nope.txt`)
    assert.equal(missing.headers.get('x-content-type-options'), 'nosniff')
    const inv = await api('GET', '/api/inventory')
    assert.equal(inv.headers.get('x-content-type-options'), 'nosniff')
    const unauth = await fetch(`${base}/api/inventory`)
    assert.equal(unauth.headers.get('x-content-type-options'), 'nosniff')
  })
})
