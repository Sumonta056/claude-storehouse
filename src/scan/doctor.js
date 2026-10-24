import fs from 'node:fs'
import path from 'node:path'
import { readJson } from '../write/json-file.js'
import { readMcpRaw } from './mcp.js'
import { scanSettings } from './settings.js'

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 }
const PROVIDED_VARS = new Set(['CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA', 'CLAUDE_PROJECT_DIR'])
const MAX_CLAUDE_MD_LINES = 200
const SETTINGS_SCOPES = ['global', 'project', 'projectLocal']
const CLAUDE_MD_KEYS = ['global', 'project', 'projectLocal', 'projectClaudeDir']

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function realOrNull(file) {
  try {
    return fs.realpathSync(file)
  } catch {
    return null
  }
}

function isExecutable(file) {
  try {
    if (!fs.statSync(file).isFile()) return false
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function firstWord(command) {
  const match = /^\s*((?:"[^"]*"|'[^']*'|[^\s"'])+)/.exec(command)
  return match ? match[1] : ''
}

function expandPath(word, { home, projectDir, pluginRoot }) {
  let text = word.replace(/["']/g, '')
  if (text.startsWith('~/')) text = path.join(home, text.slice(2))
  const project = /^\$\{?CLAUDE_PROJECT_DIR\}?(?=\/)/
  if (project.test(text)) {
    if (!projectDir) return null
    text = text.replace(project, projectDir)
  }
  const plugin = /^\$\{?CLAUDE_PLUGIN_ROOT\}?(?=\/)/
  if (plugin.test(text)) {
    if (!pluginRoot) return null
    text = text.replace(plugin, pluginRoot)
  }
  return path.isAbsolute(text) && !text.includes('$') ? text : null
}

function settingsFiles(inventory) {
  return SETTINGS_SCOPES.map((scope) => inventory.settings?.[scope]).filter(
    (file) => file && file.exists && file.ok && isObject(file.data)
  )
}

function under(file, roots) {
  return roots.some((root) => root && (file === root || file.startsWith(root + path.sep)))
}

function itemTarget(item) {
  const target = { kind: item.kind, name: item.name, scope: item.scope }
  if (item.plugin) target.plugin = item.plugin
  return target
}

function mcpTarget(server) {
  const target = { kind: 'mcp', name: server.name, scope: server.scope, origin: server.origin }
  if (server.plugin) target.plugin = server.plugin
  return target
}

function lineCount(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split('\n').length
    return text.endsWith('\n') ? lines - 1 : lines
  } catch {
    return 0
  }
}

function checkJson(inventory, add) {
  for (const error of inventory.errors ?? []) {
    if (typeof error.path !== 'string' || error.path.startsWith('section:')) continue
    add(1, 'error', {
      kind: 'file',
      name: path.basename(error.path),
      file: error.path,
      message: 'This file is not valid JSON. Claude Code cannot read it.',
      target: null
    })
  }
}

function checkHooks(ctx, add) {
  const roots = new Map((ctx.inventory.plugins ?? []).map((plugin) => [plugin.id, plugin.installPath]))
  for (const hook of ctx.inventory.hooks ?? []) {
    if (!hook.enabled || typeof hook.command !== 'string') continue
    ctx.checked.add(hook.path)
    const word = firstWord(hook.command)
    const file = expandPath(word, { ...ctx, pluginRoot: hook.plugin ? roots.get(hook.plugin) : null })
    if (!file || fs.existsSync(file)) continue
    add(2, 'warning', {
      kind: 'hook',
      name: word,
      file: hook.path,
      message: `The ${hook.event} hook runs ${word}, but this file does not exist.`,
      target: { kind: 'hook', id: hook.id },
      key: hook.id
    })
  }
}

function commandFound(command, server, ctx) {
  let text = command
  if (server.pluginRoot) text = text.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, server.pluginRoot)
  if (text.includes('$')) return { known: false }
  if (text.startsWith('~/')) text = path.join(ctx.home, text.slice(2))
  if (text.includes('/') || text.includes(path.sep)) {
    if (!path.isAbsolute(text)) return { known: false }
    return { known: true, found: isExecutable(text), onPath: false }
  }
  return { known: true, found: ctx.pathDirs.some((dir) => isExecutable(path.join(dir, text))), onPath: true }
}

function checkMcp(ctx, raw, add) {
  const defined = new Set(Object.keys(ctx.env ?? {}))
  for (const file of settingsFiles(ctx.inventory)) {
    if (isObject(file.data.env)) for (const key of Object.keys(file.data.env)) defined.add(key)
  }
  for (const server of raw) {
    if (!server.enabled) continue
    ctx.checked.add(server.file)
    if (server.command) {
      const result = commandFound(server.command, server, ctx)
      if (result.known && !result.found) {
        add(3, 'warning', {
          kind: 'mcp',
          name: server.name,
          file: server.file,
          message: result.onPath
            ? `Command ${server.command} is not found on the PATH of this terminal. The server does not start.`
            : `Command ${server.command} does not exist or cannot run. The server does not start.`,
          target: mcpTarget(server)
        })
      }
    }
    const missing = server.vars.filter((name) => !PROVIDED_VARS.has(name) && !defined.has(name))
    if (missing.length) {
      add(4, 'warning', {
        kind: 'mcp',
        name: server.name,
        file: server.file,
        message: `Uses ${missing.map((name) => `\${${name}}`).join(', ')}, but this terminal and settings env do not set it.`,
        target: mcpTarget(server)
      })
    }
  }
}

function installedIds(home) {
  const result = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))
  if (!result.ok || !isObject(result.data) || !isObject(result.data.plugins)) return new Set()
  return new Set(Object.keys(result.data.plugins))
}

function checkSettingsKeys(ctx, add) {
  const installed = installedIds(ctx.home)
  const skills = new Set((ctx.inventory.skills ?? []).map((skill) => skill.name))
  for (const file of settingsFiles(ctx.inventory)) {
    ctx.checked.add(file.path)
    if (isObject(file.data.enabledPlugins)) {
      for (const id of Object.keys(file.data.enabledPlugins)) {
        if (installed.has(id)) continue
        add(5, 'warning', {
          kind: 'plugin',
          name: id,
          file: file.path,
          message: `enabledPlugins names ${id}, but this plugin is not installed.`,
          target: null
        })
      }
    }
    if (isObject(file.data.skillOverrides)) {
      for (const name of Object.keys(file.data.skillOverrides)) {
        if (skills.has(name)) continue
        add(6, 'warning', {
          kind: 'skill',
          name,
          file: file.path,
          message: `skillOverrides names ${name}, but no skill has this name.`,
          target: null
        })
      }
    }
  }
}

function checkDuplicates(inventory, add) {
  for (const [kind, list, word] of [
    ['skill', inventory.skills, 'skills'],
    ['agent', inventory.agents, 'agents'],
    ['mcp', inventory.mcp, 'MCP servers']
  ]) {
    const on = new Map()
    for (const item of list ?? []) {
      if (item.enabled) on.set(item.name, (on.get(item.name) ?? 0) + 1)
    }
    for (const [name, count] of on) {
      if (count < 2) continue
      add(7, 'warning', {
        kind,
        name,
        file: null,
        message: `${count} ${word} named ${name} are on. Claude Code sees more than one.`,
        target: { page: 'dups' }
      })
    }
  }
}

function ownItems(inventory) {
  return [...(inventory.skills ?? []), ...(inventory.agents ?? [])].filter((item) => item.scope !== 'plugin')
}

function checkDescriptions(ctx, add) {
  for (const item of ownItems(ctx.inventory)) {
    ctx.checked.add(item.path)
    if (item.hasDescription !== false) continue
    add(8, 'info', {
      kind: item.kind,
      name: item.name,
      file: item.path,
      message: `This ${item.kind} has no description in its frontmatter. Claude uses the description to pick it.`,
      target: itemTarget(item)
    })
  }
}

function checkLinks(ctx, add) {
  for (const entry of ctx.inventory.skipped ?? []) {
    ctx.checked.add(entry.path)
    add(9, 'info', {
      kind: entry.kind,
      name: path.basename(entry.path),
      file: entry.path,
      message: 'This link points to a file that does not exist. Claude Code skips it.',
      target: null
    })
  }
  const roots = [realOrNull(ctx.home), ctx.projectDir ? realOrNull(ctx.projectDir) : null]
  for (const item of ownItems(ctx.inventory)) {
    if (!item.realPath || under(item.realPath, roots)) continue
    add(9, 'info', {
      kind: item.kind,
      name: item.name,
      file: item.path,
      message: 'This link points outside the home folder and the project. Storehouse cannot edit it.',
      target: itemTarget(item)
    })
  }
}

function checkClaudeMd(ctx, add) {
  for (const key of CLAUDE_MD_KEYS) {
    const entry = ctx.inventory.claudeMd?.[key]
    if (!entry || !entry.exists) continue
    ctx.checked.add(entry.path)
    const lines = lineCount(entry.path)
    if (lines <= MAX_CLAUDE_MD_LINES) continue
    add(10, 'info', {
      kind: 'claudemd',
      name: path.basename(entry.path),
      file: entry.path,
      message: `This file has ${lines} lines. Claude Code loads all of it in every session. Keep it under ${MAX_CLAUDE_MD_LINES}.`,
      target: null
    })
  }
}

export function scanDoctor({ home, projectDir, inventory, env = {}, pathDirs = [] }) {
  const issues = []
  const ids = new Set()
  const add = (check, severity, { key, ...fields }) => {
    const base = `${check}:${fields.kind}:${fields.file ?? ''}:${key ?? fields.name}`
    let id = base
    for (let n = 2; ids.has(id); n++) id = `${base}#${n}`
    ids.add(id)
    issues.push({ id, check, severity, ...fields })
  }
  const ctx = { home, projectDir, inventory, env, pathDirs, checked: new Set() }
  const raw = readMcpRaw({
    home,
    projectDir,
    plugins: inventory.plugins ?? [],
    mcpJsonLists: scanSettings({ home, projectDir }).mcpJsonLists
  })

  checkJson(inventory, add)
  checkHooks(ctx, add)
  checkMcp(ctx, raw, add)
  checkSettingsKeys(ctx, add)
  checkDuplicates(inventory, add)
  checkDescriptions(ctx, add)
  checkLinks(ctx, add)
  checkClaudeMd(ctx, add)

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.check - b.check)
  ctx.checked.delete(null)
  ctx.checked.delete(undefined)
  return { issues, checked: ctx.checked.size }
}
