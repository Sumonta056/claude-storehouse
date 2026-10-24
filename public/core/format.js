import { state } from './state.js'

export function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

export function keyOf(kind, source, name) {
  return `${kind}:${source}:${name}`
}

function home() {
  const dir = state.inventory?.global?.dir ?? ''
  return dir.replace(/[\\/]\.claude$/, '')
}

export function tilde(file) {
  const h = home()
  return h && file.startsWith(h) ? `~${file.slice(h.length)}` : file
}

export const MODEL_CLASSES = ['m0', 'm1', 'm2', 'm3']

export function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function compact(value) {
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 })
}

export function modelName(model) {
  const parts = model
    .replace(/^claude-/, '')
    .split('-')
    .filter((p) => !/^\d{8}$/.test(p))
  const words = parts.filter((p) => !/^\d+$/.test(p)).map((p) => p[0].toUpperCase() + p.slice(1))
  const version = parts.filter((p) => /^\d+$/.test(p)).join('.')
  return [...words, version].filter(Boolean).join(' ')
}

export function monthName(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`
  return new Date(ms).toLocaleDateString()
}

export function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function shortVersion(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^[0-9a-f]{8,}$/i.test(s)) return s.slice(0, 7)
  return /^v\d/i.test(s) ? s : /^\d/.test(s) ? `v${s}` : s
}

export function tok(n) {
  return `${n.toLocaleString('en-US')} tok`
}

export function isFolderSkill(item) {
  return item.kind === 'skill' && baseName(item.path) === 'SKILL.md'
}

export function parentDir(file) {
  return file.replace(/[\\/][^\\/]*$/, '')
}

export function baseName(file) {
  return file.split(/[\\/]/).pop()
}

export function relTo(root, file) {
  return root && file.startsWith(root) ? file.slice(root.length).replace(/^[\\/]/, '') : baseName(file)
}

export function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function opt(value, label, current) {
  return `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`
}

export function unquote(token) {
  return token.replace(/^(['"])(.*)\1$/, '$2')
}

export function lineCount(text) {
  return text ? text.replace(/\r?\n$/, '').split(/\r?\n/).length : 0
}
