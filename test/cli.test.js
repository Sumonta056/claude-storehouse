import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeFixture } from './helpers/fixture.js'

const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'storehouse.js')

function waitForRunning(child) {
  return new Promise((resolve, reject) => {
    let out = ''
    const timer = setTimeout(() => reject(new Error(`no start line, got: ${out}`)), 10000)
    child.stdout.on('data', (chunk) => {
      out += chunk
      const match = out.includes('Press Ctrl+C') && out.match(/running at (http:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve({ url: new URL(match[1]), out })
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`exited ${code} before start: ${out}`))
    })
  })
}

test('starts, serves inventory with token, exits 0 on SIGINT', async () => {
  const fx = makeFixture()
  const child = spawn(process.execPath, [bin, '--dir', fx.projectDir, '--home', fx.home, '--no-open', '--port', '0'])
  try {
    const { url, out } = await waitForRunning(child)
    assert.match(out, /Project: /)
    assert.match(out, /Global:  .*\.claude/)
    assert.match(out, /Press Ctrl\+C to stop\./)
    const token = url.searchParams.get('token')
    assert.match(token, /^[0-9a-f]{32}$/)
    const res = await fetch(`${url.origin}/api/inventory`, { headers: { 'x-storehouse-token': token } })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.ok(Array.isArray(body.skills))
    const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)))
    child.kill('SIGINT')
    assert.equal(await exited, 0)
  } finally {
    child.kill('SIGKILL')
  }
})

test('--help exits 0', () => {
  const res = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })
  assert.equal(res.status, 0)
  assert.match(res.stdout, /--dir/)
})

test('--version prints package version', () => {
  const res = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
  assert.equal(res.status, 0)
  assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+/)
})

test('missing --dir exits 1', () => {
  const fx = makeFixture()
  const res = spawnSync(process.execPath, [bin, '--dir', path.join(fx.projectDir, 'nope'), '--home', fx.home, '--no-open'], { encoding: 'utf8' })
  assert.equal(res.status, 1)
  assert.match(res.stderr, /nope/)
})

test('missing home/.claude exits 1', () => {
  const fx = makeFixture()
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-empty-'))
  const res = spawnSync(process.execPath, [bin, '--dir', fx.projectDir, '--home', emptyHome, '--no-open'], { encoding: 'utf8', timeout: 10000 })
  assert.equal(res.status, 1)
  assert.match(res.stderr, /No Claude Code config found at .*\.claude/)
})

test('invalid --port exits 1', () => {
  const fx = makeFixture()
  for (const port of ['abc', '70000', '-1', '80x']) {
    const res = spawnSync(process.execPath, [bin, '--dir', fx.projectDir, '--home', fx.home, '--no-open', `--port=${port}`], { encoding: 'utf8', timeout: 10000 })
    assert.equal(res.status, 1, port)
    assert.match(res.stderr, /Invalid port/)
  }
})

test('--dir that is a file exits 1', () => {
  const fx = makeFixture()
  const file = path.join(fx.projectDir, 'file.txt')
  fs.writeFileSync(file, 'x')
  const res = spawnSync(process.execPath, [bin, '--dir', file, '--home', fx.home, '--no-open'], { encoding: 'utf8', timeout: 10000 })
  assert.equal(res.status, 1)
  assert.match(res.stderr, /not a directory/)
})

test('busy port exits 1 with message', async () => {
  const fx = makeFixture()
  const blocker = net.createServer()
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve))
  const port = blocker.address().port
  try {
    const child = spawn(process.execPath, [bin, '--dir', fx.projectDir, '--home', fx.home, '--no-open', '--port', String(port)])
    let err = ''
    child.stderr.on('data', (c) => (err += c))
    const code = await new Promise((resolve) => child.on('exit', resolve))
    assert.equal(code, 1)
    assert.match(err, new RegExp(`Port ${port} is in use`))
  } finally {
    blocker.close()
  }
})

async function startedOutput(args, options) {
  const child = spawn(process.execPath, [bin, ...args, '--no-open', '--port', '0'], options)
  try {
    const { url, out } = await waitForRunning(child)
    const token = url.searchParams.get('token')
    const inv = await (await fetch(`${url.origin}/api/inventory`, { headers: { 'x-storehouse-token': token } })).json()
    return { out, inv }
  } finally {
    child.kill('SIGKILL')
  }
}

test('run from the home folder starts in global-only mode', async () => {
  const fx = makeFixture()
  try {
    const { out, inv } = await startedOutput(['--home', fx.home], { cwd: fx.home })
    assert.match(out, /Started from your home folder — project scope is off\. Run it inside a project folder\./)
    assert.match(out, /Project: off/)
    assert.equal(inv.project.dir, null)
  } finally {
    fx.cleanup()
  }
})

test('--dir that is an ancestor of home starts in global-only mode', async () => {
  const fx = makeFixture()
  try {
    const { out, inv } = await startedOutput(['--dir', path.dirname(fx.home), '--home', fx.home])
    assert.match(out, /project scope is off/)
    assert.equal(inv.project.dir, null)
  } finally {
    fx.cleanup()
  }
})
