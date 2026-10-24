export const DEFAULT_COMBO = 'mod+p'

const MODS = ['mod', 'ctrl', 'meta', 'alt', 'shift']

const TAKEN = new Set([...'wtnqlrhmscvxazyfbiod0123456789', 'tab', 'enter'])

const NOT_A_KEY = ['meta', 'control', 'alt', 'shift', 'os', 'altgraph', 'super', 'hyper', 'capslock', 'fn', 'dead']

const MAC_SIGN = { mod: '⌘', ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧' }

const PC_SIGN = { mod: 'Ctrl', ctrl: 'Ctrl', meta: 'Meta', alt: 'Alt', shift: 'Shift' }

function baseKey(e) {
  const code = String(e.code ?? '')
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  const name = String(e.key ?? '').toLowerCase()
  return NOT_A_KEY.includes(name) ? '' : name
}

export function comboFromKey(e, isMac) {
  const key = baseKey(e)
  if (!key) return ''
  const mods = []
  if (isMac ? e.metaKey : e.ctrlKey) mods.push('mod')
  if (isMac && e.ctrlKey) mods.push('ctrl')
  if (!isMac && e.metaKey) mods.push('meta')
  if (e.altKey) mods.push('alt')
  if (e.shiftKey) mods.push('shift')
  return [...mods, key].join('+')
}

export function matchCombo(combo, e, isMac) {
  return comboFromKey(e, isMac) === combo
}

function split(combo) {
  const parts = combo.split('+')
  if (combo.endsWith('++')) return { mods: parts.slice(0, -2), key: '+' }
  return { mods: parts.slice(0, -1), key: parts.at(-1) }
}

function keyText(key) {
  if (!key) return ''
  return key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)
}

export function comboLabel(combo, isMac) {
  const { mods, key } = split(combo)
  const signs = mods.map((m) => (isMac ? MAC_SIGN : PC_SIGN)[m])
  return isMac ? signs.join('') + keyText(key) : [...signs, keyText(key)].join('+')
}

export function comboProblem(combo) {
  const need = 'Use Cmd, Ctrl, or Alt with one other key.'
  if (typeof combo !== 'string' || !combo) return need
  const { mods, key } = split(combo)
  if (!key || mods.some((m) => !MODS.includes(m))) return `${combo} is not a key combination.`
  if (!mods.some((m) => m !== 'shift')) return need
  const plain = mods.filter((m) => m !== 'shift')
  if (plain.length === 1 && plain[0] === 'mod' && TAKEN.has(key))
    return 'The browser or the dashboard already uses this key. Pick another one.'
  return ''
}
