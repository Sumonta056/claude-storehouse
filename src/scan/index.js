import fs from 'node:fs'
import path from 'node:path'
import { readJson } from '../write/json-file.js'
import { scanSettings } from './settings.js'
import { scanPlugins } from './plugins.js'
import { scanDevMods } from './mods.js'
import { scanSkills } from './skills.js'
import { scanAgents } from './agents.js'
import { scanMcp } from './mcp.js'
import { scanClaudeMd } from './claudemd.js'
import { applyFavorites, readCategories } from './favorites.js'
import { hookId, scanParkedHooks, storehousePath } from './hooks.js'

function attempt(errors, section, fn, fallback) {
  try {
    return fn()
  } catch (err) {
    errors.push({ path: `section:${section}`, error: err.message })
    return fallback
  }
}

function jsonError(file) {
  const result = readJson(file)
  if (!result.ok && result.raw !== null) return { path: file, error: result.error }
  return null
}

function withId(hook, enabled, canToggle, projectDir) {
  return {
    ...hook,
    id: hookId(hook.file, hook.event, hook.matcher, hook.command, projectDir),
    enabled,
    canToggle: canToggle && typeof hook.command === 'string'
  }
}

export function scanAll({ home, projectDir }) {
  const errors = []
  const globalDir = path.join(home, '.claude')

  const settings = attempt(errors, 'settings', () => scanSettings({ home, projectDir }), {
    files: [],
    hooks: [],
    enabledPlugins: {},
    skillOverrides: {},
    mcpJsonLists: { enabled: [], disabled: [] }
  })
  for (const file of settings.files) {
    if (file.ok === false) errors.push({ path: file.path, error: file.error })
  }

  for (const file of [
    path.join(home, '.claude.json'),
    projectDir ? path.join(projectDir, '.mcp.json') : null,
    path.join(globalDir, 'plugins', 'installed_plugins.json'),
    storehousePath(home)
  ].filter(Boolean)) {
    const found = jsonError(file)
    if (found) errors.push(found)
  }

  const plugins = attempt(
    errors,
    'plugins',
    () => scanPlugins({ home, projectDir, enabledPlugins: settings.enabledPlugins }),
    []
  )
  const skills = attempt(
    errors,
    'skills',
    () => scanSkills({ home, projectDir, plugins, skillOverrides: settings.skillOverrides }),
    []
  )
  const agents = attempt(errors, 'agents', () => scanAgents({ home, projectDir, plugins }), [])
  const mcp = attempt(
    errors,
    'mcp',
    () => scanMcp({ home, projectDir, plugins, mcpJsonLists: settings.mcpJsonLists }),
    []
  )
  const claudeMd = attempt(errors, 'claudemd', () => scanClaudeMd({ home, projectDir }), {
    global: null,
    project: null,
    projectLocal: null,
    projectClaudeDir: null,
    rules: []
  })

  const byScope = Object.fromEntries(settings.files.map((file) => [file.scope, file]))

  const inventory = {
    project: {
      dir: projectDir ?? null,
      hasClaudeDir: projectDir ? fs.existsSync(path.join(projectDir, '.claude')) : false
    },
    global: { dir: globalDir },
    skills,
    agents,
    plugins,
    devMods: attempt(errors, 'devMods', () => scanDevMods({ home }), []),
    hooks: [
      ...settings.hooks.map((hook) => withId(hook, true, true, projectDir)),
      ...plugins.flatMap((plugin) => plugin.hooks.map((hook) => withId(hook, plugin.enabled, false, projectDir))),
      ...attempt(errors, 'parkedHooks', () => scanParkedHooks({ home, projectDir }), [])
    ],
    mcp,
    settings: { global: byScope.global, project: byScope.project, projectLocal: byScope.projectLocal },
    claudeMd,
    favorites: [],
    errors
  }
  inventory.favorites = attempt(errors, 'favorites', () => applyFavorites(inventory, home), [])
  inventory.favoriteCategories = attempt(errors, 'favoriteCategories', () => readCategories(home), [])
  return inventory
}
