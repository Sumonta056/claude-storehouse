import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from './frontmatter.js'

function describe(file) {
  try {
    const stat = fs.statSync(file)
    if (stat.isFile()) return { path: file, exists: true, size: stat.size }
  } catch {
    return { path: file, exists: false, size: 0 }
  }
  return { path: file, exists: false, size: 0 }
}

function isConditional(text) {
  const { paths } = parseFrontmatter(text)
  return Array.isArray(paths) ? paths.length > 0 : Boolean(paths) && !/^\[\s*\]$/.test(paths)
}

function realOrNull(file) {
  try {
    return fs.realpathSync(file)
  } catch {
    return null
  }
}

function under(file, roots) {
  return roots.some((root) => root && (file === root || file.startsWith(root + path.sep)))
}

function readRule(file, scope, roots) {
  try {
    if (!under(realOrNull(file), roots)) return null
    const stat = fs.statSync(file)
    if (!stat.isFile()) return null
    return { path: file, size: stat.size, scope, conditional: isConditional(fs.readFileSync(file, 'utf8')) }
  } catch {
    return null
  }
}

function scanRules(dir, scope, roots) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...scanRules(full, scope, roots))
    else if (entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink())) {
      const rule = readRule(full, scope, roots)
      if (rule) out.push(rule)
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

export function scanClaudeMd({ home, projectDir }) {
  const global = describe(path.join(home, '.claude', 'CLAUDE.md'))
  const roots = [realOrNull(home), projectDir ? realOrNull(projectDir) : null]
  const globalRules = scanRules(path.join(home, '.claude', 'rules'), 'global', roots)
  if (!projectDir) return { global, project: null, projectLocal: null, projectClaudeDir: null, rules: globalRules }
  return {
    global,
    project: describe(path.join(projectDir, 'CLAUDE.md')),
    projectLocal: describe(path.join(projectDir, 'CLAUDE.local.md')),
    projectClaudeDir: describe(path.join(projectDir, '.claude', 'CLAUDE.md')),
    rules: [...globalRules, ...scanRules(path.join(projectDir, '.claude', 'rules'), 'project', roots)]
  }
}
