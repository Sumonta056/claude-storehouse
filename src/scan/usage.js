import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { priceOf } from './prices.js'

const FIELDS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead']
const cache = new Map()
const running = new Map()

function monthOf(timestamp) {
  if (typeof timestamp !== 'string' && !(timestamp instanceof Date)) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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
  const cacheWrite = usage.cache_creation_input_tokens || 0
  const cacheWrite1h = Math.min(usage.cache_creation?.ephemeral_1h_input_tokens || 0, cacheWrite)
  return {
    id: message.id || entry.requestId ? `${message.id ?? ''}:${entry.requestId ?? ''}` : fallbackId,
    model: message.model,
    session: entry.sessionId ?? '',
    month: monthOf(entry.timestamp),
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheWrite5m: cacheWrite - cacheWrite1h,
    cacheWrite1h,
    cacheRead: usage.cache_read_input_tokens || 0
  }
}

async function readFile(file) {
  const records = []
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
  let index = 0
  for await (const line of lines) {
    const record = recordOf(line, `${file}#${index++}`)
    if (record) records.push(record)
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
      for (const file of jsonl(path.join(dir, session.name, 'subagents'))) files.push({ project: project.name, file })
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
  const files = transcripts(root)
  const live = new Set()
  for (const { project, file } of files) {
    live.add(file)
    let records
    try {
      records = await fileRecords(file)
    } catch {
      continue
    }
    for (const record of records) {
      const seen = responses.get(record.id)
      if (seen) merge(seen, record)
      else responses.set(record.id, { ...record, project })
    }
  }
  for (const file of cache.keys()) if (file.startsWith(root + path.sep) && !live.has(file)) cache.delete(file)
  return [...responses.values()]
}

function summarize(records, month) {
  const total = { cost: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, saved: 0 }
  const thisMonth = { key: month, cost: 0, tokens: 0 }
  const sessions = new Set()
  const projects = new Set()
  const models = new Map()
  const unpriced = new Set()
  for (const record of records) {
    if (record.session) sessions.add(record.session)
    projects.add(record.project)
    const tokens = record.input + record.output + record.cacheWrite5m + record.cacheWrite1h + record.cacheRead
    total.input += record.input
    total.output += record.output
    total.cacheWrite += record.cacheWrite5m + record.cacheWrite1h
    total.cacheRead += record.cacheRead
    if (record.month === month) thisMonth.tokens += tokens
    const price = priceOf(record.model)
    if (!price) {
      unpriced.add(record.model)
      continue
    }
    const cost = costOf(record, price)
    total.cost += cost
    total.saved += (record.cacheRead * (price.input - price.cacheRead)) / 1e6
    models.set(record.model, (models.get(record.model) ?? 0) + cost)
    if (record.month === month) thisMonth.cost += cost
  }
  const inputSide = total.input + total.cacheWrite + total.cacheRead
  return {
    responses: records.length,
    sessions: sessions.size,
    projects: projects.size,
    tokens: inputSide + total.output,
    cacheShare: inputSide ? total.cacheRead / inputSide : 0,
    total,
    month: thisMonth,
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
  return summarize(await running.get(root), monthOf(now))
}
