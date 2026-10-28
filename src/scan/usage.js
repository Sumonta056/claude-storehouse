import fs from 'node:fs'
import path from 'node:path'
import { priceOf } from './prices.js'

const FIELDS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead']
const WINDOW = 30 * 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const BLOCK = 5 * HOUR
const DAYS = 14
const NEEDLE = Buffer.from('"usage"')
const PARALLEL = 8
const cache = new Map()
const running = new Map()

function monthOf(timestamp) {
  if (typeof timestamp !== 'string' && !(timestamp instanceof Date)) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayOf(time) {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function tilde(dir, home) {
  if (dir === home) return '~'
  return dir.startsWith(home + path.sep) ? `~${dir.slice(home.length)}` : dir
}

function keyOf(name, input) {
  if (name === 'Skill') return typeof input?.skill === 'string' && input.skill ? `skill:${input.skill}` : null
  if (name === 'Agent' || name === 'Task') {
    const type = input?.subagent_type
    return `agent:${typeof type === 'string' && type ? type : 'general-purpose'}`
  }
  const mcp = /^mcp__(.+?)__/.exec(name)
  if (!mcp) return null
  const plugin = /^plugin_([^_]+)_(.+)$/.exec(mcp[1])
  return plugin ? `mcp:plugin:${plugin[1]}:${plugin[2]}` : `mcp:${mcp[1]}`
}

function usesOf(entry, fallbackId) {
  const content = entry?.message?.content
  const time = Date.parse(entry?.timestamp)
  if (!Array.isArray(content) || Number.isNaN(time)) return []
  const uses = []
  content.forEach((block, index) => {
    if (block?.type !== 'tool_use' || typeof block.name !== 'string') return
    const key = keyOf(block.name, block.input)
    if (key) uses.push({ id: typeof block.id === 'string' ? block.id : `${fallbackId}#${index}`, key, time })
  })
  return uses
}

function recordOf(line, fallbackId) {
  if (!line.includes('"usage"')) return null
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }
  const message = entry?.message
  const usage = message?.usage
  if (!usage || typeof message.model !== 'string' || message.model.startsWith('<')) return null
  const uses = usesOf(entry, fallbackId)
  const cacheWrite = usage.cache_creation_input_tokens || 0
  const cacheWrite1h = Math.min(usage.cache_creation?.ephemeral_1h_input_tokens || 0, cacheWrite)
  return {
    id: message.id || entry.requestId ? `${message.id ?? ''}:${entry.requestId ?? ''}` : fallbackId,
    model: message.model,
    session: entry.sessionId ?? '',
    month: monthOf(entry.timestamp),
    time: Date.parse(entry.timestamp),
    cwd: typeof entry.cwd === 'string' ? entry.cwd : '',
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheWrite5m: cacheWrite - cacheWrite1h,
    cacheWrite1h,
    cacheRead: usage.cache_read_input_tokens || 0,
    uses
  }
}

async function readFile(file) {
  const records = []
  const buffer = await fs.promises.readFile(file)
  let at = buffer.indexOf(NEEDLE)
  while (at !== -1) {
    const start = buffer.lastIndexOf(10, at) + 1
    const newline = buffer.indexOf(10, at)
    const end = newline === -1 ? buffer.length : newline
    const record = recordOf(buffer.toString('utf8', start, end), `${file}#${start}`)
    if (record) records.push(record)
    at = newline === -1 ? -1 : buffer.indexOf(NEEDLE, newline)
  }
  return records
}

async function fileRecords(file) {
  const stat = fs.statSync(file)
  const hit = cache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.records
  const records = await readFile(file)
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, records })
  return records
}

function entries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function isFolder(dir) {
  try {
    return fs.lstatSync(dir).isDirectory()
  } catch {
    return false
  }
}

function jsonl(dir) {
  return entries(dir)
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => path.join(dir, e.name))
}

function transcripts(root) {
  const files = []
  for (const project of entries(root)) {
    if (!project.isDirectory() || project.name.startsWith('.')) continue
    const dir = path.join(root, project.name)
    for (const file of jsonl(dir)) files.push({ project: project.name, file })
    for (const session of entries(dir)) {
      if (!session.isDirectory() || session.name.startsWith('.')) continue
      const sub = path.join(dir, session.name, 'subagents')
      if (isFolder(sub)) for (const file of jsonl(sub)) files.push({ project: project.name, file })
    }
  }
  return files
}

function merge(into, record) {
  for (const field of FIELDS) into[field] = Math.max(into[field], record[field])
}

function costOf(record, price) {
  return (
    (record.input * price.input +
      record.output * price.output +
      record.cacheWrite5m * price.cacheWrite5m +
      record.cacheWrite1h * price.cacheWrite1h +
      record.cacheRead * price.cacheRead) /
    1e6
  )
}

async function collect(root) {
  const responses = new Map()
  const uses = new Map()
  const files = transcripts(root)
  const live = new Set(files.map((f) => f.file))
  const loaded = new Array(files.length)
  let next = 0
  const worker = async () => {
    while (next < files.length) {
      const index = next++
      loaded[index] = await fileRecords(files[index].file).catch(() => [])
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  files.forEach(({ project }, index) => {
    for (const record of loaded[index]) {
      for (const use of record.uses) if (!uses.has(use.id)) uses.set(use.id, use)
      const seen = responses.get(record.id)
      if (seen) merge(seen, record)
      else responses.set(record.id, { ...record, project })
    }
  })
  for (const file of cache.keys()) if (file.startsWith(root + path.sep) && !live.has(file)) cache.delete(file)
  return { records: [...responses.values()], uses: [...uses.values()] }
}

function summarizeUses(uses, now) {
  const items = {}
  const since = now - WINDOW
  for (const { key, time } of uses) {
    if (time > now) continue
    const item = (items[key] ??= { count30: 0, last: 0 })
    if (time >= since) item.count30++
    item.last = Math.max(item.last, time)
  }
  return items
}

function tokensOf(record) {
  return record.input + record.output + record.cacheWrite5m + record.cacheWrite1h + record.cacheRead
}

function priced(record) {
  const price = priceOf(record.model)
  return price ? costOf(record, price) : 0
}

function summarizeDays(records, now) {
  const today = new Date(now)
  const days = []
  for (let back = DAYS - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
    days.push({ date: dayOf(date), cost: 0, tokens: 0 })
  }
  const byDate = new Map(days.map((day) => [day.date, day]))
  for (const record of records) {
    if (Number.isNaN(record.time)) continue
    const day = byDate.get(dayOf(record.time))
    if (!day) continue
    day.cost += priced(record)
    day.tokens += tokensOf(record)
  }
  return days
}

function summarizeProjects(records, home) {
  const first = new Map()
  for (const record of records) {
    if (!record.cwd || !record.session) continue
    const seen = first.get(record.session)
    if (!seen || record.time < seen.time) first.set(record.session, record)
  }
  const rows = new Map()
  for (const record of records) {
    const cwd = first.get(record.session)?.cwd || record.cwd
    const project = cwd ? tilde(cwd, home) : record.project
    const row = rows.get(project) ?? { project, tokens: 0, cost: 0, list: new Map() }
    rows.set(project, row)
    const tokens = tokensOf(record)
    const cost = priced(record)
    row.tokens += tokens
    row.cost += cost
    if (!record.session) continue
    const session = row.list.get(record.session) ?? {
      id: record.session,
      start: null,
      end: null,
      responses: 0,
      tokens: 0,
      cost: 0,
      models: new Set()
    }
    row.list.set(record.session, session)
    session.responses++
    session.tokens += tokens
    session.cost += cost
    session.models.add(record.model)
    if (!Number.isNaN(record.time)) {
      if (session.start === null || record.time < session.start) session.start = record.time
      if (session.end === null || record.time > session.end) session.end = record.time
    }
  }
  return [...rows.values()]
    .map(({ list, ...row }) => ({
      ...row,
      sessions: list.size,
      list: [...list.values()]
        .map((s) => ({ ...s, models: [...s.models] }))
        .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))
    }))
    .sort((a, b) => b.cost - a.cost)
}

function currentBlock(records, now) {
  const times = records.filter((r) => !Number.isNaN(r.time) && r.time <= now).sort((a, b) => a.time - b.time)
  let block = null
  for (const record of times) {
    if (!block || record.time > block.end) {
      const start = Math.floor(record.time / HOUR) * HOUR
      block = { start, end: start + BLOCK, cost: 0, tokens: 0 }
    }
    block.cost += priced(record)
    block.tokens += tokensOf(record)
  }
  if (!block || now >= block.end) return null
  const hours = (now - block.start) / HOUR
  const burnPerHour = hours > 0 ? block.cost / hours : 0
  return { ...block, burnPerHour, projected: block.cost + (burnPerHour * (block.end - now)) / HOUR }
}

function summarize(records) {
  const total = { cost: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, saved: 0 }
  const sessions = new Set()
  const projects = new Set()
  const models = new Map()
  const unpriced = new Set()
  for (const record of records) {
    if (record.session) sessions.add(record.session)
    projects.add(record.project)
    total.input += record.input
    total.output += record.output
    total.cacheWrite += record.cacheWrite5m + record.cacheWrite1h
    total.cacheRead += record.cacheRead
    const price = priceOf(record.model)
    if (!price) {
      unpriced.add(record.model)
      continue
    }
    const cost = costOf(record, price)
    total.cost += cost
    total.saved += (record.cacheRead * (price.input - price.cacheRead)) / 1e6
    models.set(record.model, (models.get(record.model) ?? 0) + cost)
  }
  const inputSide = total.input + total.cacheWrite + total.cacheRead
  return {
    ...total,
    responses: records.length,
    sessions: sessions.size,
    projects: projects.size,
    tokens: inputSide + total.output,
    cacheShare: inputSide ? total.cacheRead / inputSide : 0,
    models: [...models].map(([model, cost]) => ({ model, cost })).sort((a, b) => b.cost - a.cost),
    unpriced: [...unpriced]
  }
}

export async function scanUsage({ home, now = new Date() }) {
  const root = path.join(home, '.claude', 'projects')
  if (!running.has(root))
    running.set(
      root,
      collect(root).finally(() => running.delete(root))
    )
  const { records, uses } = await running.get(root)
  const monthKey = monthOf(now)
  const time = new Date(now).getTime()
  const month = records.filter((r) => r.month === monthKey)
  return {
    monthKey,
    all: summarize(records),
    month: summarize(month),
    days: summarizeDays(records, time),
    byProject: { all: summarizeProjects(records, home), month: summarizeProjects(month, home) },
    block: currentBlock(records, time),
    items: summarizeUses(uses, time),
    since: uses.reduce((min, u) => (min === null || u.time < min ? u.time : min), null)
  }
}
