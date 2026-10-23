import fs from 'node:fs'
import path from 'node:path'
import { readJson } from '../write/json-file.js'
import { flattenHookGroups } from './settings.js'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return null
  }
}

function listDirs(dir, predicate) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && predicate(entry))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function listSkills(installPath) {
  const root = path.join(installPath, 'skills')
  return listDirs(root, (entry) => fs.existsSync(path.join(root, entry.name, 'SKILL.md')))
}

function listAgents(installPath) {
  try {
    return fs
      .readdirSync(path.join(installPath, 'agents'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name.slice(0, -3))
      .sort()
  } catch {
    return []
  }
}

function readHooks(installPath, id) {
  const file = path.join(installPath, 'hooks', 'hooks.json')
  const result = readJson(file)
  if (!result.ok || !isObject(result.data)) return []
  return flattenHookGroups(result.data.hooks, { scope: 'plugin', file: 'plugin', path: file }).map((hook) => ({
    ...hook,
    plugin: id
  }))
}

function serversFrom(data) {
  if (!isObject(data)) return []
  const servers = isObject(data.mcpServers) ? data.mcpServers : data
  return Object.entries(servers)
    .filter(([, config]) => isObject(config))
    .map(([name, config]) => ({ name, config }))
}

function readManifest(installPath) {
  const result = readJson(path.join(installPath, '.claude-plugin', 'plugin.json'))
  return result.ok && isObject(result.data) ? result.data : {}
}

function insidePath(installPath, relative) {
  const target = path.resolve(installPath, relative)
  const rel = path.relative(installPath, target)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? target : null
}

function readMcp(installPath, manifest) {
  const sources = []
  const mcpJson = readJson(path.join(installPath, '.mcp.json'))
  if (mcpJson.ok) sources.push(serversFrom(mcpJson.data))
  if (isObject(manifest.mcpServers)) {
    sources.push(serversFrom({ mcpServers: manifest.mcpServers }))
  } else if (typeof manifest.mcpServers === 'string') {
    const target = insidePath(installPath, manifest.mcpServers)
    const result = target ? readJson(target) : { ok: false }
    if (result.ok) sources.push(serversFrom(result.data))
  }
  const seen = new Set()
  const out = []
  for (const entry of sources.flat()) {
    if (seen.has(entry.name)) continue
    seen.add(entry.name)
    out.push(entry)
  }
  return out
}

export function splitId(id) {
  const at = id.lastIndexOf('@')
  if (at <= 0) return { name: id, marketplace: '' }
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) }
}

function buildPlugin(id, entry, enabledPlugins) {
  const { name, marketplace } = splitId(id)
  const installPath = typeof entry.installPath === 'string' ? entry.installPath : ''
  const missing = !installPath || !fs.existsSync(installPath)
  const manifest = missing ? {} : readManifest(installPath)
  return {
    id,
    name: typeof manifest.name === 'string' ? manifest.name : name,
    marketplace,
    version: manifest.version ?? entry.version ?? '',
    scope: entry.scope === 'user' ? 'global' : 'project',
    installPath,
    missing,
    mtime: missing ? null : mtimeOf(installPath),
    enabled: enabledPlugins?.[id] === true,
    description: typeof manifest.description === 'string' ? manifest.description : '',
    skills: missing ? [] : listSkills(installPath),
    agents: missing ? [] : listAgents(installPath),
    hooks: missing ? [] : readHooks(installPath, id),
    mcp: missing ? [] : readMcp(installPath, manifest)
  }
}

export function scanPlugins({ home, projectDir, enabledPlugins }) {
  const result = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))
  if (!result.ok || !isObject(result.data) || !isObject(result.data.plugins)) return []
  const out = []
  for (const [id, entries] of Object.entries(result.data.plugins)) {
    if (!Array.isArray(entries)) continue
    const valid = entries.filter(isObject)
    const entry =
      valid.find((c) => (c.scope === 'project' || c.scope === 'local') && projectDir && c.projectPath === projectDir) ??
      valid.find((c) => c.scope === 'user')
    if (entry) out.push(buildPlugin(id, entry, enabledPlugins))
  }
  return out
}
