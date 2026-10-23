import fs from 'node:fs'
import path from 'node:path'
import { readManifest, readModules } from './plugins.js'

function realUnder(full, root) {
  try {
    const rel = path.relative(fs.realpathSync(root), fs.realpathSync(full))
    return !rel.startsWith('..') && !path.isAbsolute(rel) && fs.statSync(full).isDirectory()
  } catch {
    return false
  }
}

function listDirs(dir, home) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          !entry.name.startsWith('.') &&
          (entry.isDirectory() || (entry.isSymbolicLink() && realUnder(path.join(dir, entry.name), home)))
      )
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function mtimeOf(dir) {
  try {
    return fs.statSync(dir).mtimeMs
  } catch {
    return null
  }
}

export function scanDevMods({ home }) {
  const root = path.join(home, '.claude', 'dev-mods')
  const out = []
  for (const session of listDirs(root, home)) {
    for (const folder of listDirs(path.join(root, session), home)) {
      const dir = path.join(root, session, folder)
      if (!fs.existsSync(path.join(dir, '.claude-plugin', 'plugin.json'))) continue
      const manifest = readManifest(dir)
      out.push({
        id: `${session}/${folder}`,
        name: typeof manifest.name === 'string' ? manifest.name : folder,
        session,
        version: typeof manifest.version === 'string' ? manifest.version : '',
        description: typeof manifest.description === 'string' ? manifest.description : '',
        path: dir,
        mtime: mtimeOf(dir),
        modules: readModules(dir)
      })
    }
  }
  return out
}
