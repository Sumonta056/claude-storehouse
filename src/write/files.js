import fs from 'node:fs'
import path from 'node:path'
import { isAllowed, isProtectedTarget } from './paths.js'
import { writeFileAtomic } from './json-file.js'

export function readText(file, ctx) {
  const access = isAllowed(file, ctx)
  if (!access.allowed) return { ok: false, error: access.reason }
  try {
    return { ok: true, content: fs.readFileSync(file, 'utf8') }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function writeText(file, content, ctx) {
  const access = isAllowed(file, ctx)
  if (!access.allowed) return { ok: false, error: access.reason }
  if (access.readOnly) return { ok: false, error: 'file is read-only' }
  try {
    const { backup } = writeFileAtomic(file, content, ctx.home)
    return { ok: true, backup }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function deleteToTrash(file, ctx) {
  const access = isAllowed(file, ctx)
  if (!access.allowed) return { ok: false, error: access.reason }
  if (access.readOnly) return { ok: false, error: 'file is read-only' }
  if (isProtectedTarget(file, ctx)) return { ok: false, error: 'refusing to delete a protected folder' }
  try {
    fs.lstatSync(file)
  } catch (err) {
    return { ok: false, error: err.message }
  }
  const dir = path.join(ctx.home, '.claude', 'backups', 'storehouse', 'trash')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = path.join(dir, `${stamp}-${path.basename(file)}`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    let trashPath = base
    for (let n = 1; fs.existsSync(trashPath); n++) {
      trashPath = `${base}-${String(n).padStart(3, '0')}`
    }
    try {
      fs.renameSync(file, trashPath)
    } catch (err) {
      if (err.code !== 'EXDEV') throw err
      fs.cpSync(file, trashPath, { recursive: true, verbatimSymlinks: true })
      fs.rmSync(file, { recursive: true, force: true })
    }
    return { ok: true, trashPath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
