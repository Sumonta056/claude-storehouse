import fs from 'node:fs'
import path from 'node:path'
import { scanAll } from './scan/index.js'
import { hookSettingsPath, storehousePath } from './scan/hooks.js'
import { mutateJson, removeHookAt, Refusal } from './write/toggles.js'
import { writeText } from './write/files.js'
import { readJson } from './write/json-file.js'
import { isAllowed } from './write/paths.js'
import { HttpError, ok, isObject, requireString, requireKey, refused, checked, exists, recordSave } from './api.js'

const PROJECT_OFF = 'project scope is off; run claude-storehouse inside a project folder'

function requireProject(ctx) {
  if (!ctx.projectDir) throw new HttpError(400, PROJECT_OFF)
  return ctx.projectDir
}

function requireScope(scope, ctx) {
  if (scope !== 'global' && scope !== 'project') throw new HttpError(400, 'scope must be global or project')
  if (scope === 'project') requireProject(ctx)
  return scope
}

function objectAt(data, key, file) {
  if (data[key] === undefined) data[key] = {}
  if (!isObject(data[key])) throw new Refusal(`${key} in ${file} is not an object`)
  return data[key]
}

function objectIfPresent(data, key, file) {
  if (!isObject(data) || data[key] === undefined) return undefined
  if (!isObject(data[key])) throw new Refusal(`${key} in ${file} is not an object`)
  return data[key]
}

export function postHook({ body }, deps) {
  const { ctx } = deps
  const scope = requireScope(body?.scope, ctx)
  const event = requireKey(body.event, 'event')
  const command = requireString(body.command, 'command')
  if (body.matcher !== undefined && typeof body.matcher !== 'string') throw new HttpError(400, 'matcher must be a string')
  const file = hookSettingsPath(scope, ctx)
  const group = body.matcher ? { matcher: body.matcher, hooks: [{ type: 'command', command }] } : { hooks: [{ type: 'command', command }] }
  const result = refused(() =>
    mutateJson(file, ctx, (data) => {
      const hooks = objectAt(data, 'hooks', file)
      if (hooks[event] === undefined) hooks[event] = []
      if (!Array.isArray(hooks[event])) throw new Refusal(`hooks.${event} in ${file} is not an array`)
      hooks[event].push(group)
    })
  )
  const entry = recordSave(deps, file, `Added ${event} hook ${command}`, result.backup)
  return ok({ ok: true, file, backup: result.backup, entry })
}

export function deleteHook({ body }, deps) {
  const { ctx } = deps
  const id = requireString(body?.id, 'id')
  const item = scanAll(ctx).hooks.find((hook) => hook.id === id)
  if (!item) throw new HttpError(404, `hook ${id} not found`)
  if (item.scope === 'plugin' || item.file === 'plugin') {
    throw new HttpError(400, `hook ${item.command} comes from a plugin; switch the plugin instead`)
  }
  if (item.parked) {
    const file = storehousePath(ctx.home)
    const result = refused(() =>
      mutateJson(file, ctx, (data) => {
        if (Array.isArray(data.parkedHooks)) data.parkedHooks = data.parkedHooks.filter((e) => !isObject(e) || e.id !== id)
      })
    )
    const entry = recordSave(deps, file, `Deleted parked hook ${item.command}`, result.backup)
    return ok({ ok: true, file, backup: result.backup, entry })
  }
  const file = hookSettingsPath(item.file, ctx)
  if (!file) throw new HttpError(400, `hook ${id} has unknown file ${item.file}`)
  const result = refused(() => mutateJson(file, ctx, (data) => removeHookAt(data, item, file)))
  const entry = recordSave(deps, file, `Deleted ${item.event} hook ${item.command}`, result.backup)
  return ok({ ok: true, file, backup: result.backup, entry })
}

function mcpTarget(scope, origin, ctx) {
  if (origin === 'plugin' || scope === 'plugin') throw new HttpError(400, 'plugin MCP servers follow their plugin')
  const claudeJson = path.join(ctx.home, '.claude.json')
  if (origin === 'local') {
    requireProject(ctx)
    return {
      file: claudeJson,
      servers: (data, file) => objectAt(objectAt(objectAt(data, 'projects', file), ctx.projectDir, file), 'mcpServers', file),
      existing: (data, file) => objectIfPresent(objectIfPresent(objectIfPresent(data, 'projects', file), ctx.projectDir, file), 'mcpServers', file)
    }
  }
  requireScope(scope, ctx)
  const file = scope === 'global' ? claudeJson : path.join(ctx.projectDir, '.mcp.json')
  return {
    file,
    servers: (data, target) => objectAt(data, 'mcpServers', target),
    existing: (data, target) => objectIfPresent(data, 'mcpServers', target)
  }
}

function validMcpConfig(config) {
  return isObject(config) && (typeof config.command === 'string' || typeof config.url === 'string')
}

export function postMcp({ body }, deps) {
  const { ctx } = deps
  const scope = requireScope(body?.scope, ctx)
  const name = requireKey(body.name, 'name')
  if (!validMcpConfig(body.config)) throw new HttpError(400, 'config needs a string command or a string url')
  const { file, servers } = mcpTarget(scope, undefined, ctx)
  let duplicate = false
  const result = refused(() =>
    mutateJson(file, ctx, (data) => {
      const list = servers(data, file)
      if (Object.hasOwn(list, name)) {
        duplicate = true
        return
      }
      list[name] = body.config
    })
  )
  if (duplicate) throw new HttpError(409, `MCP server ${name} already exists in ${file}`)
  const entry = recordSave(deps, file, `Added MCP server ${name}`, result.backup)
  return ok({ ok: true, file, backup: result.backup, entry })
}

export function deleteMcp({ body }, deps) {
  const { ctx } = deps
  const name = requireKey(body?.name, 'name')
  const { file, existing } = mcpTarget(body.scope, body.origin, ctx)
  if (!exists(file)) throw new HttpError(404, `${file} not found`)
  const parsed = readJson(file)
  if (!parsed.ok) throw new HttpError(400, `cannot read ${file}: ${parsed.error}`)
  const current = refused(() => existing(parsed.data, file))
  if (!current || !Object.hasOwn(current, name)) throw new HttpError(404, `MCP server ${name} not found in ${file}`)
  const result = refused(() =>
    mutateJson(file, ctx, (data) => {
      const list = existing(data, file)
      if (list && Object.hasOwn(list, name)) delete list[name]
    })
  )
  const entry = recordSave(deps, file, `Removed MCP server ${name}`, result.backup)
  return ok({ ok: true, file, backup: result.backup, entry })
}

function claudeMdTemplate(template, title) {
  if (template === 'empty') return ''
  if (template === 'default') {
    return `# ${title}\n\n## What this project is\n\n## Commands\n\n## Conventions\n\n## Do not\n`
  }
  throw new HttpError(400, 'template must be default or empty')
}

function projectMd(name) {
  return (ctx, t) => {
    const dir = requireProject(ctx)
    return [path.join(dir, ...name), claudeMdTemplate(t, path.basename(dir))]
  }
}

const CREATE = {
  claudemd: projectMd(['CLAUDE.md']),
  claudemdLocal: projectMd(['CLAUDE.local.md']),
  claudemdClaudeDir: projectMd(['.claude', 'CLAUDE.md']),
  globalClaudemd: (ctx, t) => [path.join(ctx.home, '.claude', 'CLAUDE.md'), claudeMdTemplate(t, 'Global Claude instructions')],
  projectSettings: (ctx) => [path.join(requireProject(ctx), '.claude', 'settings.json'), '{}\n'],
  projectSettingsLocal: (ctx) => [path.join(requireProject(ctx), '.claude', 'settings.local.json'), '{}\n'],
  mcpJson: (ctx) => [path.join(requireProject(ctx), '.mcp.json'), '{\n  "mcpServers": {}\n}\n']
}

export function postCreate({ body }, deps) {
  const { ctx } = deps
  const what = body?.what
  if (typeof what !== 'string' || !Object.hasOwn(CREATE, what)) {
    throw new HttpError(400, `what must be one of ${Object.keys(CREATE).join(', ')}`)
  }
  if (body.template !== 'default' && body.template !== 'empty') throw new HttpError(400, 'template must be default or empty')
  const [file, content] = CREATE[what](ctx, body.template)
  const access = isAllowed(file, ctx)
  if (!access.allowed || access.readOnly) throw new HttpError(403, `${file} is not writable`)
  if (exists(file)) throw new HttpError(409, `${file} already exists`)
  checked(writeText(file, content, ctx))
  const entry = recordSave(deps, file, `Created ${path.basename(file)}`, null)
  return ok({ ok: true, file, content, entry })
}

function realOrNull(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

export function postFork({ body }, deps) {
  const { ctx } = deps
  if (body?.kind !== undefined && body.kind !== 'skill') throw new HttpError(400, 'only skills can be forked')
  const name = requireString(body?.name, 'name')
  const pluginId = requireString(body.plugin, 'plugin')
  if (name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new HttpError(400, 'name must be a plain folder name')
  const plugin = scanAll(ctx).plugins.find((p) => p.id === pluginId && !p.missing)
  const source = plugin ? path.join(plugin.installPath, 'skills', name) : null
  if (!plugin || !plugin.skills.includes(name) || !fs.existsSync(source)) {
    throw new HttpError(404, `skill ${name} not found in plugin ${pluginId}`)
  }
  const pluginsRoot = realOrNull(path.join(ctx.home, '.claude', 'plugins'))
  const realSource = realOrNull(source)
  const rel = pluginsRoot && realSource ? path.relative(pluginsRoot, realSource) : null
  if (rel === null || rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new HttpError(403, `${source} is outside the plugins folder`)
  }
  const target = path.join(ctx.home, '.claude', 'skills', name)
  const access = isAllowed(target, ctx)
  if (!access.allowed || access.readOnly) throw new HttpError(403, `${target} is not writable`)
  if (exists(target)) throw new HttpError(409, `${target} already exists`)
  fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false })
  const entry = recordSave(deps, target, `Forked skill ${name} from ${pluginId}`, null)
  return ok({ ok: true, path: target, entry })
}
