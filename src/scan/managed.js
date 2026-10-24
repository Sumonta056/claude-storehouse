import fs from 'node:fs'
import path from 'node:path'

export function platformManagedDir(platform = process.platform) {
  if (platform === 'darwin') return '/Library/Application Support/ClaudeCode'
  if (platform === 'win32') return 'C:\\Program Files\\ClaudeCode'
  return '/etc/claude-code'
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

export function hasManagedSettings(dir) {
  if (isFile(path.join(dir, 'managed-settings.json'))) return true
  const drop = path.join(dir, 'managed-settings.d')
  try {
    return fs
      .readdirSync(drop)
      .some((name) => !name.startsWith('.') && name.endsWith('.json') && isFile(path.join(drop, name)))
  } catch {
    return false
  }
}
