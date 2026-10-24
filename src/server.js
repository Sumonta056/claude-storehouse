import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Activity } from './write/activity.js'
import * as api from './api.js'
import * as config from './api-config.js'
import { projectScope } from './write/paths.js'

const { HttpError } = api

const ROUTES = {
  'GET /api/inventory': api.getInventory,
  'GET /api/usage': api.getUsage,
  'GET /api/doctor': api.getDoctor,
  'GET /api/file': api.getFile,
  'PUT /api/file': api.putFile,
  'DELETE /api/file': api.deleteFile,
  'POST /api/toggle': api.postToggle,
  'POST /api/favorite': api.postFavorite,
  'PUT /api/favorites/order': api.putFavoritesOrder,
  'POST /api/favorites/category': api.postFavoriteCategory,
  'POST /api/hook': config.postHook,
  'DELETE /api/hook': config.deleteHook,
  'POST /api/mcp': config.postMcp,
  'DELETE /api/mcp': config.deleteMcp,
  'POST /api/create': config.postCreate,
  'POST /api/fork': config.postFork,
  'POST /api/open': api.postOpen,
  'POST /api/plugin/uninstall': api.postPluginUninstall,
  'GET /api/backups': api.getBackups,
  'POST /api/restore': api.postRestore,
  'GET /api/activity': api.getActivity,
  'POST /api/undo': api.postUndo
}

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
const MAX_BODY = 2 * 1024 * 1024
const HOST = '127.0.0.1'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

const CSP =
  "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"

function sendJson(res, status, json) {
  const body = JSON.stringify(json)
  res.writeHead(status, {
    'x-content-type-options': 'nosniff',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  })
  res.end(body)
}

function sendNotFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' })
  res.end('Not found')
}

function staticPath(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  if (decoded.split(/[\\/]/).some((seg) => seg === '..')) return null
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const target = path.resolve(PUBLIC_DIR, relative)
  const rel = path.relative(PUBLIC_DIR, target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return target
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendNotFound(res)
  const target = staticPath(pathname)
  if (!target) return sendNotFound(res)
  let real
  try {
    real = fs.realpathSync(target)
    const rel = path.relative(fs.realpathSync(PUBLIC_DIR), real)
    if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.statSync(real).isFile()) return sendNotFound(res)
  } catch {
    return sendNotFound(res)
  }
  const body = fs.readFileSync(real)
  const ext = path.extname(real).toLowerCase()
  const headers = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff'
  }
  if (ext === '.html') headers['content-security-policy'] = CSP
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : body)
}

function tokenMatches(given, expected) {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_BODY) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return reject(new HttpError(413, 'request body is larger than 2 MB'))
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch (err) {
        reject(new HttpError(400, `invalid JSON body: ${err.message}`))
      }
    })
    req.on('error', reject)
  })
}

async function handleApi(req, res, url, deps) {
  if (!tokenMatches(req.headers['x-storehouse-token'], deps.token)) {
    req.resume()
    return sendJson(res, 401, { error: 'missing or wrong x-storehouse-token' })
  }
  const key = `${req.method} ${url.pathname}`
  const handler = Object.hasOwn(ROUTES, key) ? ROUTES[key] : null
  if (!handler) {
    req.resume()
    return sendJson(res, 404, { error: `no route ${req.method} ${url.pathname}` })
  }
  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req)
    const query = Object.fromEntries(url.searchParams)
    const { status, json } = await handler({ body, query }, deps)
    sendJson(res, status, json)
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message })
    console.error(err)
    sendJson(res, 500, { error: err.message })
  }
}

export function startServer({ home, projectDir, port = 0, token, runClaude, managedDir }) {
  if (typeof token !== 'string' || token === '') throw new Error('token is required')
  const deps = {
    ctx: { home, projectDir: projectScope(home, projectDir), managedDir },
    activity: new Activity(),
    token,
    runClaude
  }
  let allowedHosts = new Set()
  const server = http.createServer((req, res) => {
    if (!allowedHosts.has(String(req.headers.host ?? '').toLowerCase())) {
      req.resume()
      return sendJson(res, 403, { error: 'unexpected Host header' })
    }
    let url
    try {
      url = new URL(req.url, `http://${HOST}`)
    } catch {
      return sendNotFound(res)
    }
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/')
    if (isApi) return void handleApi(req, res, url, deps)
    serveStatic(req, res, req.url.split('?')[0])
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOST, () => {
      server.off('error', reject)
      const address = server.address()
      allowedHosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`])
      resolve({
        url: `http://${HOST}:${address.port}/?token=${token}`,
        port: address.port,
        address: address.address,
        close: () =>
          new Promise((done) => {
            server.close(() => done())
            server.closeAllConnections()
          })
      })
    })
  })
}
