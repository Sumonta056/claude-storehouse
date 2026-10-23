import crypto from 'node:crypto'
import path from 'node:path'
import { readJson } from '../write/json-file.js'

export function normalizeMatcher(matcher) {
  return typeof matcher === 'string' ? matcher : '*'
}

function sha1(parts) {
  return crypto.createHash('sha1').update(parts.join('\0')).digest('hex')
}

export function isProjectFile(file) {
  return file === 'project' || file === 'projectLocal'
}

export function hookId(file, event, matcher, command, projectDir) {
  const parts = [file, event, normalizeMatcher(matcher), String(command)]
  if (isProjectFile(file)) parts.push(projectDir)
  return sha1(parts)
}

export function parkedHookId(file, event, matcher, command, projectDir, parkedAt) {
  return sha1([
    'parked',
    hookId(file, event, matcher, command, projectDir),
    parkedAt,
    crypto.randomBytes(8).toString('hex')
  ])
}

export function hookSettingsPath(file, { home, projectDir }) {
  if (file === 'global') return path.join(home, '.claude', 'settings.json')
  if (!projectDir) return null
  if (file === 'project') return path.join(projectDir, '.claude', 'settings.json')
  if (file === 'projectLocal') return path.join(projectDir, '.claude', 'settings.local.json')
  return null
}

export function storehousePath(home) {
  return path.join(home, '.claude', 'storehouse.json')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function scanParkedHooks({ home, projectDir }) {
  const result = readJson(storehousePath(home))
  if (!result.ok || !isObject(result.data) || !Array.isArray(result.data.parkedHooks)) return []
  return result.data.parkedHooks
    .filter((entry) => isObject(entry) && isObject(entry.hook) && typeof entry.id === 'string')
    .filter((entry) => !isProjectFile(entry.file) || (projectDir && entry.projectDir === projectDir))
    .map((entry) => ({
      scope: entry.scope,
      file: entry.file,
      event: entry.event,
      matcher: normalizeMatcher(entry.matcher),
      command: entry.hook.command,
      type: entry.hook.type,
      index: { event: entry.event, group: entry.group, hook: entry.position },
      path: hookSettingsPath(entry.file, { home, projectDir }),
      id: entry.id,
      enabled: false,
      canToggle: typeof entry.hook.command === 'string',
      parked: true
    }))
}
