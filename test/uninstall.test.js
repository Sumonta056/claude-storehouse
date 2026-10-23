import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { makeFixture } from './helpers/fixture.js'
import { startServer } from '../src/server.js'

const TOKEN = crypto.randomBytes(16).toString('hex')
const SP = 'superpowers@claude-plugins-official'

async function withServer(runClaude, fn) {
  const fx = makeFixture()
  const calls = []
  const runner = async (args, opts) => {
    calls.push({ args, opts })
    return runClaude(args, opts)
  }
  const server = await startServer({
    home: fx.home,
    projectDir: fx.projectDir,
    port: 0,
    token: TOKEN,
    runClaude: runner
  })
  const api = async (method, route, body) => {
    const res = await fetch(`http://127.0.0.1:${server.port}${route}`, {
      method,
      headers: { 'x-storehouse-token': TOKEN, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: res.status, json: await res.json() }
  }
  try {
    await fn({ fx, api, calls })
  } finally {
    await server.close()
    fx.cleanup()
  }
}

const success = async () => ({ stdout: 'ok', stderr: '' })

test('uninstall of a user plugin runs the claude CLI inside the storehouse home', async () => {
  await withServer(success, async ({ fx, api, calls }) => {
    const res = await api('POST', '/api/plugin/uninstall', { id: SP })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].args, ['plugin', 'uninstall', SP, '--scope', 'user'])
    assert.equal(calls[0].opts.env.HOME, fx.home)
    assert.equal(calls[0].opts.env.CLAUDE_CONFIG_DIR, path.join(fx.home, '.claude'))
    const activity = await api('GET', '/api/activity')
    assert.ok(activity.json.entries.some((e) => e.message === `Uninstalled plugin ${SP}`))
  })
})

test('uninstall of a project plugin passes its scope and runs in the project folder', async () => {
  await withServer(success, async ({ fx, api, calls }) => {
    const res = await api('POST', '/api/plugin/uninstall', { id: 'code-review@claude-plugins-official' })
    assert.equal(res.status, 200)
    assert.deepEqual(calls[0].args, [
      'plugin',
      'uninstall',
      'code-review@claude-plugins-official',
      '--scope',
      'project'
    ])
    assert.equal(calls[0].opts.cwd, fx.projectDir)
  })
})

test('uninstall works for a plugin whose folder is missing', async () => {
  await withServer(success, async ({ api, calls }) => {
    const res = await api('POST', '/api/plugin/uninstall', { id: 'ghost@x' })
    assert.equal(res.status, 200)
    assert.equal(calls[0].args[2], 'ghost@x')
  })
})

test('uninstall refuses an unknown plugin and a missing id without running the CLI', async () => {
  await withServer(success, async ({ api, calls }) => {
    assert.equal((await api('POST', '/api/plugin/uninstall', { id: 'nope@nowhere' })).status, 404)
    assert.equal((await api('POST', '/api/plugin/uninstall', {})).status, 400)
    assert.equal(calls.length, 0)
  })
})

test('uninstall says how to run it by hand when the claude CLI is not on PATH', async () => {
  const missing = async () => {
    throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' })
  }
  await withServer(missing, async ({ api }) => {
    const res = await api('POST', '/api/plugin/uninstall', { id: SP })
    assert.equal(res.status, 400)
    assert.match(res.json.error, /claude CLI not found/)
    assert.match(res.json.error, new RegExp(`claude plugin uninstall ${SP}`))
  })
})

test('uninstall reports the CLI error text when the CLI fails', async () => {
  const fails = async () => {
    throw Object.assign(new Error('Command failed'), { code: 1, stderr: 'Plugin is locked\n' })
  }
  await withServer(fails, async ({ api }) => {
    const res = await api('POST', '/api/plugin/uninstall', { id: SP })
    assert.equal(res.status, 400)
    assert.match(res.json.error, /Plugin is locked/)
  })
})
