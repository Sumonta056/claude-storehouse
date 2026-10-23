import path from 'node:path'
import { readJson } from '../write/json-file.js'
import { splitId } from './plugins.js'

const MASK = '•••'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function maskValues(map) {
  const out = {}
  for (const key of Object.keys(map)) out[key] = MASK
  return out
}

function sanitize(config) {
  const out = { ...config }
  if (isObject(out.env)) out.env = maskValues(out.env)
  if (isObject(out.headers)) out.headers = maskValues(out.headers)
  return out
}

function describe(config) {
  const transport = config.type || (config.url ? 'http' : 'stdio')
  if (transport === 'stdio') {
    const args = Array.isArray(config.args) ? config.args : []
    const command = [config.command, ...args].filter((part) => part !== undefined && part !== '').join(' ')
    return { transport, command }
  }
  return { transport, url: config.url }
}

function build({ name, config, scope, origin, plugin, file, disabledKey, enabled, canToggle = true }) {
  const entry = { name, scope, origin }
  if (plugin) entry.plugin = plugin
  Object.assign(entry, describe(config))
  entry.config = sanitize(config)
  entry.enabled = enabled
  entry.canToggle = canToggle
  entry.path = file
  entry.disabledKey = disabledKey
  return entry
}

function serversOf(data) {
  if (!isObject(data)) return []
  const servers = isObject(data.mcpServers) ? data.mcpServers : {}
  return Object.entries(servers).filter(([, config]) => isObject(config))
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

export function scanMcp({ home, projectDir, plugins = [], mcpJsonLists = { enabled: [], disabled: [] } }) {
  const out = []
  const claudeJson = path.join(home, '.claude.json')
  const parsed = readJson(claudeJson)
  const root = parsed.ok && isObject(parsed.data) ? parsed.data : {}
  const projectEntry =
    projectDir && isObject(root.projects) && isObject(root.projects[projectDir]) ? root.projects[projectDir] : {}
  const disabled = new Set(stringList(projectEntry.disabledMcpServers))

  const perProject = Boolean(projectDir)
  for (const [name, config] of serversOf(root)) {
    out.push(
      build({ name, config, scope: 'global', origin: 'user', file: claudeJson, disabledKey: name, enabled: !disabled.has(name), canToggle: perProject })
    )
  }

  for (const [name, config] of serversOf(projectEntry)) {
    out.push(
      build({ name, config, scope: 'project', origin: 'local', file: claudeJson, disabledKey: name, enabled: !disabled.has(name) })
    )
  }

  const mcpJson = projectDir ? path.join(projectDir, '.mcp.json') : null
  const mcpResult = mcpJson ? readJson(mcpJson) : { ok: false }
  const enabledList = new Set(mcpJsonLists.enabled)
  const disabledList = new Set(mcpJsonLists.disabled)
  const enableAll = mcpJsonLists.enableAll === true
  if (mcpResult.ok) {
    for (const [name, config] of serversOf(mcpResult.data)) {
      out.push(
        build({
          name,
          config,
          scope: 'project',
          origin: 'mcpjson',
          file: mcpJson,
          disabledKey: name,
          enabled: (enableAll || enabledList.has(name)) && !disabledList.has(name)
        })
      )
    }
  }

  for (const plugin of plugins) {
    for (const { name, config } of plugin.mcp ?? []) {
      const disabledKey = `plugin:${splitId(plugin.id).name}:${name}`
      out.push(
        build({
          name,
          config,
          scope: 'plugin',
          origin: 'plugin',
          plugin: plugin.id,
          file: path.join(plugin.installPath, '.mcp.json'),
          disabledKey,
          enabled: plugin.enabled === true && !disabled.has(disabledKey),
          canToggle: perProject
        })
      )
    }
  }

  return out
}
