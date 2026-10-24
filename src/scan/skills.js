import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter, firstBodyLine } from './frontmatter.js'

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

function hasText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isBrokenLink(entry, full) {
  return entry.isSymbolicLink() && !fs.existsSync(full)
}

function describe(file, fallbackName) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const meta = parseFrontmatter(text)
  return {
    name: meta.name || fallbackName,
    description: meta.description || firstBodyLine(meta.body),
    hasDescription: hasText(meta.description),
    size: Buffer.byteLength(text)
  }
}

function entriesOf(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'))
  } catch {
    return []
  }
}

function isDir(full) {
  try {
    return fs.statSync(full).isDirectory()
  } catch {
    return false
  }
}

function buildItem(file, fallback, scope, source, pluginId, enabledFor) {
  const info = describe(file, fallback)
  if (!info) return null
  const readOnly = scope === 'plugin'
  const item = {
    kind: 'skill',
    name: info.name,
    description: info.description,
    hasDescription: info.hasDescription,
    size: info.size,
    scope,
    source,
    path: file,
    realPath: safeRealPath(file),
    mtime: mtimeOf(file),
    enabled: enabledFor(info.name),
    readOnly,
    canToggle: !readOnly,
    favorite: false
  }
  if (pluginId) item.plugin = pluginId
  return item
}

function scanFolder(root, scope, source, enabledFor, skipped) {
  const out = []
  for (const entry of entriesOf(root)) {
    const full = path.join(root, entry.name)
    if (isBrokenLink(entry, full)) {
      skipped.push({ kind: 'skill', path: full, reason: 'broken-link' })
      continue
    }
    let item = null
    if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(full))) {
      item = buildItem(path.join(full, 'SKILL.md'), entry.name, scope, source, null, enabledFor)
    } else if (entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink())) {
      item = buildItem(full, entry.name.slice(0, -3), scope, source, null, enabledFor)
    }
    if (item) out.push(item)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function scanSkills({ home, projectDir, plugins = [], skillOverrides = {}, skipped = [] }) {
  const overrides = skillOverrides ?? {}
  const enabledByOverride = (name) => overrides[name] !== 'off'
  const items = [
    ...scanFolder(path.join(home, '.claude', 'skills'), 'global', 'local', enabledByOverride, skipped),
    ...(projectDir
      ? scanFolder(path.join(projectDir, '.claude', 'skills'), 'project', 'project', enabledByOverride, skipped)
      : [])
  ]
  for (const plugin of plugins) {
    if (plugin.missing) continue
    for (const name of plugin.skills) {
      const file = path.join(plugin.installPath, 'skills', name, 'SKILL.md')
      const item = buildItem(file, name, 'plugin', plugin.id, plugin.id, () => plugin.enabled)
      if (item) items.push(item)
    }
  }
  return items
}
