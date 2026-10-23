import path from 'node:path'
import { readJson } from '../write/json-file.js'

function loadFile(scope, file) {
  const result = readJson(file)
  if (result.ok) return { scope, path: file, exists: true, ok: true, data: result.data }
  if (result.raw === null) return { scope, path: file, exists: false, ok: true }
  return { scope, path: file, exists: true, ok: false, error: result.error }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function flattenHookGroups(hooks, { scope, file, path: filePath }) {
  const out = []
  if (!isObject(hooks)) return out
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue
    groups.forEach((group, groupIndex) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return
      group.hooks.forEach((hook, hookIndex) => {
        if (!isObject(hook)) return
        const entry = {
          scope,
          file,
          event,
          matcher: typeof group.matcher === 'string' ? group.matcher : '*',
          command: hook.command,
          type: hook.type,
          index: { event, group: groupIndex, hook: hookIndex },
          path: filePath
        }
        if (hook.timeout !== undefined) entry.timeout = hook.timeout
        out.push(entry)
      })
    })
  }
  return out
}

function flattenHooks(file) {
  return flattenHookGroups(file.data.hooks, {
    scope: file.scope === 'global' ? 'global' : 'project',
    file: file.scope,
    path: file.path
  })
}

function mergeObjects(files, key) {
  const merged = {}
  for (const file of files) {
    if (isObject(file.data[key])) Object.assign(merged, file.data[key])
  }
  return merged
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function unionList(files, key) {
  return [...new Set(files.flatMap((file) => stringList(file.data[key])))]
}

export function scanSettings({ home, projectDir }) {
  const files = [loadFile('global', path.join(home, '.claude', 'settings.json'))]
  if (projectDir) {
    files.push(
      loadFile('project', path.join(projectDir, '.claude', 'settings.json')),
      loadFile('projectLocal', path.join(projectDir, '.claude', 'settings.local.json'))
    )
  }
  const usable = files.filter((file) => file.ok && file.exists && isObject(file.data))
  return {
    files,
    hooks: usable.flatMap(flattenHooks),
    enabledPlugins: mergeObjects(usable, 'enabledPlugins'),
    skillOverrides: mergeObjects(usable, 'skillOverrides'),
    mcpJsonLists: {
      enabled: unionList(usable, 'enabledMcpjsonServers'),
      disabled: unionList(usable, 'disabledMcpjsonServers'),
      enableAll: usable.some((file) => file.data.enableAllProjectMcpServers === true)
    }
  }
}
