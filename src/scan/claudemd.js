import fs from 'node:fs'
import path from 'node:path'

function describe(file) {
  try {
    const stat = fs.statSync(file)
    if (stat.isFile()) return { path: file, exists: true, size: stat.size }
  } catch {
    return { path: file, exists: false, size: 0 }
  }
  return { path: file, exists: false, size: 0 }
}

export function scanClaudeMd({ home, projectDir }) {
  const global = describe(path.join(home, '.claude', 'CLAUDE.md'))
  if (!projectDir) return { global, project: null, projectLocal: null, projectClaudeDir: null }
  return {
    global,
    project: describe(path.join(projectDir, 'CLAUDE.md')),
    projectLocal: describe(path.join(projectDir, 'CLAUDE.local.md')),
    projectClaudeDir: describe(path.join(projectDir, '.claude', 'CLAUDE.md'))
  }
}
