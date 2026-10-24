#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../src/server.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '_site'))
const DEMO_HOME = '/Users/demo'

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name)) continue
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

function walk(dir, out = []) {
  out.push(dir)
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (!entry.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

async function record() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-site-')))
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'demo-home.js'), tmp], { stdio: 'ignore' })
  const home = path.join(tmp, 'home')
  const token = crypto.randomBytes(16).toString('hex')
  const server = await startServer({ home, projectDir: path.join(home, 'acme-api'), token })
  const get = async (route) => {
    const res = await fetch(`http://127.0.0.1:${server.port}${route}`, { headers: { 'x-storehouse-token': token } })
    return res.ok ? res.json() : null
  }
  try {
    const files = {}
    for (const file of [...walk(home), path.join(home, '.claude.json')]) {
      const res = await get(`/api/file?path=${encodeURIComponent(file)}`)
      if (res) files[file] = res
    }
    const data = {
      home,
      inventory: await get('/api/inventory'),
      usage: await get('/api/usage'),
      doctor: await get('/api/doctor'),
      store: JSON.parse(fs.readFileSync(path.join(home, '.claude', 'storehouse.json'), 'utf8')),
      files
    }
    return JSON.stringify(data).replaceAll(home, DEMO_HOME)
  } finally {
    await server.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function buildDemo(dir, data) {
  copyDir(path.join(ROOT, 'public'), dir)
  copyDir(path.join(ROOT, 'site', 'demo'), dir)
  fs.writeFileSync(path.join(dir, 'demo-data.json'), data)
  const page = path.join(dir, 'index.html')
  const html = fs
    .readFileSync(page, 'utf8')
    .replace('<head>', '<head>\n    <meta name="robots" content="noindex" />')
    .replace(
      '<script type="module" src="app.js">',
      '<script src="demo-api.js"></script>\n    <script type="module" src="app.js">'
    )
  if (!html.includes('demo-api.js')) throw new Error('could not inject demo-api.js into public/index.html')
  fs.writeFileSync(page, html)
}

fs.rmSync(OUT, { recursive: true, force: true })
copyDir(path.join(ROOT, 'site'), OUT, (name) => name === 'build.js' || name === 'demo')
copyDir(path.join(ROOT, 'docs', 'images'), path.join(OUT, 'screenshots'))
fs.copyFileSync(path.join(ROOT, 'public', 'icon.svg'), path.join(OUT, 'icon.svg'))
buildDemo(path.join(OUT, 'demo'), await record())
console.log(`Built ${OUT}`)
