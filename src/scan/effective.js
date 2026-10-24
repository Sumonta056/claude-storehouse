const ORDER = ['projectLocal', 'project', 'global']
const OBJECTS = new Set(['permissions', 'env', 'enabledPlugins', 'skillOverrides', 'modelSettings'])
const BRACKET = new Set(['enabledPlugins', 'skillOverrides', 'modelSettings'])
const SKIP = new Set(['hooks'])
const CHAIN = new Set(['fallbackModel', 'modelPicker'])
const USER_ONLY = new Set(['modelPicker'])
const GLOBAL_ONLY_MODES = new Set(['auto', 'bypassPermissions'])
const SILENT = new Set(['enabledPlugins', 'skillOverrides'])
const MODEL_KEYS = new Set([
  'model',
  'effortLevel',
  'outputStyle',
  'theme',
  'fallbackModel',
  'availableModels',
  'modelPicker',
  'modelSettings'
])
const GROUPS = ['model', 'rules', 'env', 'plugins', 'other']
const SECRET = /token|secret|key|password|passwd|auth|credential|cookie|session/i
const NAME = /^[A-Za-z_$][\w$-]*$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mask(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 8 ? `••••${text.slice(-4)}` : '••••'
}

function groupOf(top) {
  if (MODEL_KEYS.has(top)) return 'model'
  if (top === 'permissions') return 'rules'
  if (top === 'env') return 'env'
  if (SILENT.has(top)) return 'plugins'
  return 'other'
}

function label(parts) {
  return parts
    .map((part, i) => {
      if (i === 0) return part
      return BRACKET.has(parts[0]) || !NAME.test(part) ? `[${JSON.stringify(part)}]` : `.${part}`
    })
    .join('')
}

function entries(data, scope, invalid) {
  const out = []
  for (const [top, value] of Object.entries(data)) {
    if (SKIP.has(top) || value === null) continue
    if (OBJECTS.has(top) && !isObject(value)) {
      invalid.push({ file: scope, key: top })
      continue
    }
    if (OBJECTS.has(top)) {
      for (const [key, v] of Object.entries(value)) if (v !== null) out.push({ parts: [top, key], value: v })
    } else out.push({ parts: [top], value })
  }
  return out
}

function ignoredIn(scope, key, value) {
  if (scope === 'global') return false
  if (USER_ONLY.has(key)) return true
  return key === 'permissions.defaultMode' && GLOBAL_ONLY_MODES.has(value)
}

function mergedRow(base, sets) {
  const value = []
  const seen = new Set()
  for (const { scope, value: list } of sets) {
    for (const v of list) {
      const id = JSON.stringify(v)
      if (seen.has(id)) continue
      seen.add(id)
      value.push({ v, from: scope })
    }
  }
  return { ...base, value, from: null, files: sets.map((s) => s.scope), overridden: [], merged: true }
}

function buildRow(key, top, raw) {
  const base = { key, group: groupOf(top) }
  if (SILENT.has(top)) base.docsSilent = true
  const secret = top === 'env' && SECRET.test(key.slice(4))
  const sets = secret ? raw.map((s) => ({ ...s, value: mask(s.value) })) : raw
  if (secret) base.masked = true
  const ignored = sets.filter((s) => ignoredIn(s.scope, key, s.value)).map((s) => ({ file: s.scope, value: s.value }))
  let live = sets.filter((s) => !ignoredIn(s.scope, key, s.value))
  if (!CHAIN.has(key) && live.some((s) => Array.isArray(s.value))) {
    for (const s of live) if (!Array.isArray(s.value)) ignored.push({ file: s.scope, value: s.value, wrongType: true })
    live = live.filter((s) => Array.isArray(s.value))
    const row = mergedRow(base, live)
    if (ignored.length) row.ignored = ignored
    return row
  }
  if (!live.length) return { ...base, value: null, from: null, overridden: [], merged: false, ignored }
  const [win, ...rest] = live
  const row = {
    ...base,
    value: win.value,
    from: win.scope,
    overridden: rest.map((s) => ({ file: s.scope, value: s.value })),
    merged: false
  }
  if (ignored.length) row.ignored = ignored
  return row
}

export function effectiveSettings(files) {
  const skipped = []
  const invalid = []
  const usable = []
  for (const file of files) {
    if (!file.exists) continue
    if (!file.ok || !isObject(file.data)) skipped.push(file.scope)
    else usable.push(file)
  }
  usable.sort((a, b) => ORDER.indexOf(a.scope) - ORDER.indexOf(b.scope))
  const byPath = new Map()
  for (const file of [...usable].reverse()) {
    for (const { parts, value } of entries(file.data, file.scope, invalid)) {
      const id = JSON.stringify(parts)
      if (!byPath.has(id)) byPath.set(id, { parts, sets: [] })
      byPath.get(id).sets.unshift({ scope: file.scope, value })
    }
  }
  invalid.sort((a, b) => ORDER.indexOf(a.file) - ORDER.indexOf(b.file))
  const rows = [...byPath.values()].map(({ parts, sets }) => buildRow(label(parts), parts[0], sets))
  rows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group))
  return { rows, skipped, invalid }
}
