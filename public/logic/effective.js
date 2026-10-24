import { state } from '../core/state.js'

export const SCOPE_KEY = { global: 'sg', project: 'sp', projectLocal: 'sl' }

export const SCOPE_TAG = {
  global: ['global', 'global'],
  project: ['project', 'project'],
  projectLocal: ['local', 'local']
}

export const EFF_GROUPS = [
  ['model', 'Model and output', ''],
  ['rules', 'Permissions', 'Lists add up from all files. An allow rule does not outrank a deny or ask rule.'],
  ['env', 'Environment', 'Per variable, the higher file wins. Values that look like secrets are masked.'],
  [
    'plugins',
    'Plugins and skills',
    'The Claude Code docs do not say how these merge. Storehouse shows the higher file for each key.'
  ],
  ['other', 'Other', '']
]

export function effRows() {
  return state.inventory.settings?.effective?.rows ?? []
}

export function effRow(key) {
  return effRows().find((r) => r.key === key)
}
