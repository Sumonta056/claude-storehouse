import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { scanAll } from './scan/index.js'
import { storehousePath } from './scan/hooks.js'
import { toggle, mutateJson, Refusal } from './write/toggles.js'
import { setFavorite, reorderFavorites } from './write/favorites.js'
import { readText, writeText, deleteToTrash } from './write/files.js'
import { isAllowed } from './write/paths.js'
import { listBackups, restoreBackup, readJson } from './write/json-file.js'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function ok(json) {
  return { status: 200, json }
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function requireString(value, label) {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `${label} is required`)
  return value
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function requireKey(value, label) {
  const key = requireString(value, label)
  if (RESERVED_KEYS.has(key)) throw new HttpError(400, `${label} ${key} is not allowed`)
  return key
}

export function requirePath(value, ctx, { write = false } = {}) {
  const file = requireString(value, 'path')
  if (!path.isAbsolute(file)) throw new HttpError(400, 'path must be absolute')
  const access = isAllowed(file, ctx)
  if (!access.allowed) throw new HttpError(403, access.reason)
  if (write && access.readOnly) throw new HttpError(403, 'file is read-only')
  return { file: path.resolve(file), readOnly: access.readOnly }
}

export function refused(fn) {
  try {
    return fn()
  } catch (err) {
    if (err instanceof Refusal) throw new HttpError(400, err.message)
    throw err
  }
}

export function checked(result) {
  if (!result.ok) throw new HttpError(400, result.error)
  return result
}

export function exists(file) {
  try {
    fs.lstatSync(file)
    return true
  } catch {
    return false
  }
}

export function recordSave(deps, file, message, backup) {
  return deps.activity.record({ kind: 'save', file, message, backup: backup ?? null })
}

const TOGGLE_FIELDS = ['kind', 'name', 'scope', 'enabled', 'plugin', 'event', 'index', 'origin', 'file']

function pick(source, fields) {
  const out = {}
  for (const field of fields) {
    if (isObject(source) && Object.hasOwn(source, field)) out[field] = source[field]
  }
  return out
}

export function getInventory(_req, { ctx }) {
  return ok(scanAll(ctx))
}

function shorten(text, max = 60) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function findHook(req, ctx) {
  const hooks = scanAll(ctx).hooks
  if (req.enabled) return hooks.find((h) => h.parked && h.id === req.name)
  return hooks.find(
    (h) =>
      !h.parked &&
      h.command === req.name &&
      h.event === req.event &&
      (req.file === undefined || h.file === req.file) &&
      (!isObject(req.index) || (h.index?.group === req.index.group && h.index?.hook === req.index.hook))
  )
}

function toggleLabel(req, ctx) {
  if (req.kind !== 'hook') return `${req.kind} ${req.name}`
  let hook = null
  try {
    hook = findHook(req, ctx)
  } catch {
    hook = null
  }
  if (!hook) return `hook ${shorten(req.name)}`
  return `${hook.event} hook · ${hook.matcher} · ${shorten(hook.command)}`
}

export function postToggle({ body }, deps) {
  const req = pick(body, TOGGLE_FIELDS)
  const label = toggleLabel(req, deps.ctx)
  const result = checked(toggle(req, deps.ctx))
  const state = req.enabled ? 'on' : 'off'
  const entry = deps.activity.record({
    kind: 'toggle',
    file: result.file,
    message: `Switched ${label} ${state}`,
    undo: result.undo,
    backup: result.backup ?? null
  })
  return ok({ ok: true, file: result.file, backup: result.backup ?? null, entry })
}

export function postFavorite({ body }, deps) {
  const req = pick(body, ['kind', 'name', 'source', 'favorite'])
  const favorites = refused(() => setFavorite(req, deps.ctx.home))
  const entry = deps.activity.record({
    kind: 'favorite',
    file: storehousePath(deps.ctx.home),
    message: `${req.favorite ? 'Starred' : 'Unstarred'} ${req.kind} ${req.name}`,
    undo: req
  })
  return ok({ ok: true, favorites, entry })
}

export function putFavoritesOrder({ body }, deps) {
  const ids = Array.isArray(body) ? body : body?.ids
  const favorites = refused(() => reorderFavorites(ids, deps.ctx.home))
  const entry = recordSave(deps, storehousePath(deps.ctx.home), 'Reordered favorites', null)
  return ok({ ok: true, favorites, entry })
}

function listDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
    const full = path.join(dir, entry.name)
    let stat = null
    try {
      stat = fs.statSync(full)
    } catch {
      stat = null
    }
    const type = stat?.isDirectory() ? 'dir' : 'file'
    return { name: entry.name, type, size: stat && type === 'file' ? stat.size : 0 }
  })
  return entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
}

export function stampOf(file) {
  try {
    const stat = fs.statSync(file)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
}

export function getFile({ query }, { ctx }) {
  const { file, readOnly } = requirePath(query.path, ctx)
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    throw new HttpError(404, `${file} not found`)
  }
  if (stat.isDirectory()) return ok({ entries: listDir(file), readOnly })
  const result = checked(readText(file, ctx))
  return ok({ content: result.content, readOnly, stamp: stampOf(file) })
}

export function putFile({ body }, deps) {
  const { file } = requirePath(body?.path, deps.ctx, { write: true })
  if (typeof body.content !== 'string') throw new HttpError(400, 'content must be a string')
  if (file.endsWith('.json')) {
    try {
      JSON.parse(body.content)
    } catch (err) {
      throw new HttpError(400, `invalid JSON: ${err.message}`)
    }
  }
  if (body.stamp !== undefined) {
    const current = stampOf(file)
    if (body.stamp !== current) {
      return { status: 409, json: { error: `${file} changed on disk since it was loaded`, stamp: current } }
    }
  }
  const result = checked(writeText(file, body.content, deps.ctx))
  const entry = recordSave(deps, file, `Saved ${path.basename(file)}`, result.backup)
  const content = fs.readFileSync(file, 'utf8')
  return ok({ ok: true, backup: result.backup ?? null, content, stamp: stampOf(file), entry })
}

function skillOverrideTarget(file, ctx) {
  const parent = path.dirname(file)
  if (parent === path.join(ctx.home, '.claude', 'skills')) return path.join(ctx.home, '.claude', 'settings.json')
  if (ctx.projectDir && parent === path.join(ctx.projectDir, '.claude', 'skills')) {
    return path.join(ctx.projectDir, '.claude', 'settings.local.json')
  }
  return null
}

function skillNameAt(file, ctx) {
  const scope = path.dirname(file) === path.join(ctx.home, '.claude', 'skills') ? 'global' : 'project'
  const skill = scanAll(ctx).skills.find(
    (item) => item.scope === scope && (item.path === file || path.dirname(item.path) === file)
  )
  if (skill) return skill.name
  return path.basename(file).replace(/\.md$/, '')
}

export function deleteFile({ body }, deps) {
  const { ctx } = deps
  const { file } = requirePath(body?.path, ctx, { write: true })
  if (!exists(file)) throw new HttpError(404, `${file} not found`)
  const settingsFile = skillOverrideTarget(file, ctx)
  const skillName = settingsFile ? skillNameAt(file, ctx) : null
  if (settingsFile && exists(settingsFile)) {
    const parsed = readJson(settingsFile)
    if (!parsed.ok) throw new HttpError(400, `cannot read ${settingsFile}: ${parsed.error}; nothing was deleted`)
    if (!isObject(parsed.data)) throw new HttpError(400, `${settingsFile} does not hold a JSON object; nothing was deleted`)
  }
  const result = checked(deleteToTrash(file, ctx))
  recordSave(deps, file, `Deleted ${path.basename(file)}`, null)
  let settingsBackup = null
  if (settingsFile && exists(settingsFile)) {
    const change = refused(() =>
      mutateJson(settingsFile, ctx, (data) => {
        if (isObject(data.skillOverrides) && Object.hasOwn(data.skillOverrides, skillName)) {
          delete data.skillOverrides[skillName]
        }
      })
    )
    if (change.changed) {
      settingsBackup = change.backup
      recordSave(deps, settingsFile, `Removed skillOverrides.${skillName}`, change.backup)
    }
  }
  return ok({ ok: true, trashPath: result.trashPath, settingsBackup })
}

function runOpen(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err) => (err ? reject(err) : resolve()))
  })
}

export async function postOpen({ body }, { ctx }) {
  const { file } = requirePath(body?.path, ctx)
  const app = body.app
  if (app !== 'editor' && app !== 'finder') throw new HttpError(400, 'app must be editor or finder')
  try {
    if (process.platform === 'darwin') {
      if (app === 'finder') await runOpen('open', ['-R', file])
      else await runOpen('open', ['-a', 'Visual Studio Code', file]).catch(() => runOpen('open', [file]))
    } else {
      await runOpen('xdg-open', [app === 'finder' ? path.dirname(file) : file])
    }
  } catch (err) {
    throw new HttpError(400, `could not open ${file}: ${err.message}`)
  }
  return ok({ ok: true })
}

function backupTime(backup, file) {
  const name = path.basename(backup)
  const stamp = name.slice(name.lastIndexOf('.') + 1)
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(stamp)
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null
}

export function getBackups({ query }, { ctx }) {
  const { file } = requirePath(query.path, ctx)
  const backups = listBackups(file, ctx.home).map((backup) => ({ path: backup, time: backupTime(backup, file) }))
  return ok({ backups })
}

export function postRestore({ body }, deps) {
  const { file } = requirePath(body?.path, deps.ctx, { write: true })
  const backup = requireString(body.backup, 'backup')
  const result = checked(restoreBackup(backup, file, deps.ctx.home, deps.ctx))
  const entry = recordSave(deps, file, `Restored ${path.basename(file)} from backup`, result.backup)
  return ok({ ok: true, backup: result.backup ?? null, content: fs.readFileSync(file, 'utf8'), stamp: stampOf(file), entry })
}

export function getActivity(_req, { activity }) {
  return ok({ entries: activity.list() })
}

export function postUndo({ body }, { activity, ctx }) {
  const id = body?.entryId
  if (typeof id !== 'string' && typeof id !== 'number') throw new HttpError(400, 'entryId is required')
  const result = checked(activity.undo(String(id), ctx))
  return ok(result)
}
