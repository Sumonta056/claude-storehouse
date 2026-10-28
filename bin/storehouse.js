#!/usr/bin/env node
import { parseArgs } from 'node:util'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import open from 'open'
import { startServer } from '../src/server.js'
import { projectScope } from '../src/write/paths.js'
import { scanUsage } from '../src/scan/usage.js'

const USAGE = `Usage: claude-storehouse [options]

Options:
  --dir <path>    Project folder to manage (default: current folder)
  --home <path>   Home folder that holds .claude (default: your home folder)
  --port <n>      Port to listen on (default: a free port)
  --no-open       Do not open the browser
  --help          Show this help
  --version       Show the version
`

function fail(message) {
  console.error(message)
  process.exit(1)
}

let values
try {
  ;({ values } = parseArgs({
    options: {
      dir: { type: 'string' },
      home: { type: 'string' },
      port: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      version: { type: 'boolean', default: false }
    }
  }))
} catch (err) {
  console.error(err.message)
  console.error(USAGE)
  process.exit(1)
}

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

if (values.version) {
  const pkgPath = new URL('../package.json', import.meta.url)
  console.log(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version)
  process.exit(0)
}

if (values.port !== undefined && !/^\d+$/.test(values.port)) fail(`Invalid port: ${values.port}`)
const port = values.port === undefined ? 0 : Number.parseInt(values.port, 10)
if (port > 65535) fail(`Invalid port: ${values.port}`)

function resolveDir(input, label) {
  try {
    const real = fs.realpathSync(path.resolve(input))
    if (!fs.statSync(real).isDirectory()) return fail(`${label} is not a directory: ${real}`)
    return real
  } catch {
    return fail(`${label} does not exist: ${path.resolve(input)}`)
  }
}

const home = resolveDir(values.home || os.homedir(), 'Home folder')
const projectDir = projectScope(home, resolveDir(values.dir || process.cwd(), 'Project folder'))
const claudeDir = path.join(home, '.claude')
if (!fs.existsSync(claudeDir)) fail(`No Claude Code config found at ${claudeDir}`)

const token = crypto.randomBytes(16).toString('hex')

let server
try {
  server = await startServer({ home, projectDir, port, token })
} catch (err) {
  if (err.code === 'EADDRINUSE') fail(`Port ${port} is in use`)
  fail(err.message)
}
scanUsage({ home }).catch(() => {})

console.log(`Claude Storehouse running at ${server.url}`)
if (projectDir) console.log(`Project: ${projectDir}`)
else {
  console.log('Project: off')
  console.log('Started from your home folder — project scope is off. Run it inside a project folder.')
}
console.log(`Global:  ${claudeDir}`)
console.log('Press Ctrl+C to stop.')

if (!values['no-open']) {
  try {
    const child = await open(server.url)
    child?.on?.('error', () => {})
  } catch {}
}

async function shutdown() {
  await server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
