import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { isAllowed } from './paths.js'

const MAX_BACKUPS = 20

export function readJson(file) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    return { ok: false, error: err.message, raw: null }
  }
  try {
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: err.message, raw }
  }
}

function backupDir(home) {
  return path.join(home, '.claude', 'backups', 'storehouse')
}

function backupPrefix(file) {
  let abs
  try {
    abs = fs.realpathSync(file)
  } catch {
    abs = path.resolve(file)
  }
  const id = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 12)
  return `${path.basename(abs)}.${id}.`
}

export function listBackups(file, home) {
  const dir = backupDir(home)
  const prefix = backupPrefix(file)
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => name.startsWith(prefix) && /^\d{4}-/.test(name.slice(prefix.length)))
    .sort()
    .reverse()
    .map((name) => path.join(dir, name))
}

export function backupFile(file, home) {
  if (!fs.existsSync(file)) return null
  const dir = backupDir(home)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = path.join(dir, `${backupPrefix(file)}${stamp}`)
  let target = base
  for (let n = 1; fs.existsSync(target); n++) {
    target = `${base}-${String(n).padStart(3, '0')}`
  }
  fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL)
  for (const old of listBackups(file, home).slice(MAX_BACKUPS)) {
    fs.rmSync(old, { force: true })
  }
  return target
}

function modeFor(dest, home) {
  try {
    return fs.statSync(dest).mode & 0o7777
  } catch {
    return path.resolve(dest) === path.resolve(home, '.claude.json') ? 0o600 : null
  }
}

export function writeFileAtomic(file, content, home) {
  let dest = file
  try {
    dest = fs.realpathSync(file)
  } catch {
    dest = file
  }
  const mode = modeFor(dest, home)
  const backup = backupFile(dest, home)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp`
  try {
    fs.writeFileSync(tmp, content, mode === null ? undefined : { mode })
    if (mode !== null) fs.chmodSync(tmp, mode)
    fs.renameSync(tmp, dest)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
  return { backup }
}

export function writeJsonAtomic(file, data, home) {
  return writeFileAtomic(file, JSON.stringify(data, null, 2) + '\n', home)
}

export function restoreBackup(backupPath, targetPath, home, ctx = { home }) {
  try {
    const dir = fs.realpathSync(backupDir(home))
    const backup = fs.realpathSync(backupPath)
    const rel = path.relative(dir, backup)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
      return { ok: false, error: 'backup is outside the storehouse backup folder' }
    }
    if (!path.basename(backup).startsWith(backupPrefix(targetPath))) {
      return { ok: false, error: 'backup does not belong to this file' }
    }
    const access = isAllowed(targetPath, ctx)
    if (!access.allowed) return { ok: false, error: access.reason }
    if (access.readOnly) return { ok: false, error: 'file is read-only' }
    const { backup: current } = writeFileAtomic(targetPath, fs.readFileSync(backup), home)
    return { ok: true, backup: current }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
