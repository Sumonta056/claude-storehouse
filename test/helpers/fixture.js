import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

function replacePlaceholder(dir, projectDir, homeDir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      replacePlaceholder(full, projectDir, homeDir)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const text = fs.readFileSync(full, 'utf8')
      if (text.includes('__PROJECT__') || text.includes('__HOME__')) {
        fs.writeFileSync(full, text.split('__PROJECT__').join(projectDir).split('__HOME__').join(homeDir))
      }
    }
  }
}

export function makeFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-')))
  const home = path.join(root, 'home')
  const projectDir = path.join(root, 'project')
  const options = { recursive: true, verbatimSymlinks: true }
  fs.cpSync(path.join(fixturesDir, 'home'), home, options)
  fs.cpSync(path.join(fixturesDir, 'project'), projectDir, options)
  replacePlaceholder(home, projectDir, home)
  return {
    home,
    projectDir,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  }
}
