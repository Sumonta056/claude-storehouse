import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter, firstBodyLine } from './frontmatter.js'

const SUFFIXES = ['.md.disabled', '.md']

function stripSuffix(fileName) {
  for (const suffix of SUFFIXES) {
    if (fileName.endsWith(suffix)) return fileName.slice(0, -suffix.length)
  }
  return null
}

function toolList(value) {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return null
  }
}

function safeRealPath(file) {
  try {
    return fs.realpathSync(file)
  } catch {
    return file
  }
}

function readItem(file, fileName, scope, source, pluginId, enabled, readOnly) {
  const name = stripSuffix(fileName)
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const meta = parseFrontmatter(text)
  const item = {
    kind: 'agent',
    name,
    description: meta.description || firstBodyLine(meta.body),
    model: typeof meta.model === 'string' ? meta.model : '',
    tools: toolList(meta.tools),
    scope,
    source,
    path: file,
    realPath: safeRealPath(file),
    mtime: mtimeOf(file),
    enabled,
    readOnly,
    canToggle: !readOnly,
    favorite: false
  }
  if (pluginId) item.plugin = pluginId
  return item
}

function scanFolder(root, scope, source) {
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (!(entry.isFile() || entry.isSymbolicLink())) continue
    if (stripSuffix(entry.name) === null) continue
    const item = readItem(
      path.join(root, entry.name),
      entry.name,
      scope,
      source,
      null,
      !entry.name.endsWith('.md.disabled'),
      false
    )
    if (item) out.push(item)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function scanAgents({ home, projectDir, plugins = [] }) {
  const items = [
    ...scanFolder(path.join(home, '.claude', 'agents'), 'global', 'local'),
    ...(projectDir ? scanFolder(path.join(projectDir, '.claude', 'agents'), 'project', 'project') : [])
  ]
  for (const plugin of plugins) {
    if (plugin.missing) continue
    for (const name of plugin.agents) {
      const item = readItem(
        path.join(plugin.installPath, 'agents', `${name}.md`),
        `${name}.md`,
        'plugin',
        plugin.id,
        plugin.id,
        plugin.enabled,
        true
      )
      if (item) items.push(item)
    }
  }
  return items
}
