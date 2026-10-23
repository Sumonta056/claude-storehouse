import fs from 'node:fs'
import path from 'node:path'
import { readJson, writeJsonAtomic } from './json-file.js'
import { isAllowed } from './paths.js'
import { scanAll } from '../scan/index.js'
import { hookSettingsPath, isProjectFile, parkedHookId, storehousePath } from '../scan/hooks.js'

export class Refusal extends Error {}

function refuse(message) {
  throw new Refusal(message)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exists(file) {
  try {
    fs.lstatSync(file)
    return true
  } catch {
    return false
  }
}

function stampOf(file) {
  try {
    const stat = fs.statSync(file)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
}

function checkWritable(file, ctx) {
  const result = isAllowed(file, ctx)
  if (!result.allowed) refuse(`${file} is outside the allowed folders`)
  if (result.readOnly) refuse(`${file} is read-only`)
}

function load(file, ctx) {
  checkWritable(file, ctx)
  if (!exists(file)) return { data: {}, existed: false }
  const result = readJson(file)
  if (!result.ok) refuse(`cannot read ${file}: ${result.error}`)
  if (!isObject(result.data)) refuse(`${file} does not hold a JSON object`)
  return { data: result.data, existed: true }
}

function writeChecked(file, data, ctx) {
  if (ctx.beforeSave) ctx.beforeSave(file)
  return writeJsonAtomic(file, data, ctx.home)
}

export function mutateJson(file, ctx, apply) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const stamp = stampOf(file)
    const { data, existed } = load(file, ctx)
    const original = structuredClone(data)
    apply(data, { existed })
    if (JSON.stringify(data) === JSON.stringify(original)) {
      return { changed: false, backup: null, original, existed }
    }
    if (ctx.beforeSave) ctx.beforeSave(file)
    if (stampOf(file) !== stamp) continue
    const { backup } = writeJsonAtomic(file, data, ctx.home)
    return { changed: true, backup, original, existed }
  }
  return refuse(`${file} changed on disk while switching; try again`)
}

function rollback(file, result, ctx, cause) {
  if (result.changed) {
    try {
      if (result.existed) writeChecked(file, result.original, ctx)
      else fs.rmSync(file, { force: true })
    } catch (err) {
      throw new Error(`${cause.message}; rollback of ${file} also failed: ${err.message}`)
    }
  }
  throw cause
}

function objectKey(data, key, file) {
  if (data[key] === undefined) data[key] = {}
  if (!isObject(data[key])) refuse(`${key} in ${file} is not an object`)
  return data[key]
}

function arrayKey(data, key, file) {
  if (data[key] === undefined) data[key] = []
  if (!Array.isArray(data[key])) refuse(`${key} in ${file} is not an array`)
  return data[key]
}

function removeFromArray(data, key, value, file) {
  if (data[key] === undefined) return
  data[key] = arrayKey(data, key, file).filter((item) => item !== value)
}

const PROJECT_OFF = 'project scope is off; run claude-storehouse inside a project folder'

function requireProject(ctx) {
  if (!ctx.projectDir) refuse(PROJECT_OFF)
  return ctx.projectDir
}

function settingsPathFor(scope, ctx) {
  if (scope === 'global') return path.join(ctx.home, '.claude', 'settings.json')
  if (scope === 'project') return path.join(requireProject(ctx), '.claude', 'settings.local.json')
  return refuse(`scope must be global or project, got ${scope}`)
}

function refusePluginRequest(req, label) {
  if (req.plugin || req.scope === 'plugin') refuse(`${label} ${req.name} comes from a plugin; switch the plugin instead`)
}

function findLocal(items, req, label) {
  refusePluginRequest(req, label)
  const matches = items.filter((item) => item.name === req.name && item.scope === req.scope && !item.plugin)
  if (matches.length === 0) {
    if (items.some((item) => item.name === req.name && item.plugin)) {
      refuse(`${label} ${req.name} comes from a plugin; switch the plugin instead`)
    }
    refuse(`${label} ${req.name} not found in ${req.scope} scope`)
  }
  if (matches.some((item) => item.canToggle === false)) refuse(`${label} ${req.name} cannot be switched`)
  return matches
}

function outcome(file, result, undo) {
  return { file, backup: result.backup, undo: result.changed ? undo : null }
}

function togglePlugin(req, ctx, inv) {
  if (!inv.plugins.some((plugin) => plugin.id === req.name)) refuse(`plugin ${req.name} is not installed`)
  const file = settingsPathFor(req.scope, ctx)
  const result = mutateJson(file, ctx, (data) => {
    objectKey(data, 'enabledPlugins', file)[req.name] = req.enabled
  })
  return outcome(file, result, { kind: 'plugin', name: req.name, scope: req.scope, enabled: !req.enabled })
}

function toggleSkill(req, ctx, inv) {
  findLocal(inv.skills, req, 'skill')
  const file = settingsPathFor(req.scope, ctx)
  const result = mutateJson(file, ctx, (data) => {
    if (!req.enabled) objectKey(data, 'skillOverrides', file)[req.name] = 'off'
    else if (data.skillOverrides !== undefined) delete objectKey(data, 'skillOverrides', file)[req.name]
  })
  return outcome(file, result, { kind: 'skill', name: req.name, scope: req.scope, enabled: !req.enabled })
}

function findMcp(inv, req) {
  let found = inv.mcp.filter(
    (server) =>
      server.name === req.name &&
      (!req.origin || server.origin === req.origin) &&
      (!req.plugin || server.plugin === req.plugin)
  )
  if (found.length > 1) found = found.filter((server) => server.scope === req.scope)
  if (found.length === 0) refuse(`MCP server ${req.name} not found`)
  if (found.length > 1) refuse(`MCP server ${req.name} is ambiguous; pass origin and plugin`)
  if (found[0].canToggle === false) refuse(`MCP server ${req.name} cannot be switched`)
  return found[0]
}

function toggleMcpJson(server, req, ctx) {
  const file = path.join(requireProject(ctx), '.claude', 'settings.local.json')
  const [addTo, removeFrom] = req.enabled
    ? ['enabledMcpjsonServers', 'disabledMcpjsonServers']
    : ['disabledMcpjsonServers', 'enabledMcpjsonServers']
  const result = mutateJson(file, ctx, (data) => {
    removeFromArray(data, removeFrom, server.name, file)
    const list = arrayKey(data, addTo, file)
    if (!list.includes(server.name)) list.push(server.name)
  })
  return { file, result }
}

function toggleMcpDisabledList(server, req, ctx) {
  requireProject(ctx)
  const file = path.join(ctx.home, '.claude.json')
  const result = mutateJson(file, ctx, (data) => {
    const entry = objectKey(objectKey(data, 'projects', file), ctx.projectDir, file)
    if (req.enabled) {
      removeFromArray(entry, 'disabledMcpServers', server.disabledKey, file)
      return
    }
    const list = arrayKey(entry, 'disabledMcpServers', file)
    if (!list.includes(server.disabledKey)) list.push(server.disabledKey)
  })
  return { file, result }
}

function toggleMcp(req, ctx, inv) {
  const server = findMcp(inv, req)
  const { file, result } =
    server.origin === 'mcpjson' ? toggleMcpJson(server, req, ctx) : toggleMcpDisabledList(server, req, ctx)
  const undo = { kind: 'mcp', name: req.name, scope: server.scope, origin: server.origin, enabled: !req.enabled }
  if (server.plugin) undo.plugin = server.plugin
  return outcome(file, result, undo)
}

function prepareStore(data, existed, file) {
  if (!existed) {
    data.favorites = []
    data.parkedHooks = []
  }
  return arrayKey(data, 'parkedHooks', file)
}

function clampIndex(value, max) {
  if (!Number.isInteger(value)) return max
  return Math.min(Math.max(value, 0), max)
}

function locateHook(data, item, groupIndex, hookIndex, file) {
  const groups = isObject(data.hooks) ? data.hooks[item.event] : undefined
  const group = Array.isArray(groups) ? groups[groupIndex] : undefined
  const hook = isObject(group) && Array.isArray(group.hooks) ? group.hooks[hookIndex] : undefined
  if (!isObject(hook) || hook.command !== item.command) refuse(`hook ${item.command} changed in ${file}; reload and try again`)
  return { groups, group, hook }
}

export function removeHookAt(data, item, file) {
  const groupIndex = item.index.group
  const hookIndex = item.index.hook
  const found = locateHook(data, item, groupIndex, hookIndex, file)
  found.group.hooks.splice(hookIndex, 1)
  if (found.group.hooks.length === 0) found.groups.splice(groupIndex, 1)
  if (found.groups.length === 0) delete data.hooks[item.event]
}

function hookOff(req, ctx, inv) {
  refusePluginRequest(req.file === 'plugin' ? { ...req, scope: 'plugin' } : req, 'hook')
  const groupIndex = req.index?.group
  const hookIndex = req.index?.hook
  const item = inv.hooks.find(
    (hook) =>
      hook.enabled &&
      !hook.parked &&
      hook.scope === req.scope &&
      hook.file === req.file &&
      hook.event === req.event &&
      hook.command === req.name &&
      hook.index.group === groupIndex &&
      hook.index.hook === hookIndex
  )
  if (!item) refuse(`hook ${req.name} not found at ${req.event}[${groupIndex}].hooks[${hookIndex}] in ${req.file}`)
  if (item.canToggle === false) refuse(`hook ${req.name} cannot be switched`)

  const file = hookSettingsPath(item.file, ctx)
  const { group, hook } = locateHook(load(file, ctx).data, item, groupIndex, hookIndex, file)
  const parkedAt = new Date().toISOString()
  const entry = {
    id: parkedHookId(item.file, item.event, group.matcher, hook.command, ctx.projectDir, parkedAt),
    scope: item.scope,
    file: item.file
  }
  if (isProjectFile(item.file)) entry.projectDir = ctx.projectDir
  Object.assign(entry, { event: item.event, matcher: group.matcher, hook, group: groupIndex, position: hookIndex, parkedAt })

  const storeFile = storehousePath(ctx.home)
  const store = mutateJson(storeFile, ctx, (data, { existed }) => {
    prepareStore(data, existed, storeFile).push(entry)
  })
  let settings
  try {
    settings = mutateJson(file, ctx, (data) => removeHookAt(data, item, file))
  } catch (err) {
    rollback(storeFile, store, ctx, err)
  }
  return { file, backup: settings.backup, undo: { kind: 'hook', name: entry.id, scope: item.scope, enabled: true } }
}

function insertHook(data, entry, file) {
  const groups = arrayKey(objectKey(data, 'hooks', file), entry.event, file)
  const sameMatcher = (group) => isObject(group) && Array.isArray(group.hooks) && group.matcher === entry.matcher
  let groupIndex = sameMatcher(groups[entry.group]) ? entry.group : groups.findIndex(sameMatcher)
  if (groupIndex >= 0) {
    const hookIndex = clampIndex(entry.position, groups[groupIndex].hooks.length)
    groups[groupIndex].hooks.splice(hookIndex, 0, structuredClone(entry.hook))
    return { event: entry.event, group: groupIndex, hook: hookIndex }
  }
  groupIndex = clampIndex(entry.group, groups.length)
  const hooks = [structuredClone(entry.hook)]
  groups.splice(groupIndex, 0, entry.matcher === undefined ? { hooks } : { matcher: entry.matcher, hooks })
  return { event: entry.event, group: groupIndex, hook: 0 }
}

function hookOn(req, ctx, inv) {
  refusePluginRequest(req, 'hook')
  const item = inv.hooks.find((hook) => hook.parked && hook.id === req.name)
  if (!item) refuse(`no parked hook with id ${req.name} for this project`)
  if (req.scope && req.scope !== item.scope) refuse(`parked hook ${req.name} belongs to ${item.scope} scope`)

  const storeFile = storehousePath(ctx.home)
  const parked = load(storeFile, ctx).data.parkedHooks
  const entry = Array.isArray(parked) ? parked.find((e) => isObject(e) && e.id === req.name) : undefined
  if (!entry) refuse(`no parked hook with id ${req.name}`)
  if (isProjectFile(entry.file) && entry.projectDir !== ctx.projectDir) {
    refuse(`parked hook ${req.name} belongs to project ${entry.projectDir}`)
  }
  const file = hookSettingsPath(entry.file, ctx)
  if (!file) refuse(`parked hook ${req.name} has unknown file ${entry.file}`)

  let index
  const settings = mutateJson(file, ctx, (data) => {
    index = insertHook(data, entry, file)
  })
  try {
    mutateJson(storeFile, ctx, (data) => {
      const list = arrayKey(data, 'parkedHooks', storeFile)
      const at = list.findIndex((e) => isObject(e) && e.id === req.name)
      if (at >= 0) list.splice(at, 1)
    })
  } catch (err) {
    rollback(file, settings, ctx, err)
  }
  return {
    file,
    backup: settings.backup,
    undo: { kind: 'hook', name: entry.hook.command, scope: entry.scope, file: entry.file, event: entry.event, index, enabled: false }
  }
}

function toggleHook(req, ctx, inv) {
  return req.enabled ? hookOn(req, ctx, inv) : hookOff(req, ctx, inv)
}

function toggleAgent(req, ctx, inv) {
  const [item] = findLocal(inv.agents, req, 'agent')
  const dir = path.dirname(item.path)
  const from = path.join(dir, `${req.name}${req.enabled ? '.md.disabled' : '.md'}`)
  const to = path.join(dir, `${req.name}${req.enabled ? '.md' : '.md.disabled'}`)
  checkWritable(from, ctx)
  checkWritable(to, ctx)
  if (exists(from) && exists(to)) refuse(`cannot rename ${from}: ${to} already exists`)
  if (!exists(from)) return { file: to, backup: null, undo: null }
  fs.renameSync(from, to)
  return { file: to, backup: null, undo: { kind: 'agent', name: req.name, scope: req.scope, enabled: !req.enabled } }
}

const HANDLERS = {
  plugin: togglePlugin,
  skill: toggleSkill,
  mcp: toggleMcp,
  hook: toggleHook,
  agent: toggleAgent
}

export function toggle(req, ctx) {
  try {
    if (!isObject(req)) refuse('request must be an object')
    if (!Object.hasOwn(HANDLERS, req.kind)) refuse(`unknown kind ${req.kind}`)
    if (typeof req.name !== 'string' || req.name === '') refuse('name is required')
    if (typeof req.enabled !== 'boolean') refuse('enabled must be true or false')
    return { ok: true, ...HANDLERS[req.kind](req, ctx, scanAll(ctx)) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
