import { isPlain, plural } from '../core/format.js'
import { cfg, eds, state } from '../core/state.js'

const EFFORT = ['low', 'medium', 'high']

const MODES = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']

export const FORM_GROUPS = [
  ['model', 'Model and output'],
  ['perm', 'Permissions']
]

export const FORM_FIELDS = [
  {
    key: 'model',
    group: 'model',
    name: 'Model',
    type: 'text',
    help: 'The model that every new session uses. You do not have to pick one with <code>/model</code> each time.'
  },
  {
    key: 'effortLevel',
    group: 'model',
    name: 'Effort',
    type: 'select',
    options: EFFORT,
    help: 'The default effort level for models that have no saved level.'
  },
  { key: 'outputStyle', group: 'model', name: 'Output style', type: 'text', help: 'The output style, by name.' },
  { key: 'theme', group: 'model', name: 'Theme', type: 'text', help: 'The color theme of the interface.' },
  {
    key: 'permissions.defaultMode',
    path: ['permissions', 'defaultMode'],
    group: 'perm',
    name: 'Start mode',
    type: 'select',
    options: MODES,
    help: 'The permission mode that new sessions start in.'
  },
  {
    key: 'skipDangerousModePermissionPrompt',
    group: 'perm',
    name: 'Skip the dangerous-mode prompt',
    type: 'switch',
    help: 'Skip the confirm dialog before a session enters <code>bypassPermissions</code> mode.'
  }
]

export const ELSEWHERE = [
  ['enabledPlugins', 'plugins', 'Plugins'],
  ['skillOverrides', 'skills', 'Skills'],
  ['hooks', 'hooks', 'Hooks']
]

export const SET_ORDER = ['sg', 'sp', 'sl']

export function cfgPanels() {
  const inv = state.inventory
  const s = inv.settings ?? {}
  const m = inv.claudeMd ?? {}
  return {
    sg: { info: s.global, label: 'Global', file: '~/.claude/settings.json' },
    sp: { info: s.project, label: 'Project', file: '.claude/settings.json', create: 'projectSettings', del: true },
    sl: {
      info: s.projectLocal,
      label: 'Project local',
      file: '.claude/settings.local.json',
      create: 'projectSettingsLocal',
      del: true,
      pill: 'git-ignored'
    },
    mg: { info: m.global, label: 'Global', file: '~/.claude/CLAUDE.md', create: 'globalClaudemd', md: true, del: true },
    mp: { info: m.project, label: 'Project', file: './CLAUDE.md', create: 'claudemd', md: true, del: true },
    ml: {
      info: m.projectLocal,
      label: 'Project local',
      file: './CLAUDE.local.md',
      create: 'claudemdLocal',
      md: true,
      del: true,
      pill: 'git-ignored'
    },
    mc: {
      info: m.projectClaudeDir,
      label: 'Project .claude folder',
      file: './.claude/CLAUDE.md',
      create: 'claudemdClaudeDir',
      md: true,
      del: true
    }
  }
}

export function edDirty(ed) {
  return Boolean(ed && ed.status === 'ready' && ed.text !== ed.loaded)
}

export function setData(k) {
  const d = cfgPanels()[k]?.info?.data
  return isPlain(d) ? d : {}
}

export function fieldPath(f) {
  return f.path ?? [f.key]
}

export function fieldGet(data, f) {
  let v = data
  for (const part of fieldPath(f)) v = isPlain(v) ? v[part] : undefined
  return v
}

export function fieldSet(data, f, value) {
  const path = fieldPath(f)
  let parent = data
  for (const part of path.slice(0, -1)) {
    if (parent[part] === undefined) {
      if (value === '') return
      parent[part] = {}
    }
    parent = parent[part]
  }
  const last = path.at(-1)
  if (value === '') delete parent[last]
  else parent[last] = value
}

function sformBase(k) {
  const data = setData(k)
  const text = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v))
  return Object.fromEntries(
    FORM_FIELDS.map((f) => [f.key, f.type === 'switch' ? fieldGet(data, f) === true : text(fieldGet(data, f))])
  )
}

export function lockedKeys(k) {
  const data = setData(k)
  return FORM_FIELDS.filter((f) => {
    const parent = f.path ? data[f.path[0]] : data
    if (parent !== undefined && !isPlain(parent)) return true
    const v = fieldGet(data, f)
    return v !== undefined && typeof v !== (f.type === 'switch' ? 'boolean' : 'string')
  }).map((f) => f.key)
}

export function lockedText(value) {
  if (Array.isArray(value)) return `list of ${value.length}`
  if (isPlain(value)) return `object with ${Object.keys(value).length} keys`
  return `${typeof value} ${JSON.stringify(value)}`
}

export function formValue(value) {
  return typeof value === 'string' ? value.trim() : value
}

export function sformValues(k) {
  return cfg.sforms[k] ? cfg.sforms[k].values : sformBase(k)
}

export function sformDirtyKeys(k) {
  const form = cfg.sforms[k]
  if (!form) return []
  const locked = lockedKeys(k)
  return FORM_FIELDS.map((f) => f.key).filter(
    (key) => !locked.includes(key) && formValue(form.values[key]) !== formValue(form.base[key])
  )
}

export function sformEdit(k, key, value) {
  if (!cfg.sforms[k]) {
    const base = sformBase(k)
    cfg.sforms[k] = { base, values: { ...base } }
  }
  cfg.sforms[k].values[key] = value
}

export function setDirty(k) {
  return sformDirtyKeys(k).length > 0 || edDirty(eds[k])
}

export function cfgDirty() {
  return SET_ORDER.some((k) => sformDirtyKeys(k).length > 0) || Object.values(eds).some(edDirty)
}

export function markStale() {
  for (const ed of Object.values(eds)) if (!edDirty(ed)) ed.stale = true
}

export function isCfgPage() {
  return state.page === 'settings' || state.page === 'claudemd'
}

export function dropMissing(k) {
  if (!edDirty(eds[k])) delete eds[k]
}

export function shortValue(value) {
  if (Array.isArray(value)) return `list of ${value.length}`
  if (isPlain(value)) return plural(Object.keys(value).length, 'key')
  const text = JSON.stringify(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

export function elsewhereText(key, value) {
  const values = isPlain(value) ? Object.values(value) : []
  if (key === 'enabledPlugins')
    return `${plural(values.length, 'plugin')} · ${values.filter((x) => x === false).length} off`
  if (key === 'skillOverrides') return `${plural(values.filter((x) => x === 'off').length, 'skill')} off`
  return plural(values.length, 'event')
}

export const MD_ORDER = ['mg', 'mp', 'mc', 'ml']

export const cmd = { sel: null }

export function mdDirtyKey() {
  return MD_ORDER.find((k) => edDirty(eds[k])) ?? null
}
