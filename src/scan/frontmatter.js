function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    if ((first === '"' || first === "'") && value[value.length - 1] === first) return value.slice(1, -1)
  }
  return value
}

const BLOCK = /^([>|])[+-]?$/
const KEEP = new Set(['name', 'description', 'model', 'tools'])

function indentOf(line) {
  return line.length - line.trimStart().length
}

function readBlock(lines, from, style) {
  const block = []
  let i = from
  while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > 0)) {
    block.push(lines[i])
    i++
  }
  const filled = block.filter((l) => l.trim() !== '')
  const common = filled.length ? Math.min(...filled.map(indentOf)) : 0
  const stripped = block.map((l) => l.slice(common).replace(/\s+$/, ''))
  const text = style === '>' ? filled.map((l) => l.trim()).join(' ') : stripped.join('\n')
  return { value: text.trim(), next: i }
}

function readPlain(lines, from) {
  const parts = []
  let i = from
  while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > 0)) {
    const text = lines[i].trim()
    if (text.startsWith('#')) break
    if (text) parts.push(text)
    i++
  }
  return { value: parts.join(' '), next: i }
}

export function parseFrontmatter(text) {
  const source = typeof text === 'string' ? text : ''
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return { body: source }
  const meta = {}
  const lines = match[1].split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    i++
    const bare = line.match(/^([A-Za-z_][\w-]*):\s*$/)
    if (bare && bare[1] === 'tools') {
      const list = []
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        list.push(unquote(lines[i].replace(/^\s+-\s+/, '').trim()))
        i++
      }
      if (list.length) meta[bare[1]] = list
      continue
    }
    if (bare && KEEP.has(bare[1])) {
      const read = readPlain(lines, i)
      if (read.value) meta[bare[1]] = unquote(read.value)
      i = read.next
      continue
    }
    const at = line.indexOf(': ')
    if (at <= 0 || indentOf(line) > 0) continue
    const key = line.slice(0, at).trim()
    const raw = line.slice(at + 2).trim()
    const block = raw.match(BLOCK)
    let value = raw
    if (block) {
      const read = readBlock(lines, i, block[1])
      value = read.value
      i = read.next
    } else if (raw) {
      const read = readPlain(lines, i)
      value = unquote(read.value ? `${raw} ${read.value}` : raw)
      i = read.next
    }
    if (KEEP.has(key)) meta[key] = value
  }
  return { ...meta, body: source.slice(match[0].length) }
}

export function firstBodyLine(body, limit = 200) {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) return trimmed.slice(0, limit)
  }
  return ''
}
