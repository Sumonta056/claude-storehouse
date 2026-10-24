export const items = new Map()

export const PERIOD_KEY = 'storehouse.usagePeriod'

export const SORT_KEY = 'storehouse.usageSort'

export const SORTS = [
  ['most', 'Most used'],
  ['least', 'Least used'],
  ['name', 'Name']
]

export const favOpen = new Map()

export const pending = new Set()

function readPeriod() {
  try {
    return localStorage.getItem(PERIOD_KEY) === 'all' ? 'all' : 'month'
  } catch {
    return 'month'
  }
}

function readSort() {
  try {
    const value = localStorage.getItem(SORT_KEY)
    return SORTS.some(([k]) => k === value) ? value : 'name'
  } catch {
    return 'name'
  }
}

export const chipFilter = {
  context: 'all',
  dups: 'all',
  doctor: 'all',
  plugins: 'all',
  mods: 'all',
  skills: 'all',
  agents: 'all',
  hooks: 'all',
  mcp: 'all'
}

export const groupOpen = new Map()

export const dr = {
  key: null,
  kind: null,
  mainFile: null,
  root: null,
  dir: null,
  file: null,
  loaded: '',
  stamp: null,
  editable: false,
  tab: 'file',
  seq: 0,
  opener: null,
  menu: false
}

export function freshHookForm() {
  return { open: false, scope: 'global', event: 'PreToolUse', matcher: '*', command: '', error: '', invalid: '' }
}

export function freshMcpForm() {
  return {
    open: false,
    scope: 'global',
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    url: '',
    env: '',
    error: '',
    invalid: ''
  }
}

export const cfg = {
  hook: freshHookForm(),
  mcp: freshMcpForm(),
  sview: 'files',
  efilter: 'all',
  ssel: null,
  stab: 'form',
  sforms: {},
  sformMsg: ''
}

export const eds = {}

export const bks = {}

export const msgs = {}

export const state = {
  inventory: null,
  scope: 'all',
  query: '',
  page: 'dash',
  projectFiles: null,
  usage: null,
  usageError: '',
  doctor: null,
  usagePeriod: readPeriod(),
  usageSort: readSort(),
  usageLoad: null,
  bannerDismissed: false,
  bannerShown: false,
  dragKey: null,
  favEditing: null,
  favNewName: '',
  favRenameValue: '',
  favPop: null,
  searchTimer: null,
  catalog: { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [] },
  menuKey: null,
  menuCtx: '',
  toastTimer: null,
  confirmState: null
}
