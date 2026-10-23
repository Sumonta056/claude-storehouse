import fs from 'node:fs'
import path from 'node:path'

function resolveReal(target) {
  const missing = []
  let current = path.resolve(target)
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing)
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(target)
      missing.unshift(path.basename(current))
      current = parent
    }
  }
}

function within(child, parent) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function underAny(file, roots) {
  return roots.some((root) => within(file, root))
}

const ALLOWED_DOT = new Set(['.claude', '.agents'])

function visibleUnderHome(real, homes) {
  const home = homes.find((h) => within(real, h))
  return path
    .relative(home, real)
    .split(path.sep)
    .every((seg) => !seg.startsWith('.') || ALLOWED_DOT.has(seg))
}

export function projectScope(home, projectDir) {
  if (!projectDir) return null
  const dirs = [path.resolve(projectDir), resolveReal(projectDir)]
  const homes = [path.resolve(home), resolveReal(home)]
  if (dirs.some((dir) => homes.some((h) => within(h, dir)))) return null
  return path.resolve(projectDir)
}

const CONTAINERS = ['skills', 'agents', 'hooks', 'plugins']

export function protectedRoots({ home, projectDir }) {
  const project = projectScope(home, projectDir)
  const roots = [path.resolve(home, '.claude'), path.resolve(home, '.claude.json')]
  if (project) roots.push(project)
  return [...roots, ...roots.map(resolveReal)]
}

function containerFolders({ home, projectDir }) {
  const project = projectScope(home, projectDir)
  const bases = [path.resolve(home)]
  if (project) bases.push(project)
  const folders = bases.flatMap((base) => CONTAINERS.map((name) => path.join(base, '.claude', name)))
  return [...folders, ...folders.map(resolveReal)]
}

export function isProtectedTarget(file, ctx) {
  const roots = protectedRoots(ctx)
  const lexical = path.resolve(file)
  const real = resolveReal(lexical)
  if (roots.includes(lexical) || roots.includes(real)) return true
  const containers = containerFolders(ctx)
  if (containers.includes(lexical) || containers.includes(real)) return true
  let isDir = false
  try {
    isDir = fs.statSync(lexical).isDirectory()
  } catch {
    isDir = false
  }
  return isDir && (roots.includes(path.dirname(lexical)) || roots.includes(path.dirname(real)))
}

export function isAllowed(file, { home, projectDir }) {
  const lexical = path.resolve(file)
  const real = resolveReal(lexical)
  const claudeDir = path.resolve(home, '.claude')
  const claudeJson = path.resolve(home, '.claude.json')
  const dirs = [claudeDir, resolveReal(claudeDir)]
  const jsons = [claudeJson, resolveReal(claudeJson)]
  const project = projectScope(home, projectDir)
  const projects = project ? [project, resolveReal(project)] : []
  const homes = [path.resolve(home), resolveReal(home)]

  const realAllowed =
    underAny(real, dirs) || underAny(real, projects) || jsons.includes(real)
  const symlinkIntoHome = underAny(lexical, dirs) && underAny(real, homes) && visibleUnderHome(real, homes)

  if (!realAllowed && !symlinkIntoHome) {
    return { allowed: false, readOnly: false, reason: 'path is outside the allowed folders' }
  }
  const cacheRoots = dirs.map((d) => path.join(d, 'plugins', 'cache'))
  const readOnly = underAny(lexical, cacheRoots) || underAny(real, cacheRoots)
  return { allowed: true, readOnly }
}
