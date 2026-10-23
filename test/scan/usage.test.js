import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanUsage } from '../../src/scan/usage.js'
import { priceOf } from '../../src/scan/prices.js'

const NOW = new Date(2026, 9, 23)

function line({ id, model = 'claude-opus-5-5', session = 's1', at = '2026-10-10T10:00:00Z', usage }) {
  return JSON.stringify({
    sessionId: session,
    requestId: `req-${id}`,
    timestamp: at,
    message: { id: `msg-${id}`, model, role: 'assistant', usage }
  })
}

function writeTranscript(home, project, session, lines) {
  const file = path.join(home, '.claude', 'projects', project, `${session}.jsonl`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('prices each token type and counts a repeated message one time', async () => {
  const fx = makeFixture()
  try {
    const usage = {
      input_tokens: 1000,
      output_tokens: 2000,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 4000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 }
    }
    writeTranscript(fx.home, '-proj-a', 's1', [
      line({ id: 'a', usage }),
      line({ id: 'a', usage }),
      '{"type":"user","message":{"role":"user","content":"hi"}}'
    ])
    const result = await scanUsage({ home: fx.home, now: NOW })
    const cost = (1000 * 4 + 2000 * 20 + 1000 * 5 + 2000 * 8 + 4000 * 0.2) / 1e6
    assert.equal(result.responses, 1)
    assert.equal(result.tokens, 10000)
    close(result.total.cost, cost)
    close(result.total.saved, (4000 * (4 - 0.2)) / 1e6)
    close(result.month.cost, cost)
    assert.equal(result.month.key, '2026-10')
    assert.equal(result.month.tokens, 10000)
    close(result.cacheShare, 4000 / 8000)
  } finally {
    fx.cleanup()
  }
})

test('counts sessions, projects, months, and models across files', async () => {
  const fx = makeFixture()
  try {
    const usage = { input_tokens: 0, output_tokens: 1000000, cache_read_input_tokens: 0 }
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage })])
    writeTranscript(fx.home, '-proj-a', 's2', [
      line({ id: 'a', usage }),
      line({ id: 'b', session: 's2', model: 'claude-sonnet-5-5', at: '2026-09-01T10:00:00Z', usage })
    ])
    writeTranscript(fx.home, '-proj-b', 's3', [
      line({ id: 'c', session: 's3', model: 'claude-haiku-4-5-20251001', usage })
    ])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, 3)
    assert.equal(result.sessions, 3)
    assert.equal(result.projects, 2)
    close(result.total.cost, 20 + 10 + 5)
    close(result.month.cost, 25)
    assert.deepEqual(
      result.models.map((m) => m.model),
      ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']
    )
  } finally {
    fx.cleanup()
  }
})

test('keeps tokens of an unknown model and skips damaged and synthetic lines', async () => {
  const fx = makeFixture()
  try {
    const usage = { input_tokens: 10, output_tokens: 20 }
    writeTranscript(fx.home, '-proj-a', 's1', [
      line({ id: 'a', model: 'claude-future-9', usage }),
      line({ id: 'b', model: '<synthetic>', usage }),
      '{"message":{"usage": broken',
      ''
    ])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, 1)
    assert.equal(result.tokens, 30)
    assert.equal(result.total.cost, 0)
    assert.deepEqual(result.unpriced, ['claude-future-9'])
  } finally {
    fx.cleanup()
  }
})

test('rereads a transcript after it changes', async () => {
  const fx = makeFixture()
  try {
    const usage = { input_tokens: 0, output_tokens: 1000000 }
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage })])
    assert.equal((await scanUsage({ home: fx.home, now: NOW })).responses, 1)
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage }), line({ id: 'b', usage })])
    assert.equal((await scanUsage({ home: fx.home, now: NOW })).responses, 2)
  } finally {
    fx.cleanup()
  }
})

test('returns zero totals when there are no transcripts', async () => {
  const fx = makeFixture()
  try {
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, 0)
    assert.equal(result.cacheShare, 0)
    assert.deepEqual(result.models, [])
  } finally {
    fx.cleanup()
  }
})

test('matches the most specific model price', () => {
  assert.equal(priceOf('claude-opus-5-5').input, 4)
  assert.equal(priceOf('claude-opus-5').input, 5)
  assert.equal(priceOf('claude-opus-4-1-20250805').input, 15)
  assert.equal(priceOf('claude-fable-5-1').cacheRead, 0.25)
  assert.equal(priceOf('claude-fable-5').cacheRead, 1)
  assert.equal(priceOf('claude-sonnet-4-5-20250929').output, 15)
  assert.equal(priceOf('gpt-4'), null)
})

test('reads subagent transcripts and counts them under the parent project and session', async () => {
  const fx = makeFixture()
  try {
    const usage = { output_tokens: 1000000 }
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage })])
    writeTranscript(fx.home, '-proj-a', 's1/subagents/agent-x', [line({ id: 'b', usage })])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, 2)
    assert.equal(result.sessions, 1)
    assert.equal(result.projects, 1)
    close(result.total.cost, 40)
  } finally {
    fx.cleanup()
  }
})

test('keeps the largest count of each field when one response repeats', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [
      line({ id: 'a', usage: { input_tokens: 10, output_tokens: 5 } }),
      line({ id: 'a', usage: { input_tokens: 10, output_tokens: 500 } })
    ])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, 1)
    assert.equal(result.total.output, 500)
  } finally {
    fx.cleanup()
  }
})

test('counts each response without ids on its own', async () => {
  const fx = makeFixture()
  try {
    const bare = JSON.stringify({ sessionId: 's1', message: { model: 'claude-opus-5-5', usage: { output_tokens: 7 } } })
    writeTranscript(fx.home, '-proj-a', 's1', [bare, bare])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, 2)
    assert.equal(result.total.output, 14)
  } finally {
    fx.cleanup()
  }
})

test('prices a cache write with no breakdown as 5 minutes', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage: { cache_creation_input_tokens: 1000000 } })])
    const result = await scanUsage({ home: fx.home, now: NOW })
    close(result.total.cost, 5)
  } finally {
    fx.cleanup()
  }
})

test('puts a response in the month of its local time', async () => {
  const fx = makeFixture()
  try {
    const usage = { output_tokens: 1 }
    writeTranscript(fx.home, '-proj-a', 's1', [
      line({ id: 'a', at: new Date(2026, 9, 1, 0, 30).toISOString(), usage }),
      line({ id: 'b', at: new Date(2026, 8, 30, 23, 30).toISOString(), usage })
    ])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.month.tokens, 1)
    assert.equal(result.tokens, 2)
  } finally {
    fx.cleanup()
  }
})

test('skips unreadable folders, symlinks, and a projects path that is a file', async () => {
  const fx = makeFixture()
  const projects = path.join(fx.home, '.claude', 'projects')
  try {
    const usage = { output_tokens: 1 }
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage })])
    const locked = path.dirname(writeTranscript(fx.home, '-proj-b', 's2', [line({ id: 'b', usage })]))
    fs.chmodSync(locked, 0o000)
    const outside = path.join(path.dirname(fx.home), 'outside.jsonl')
    fs.writeFileSync(outside, line({ id: 'c', usage }) + '\n')
    fs.symlinkSync(outside, path.join(projects, '-proj-a', 'linked.jsonl'))
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(result.responses, process.getuid?.() === 0 ? 2 : 1)
    fs.chmodSync(locked, 0o755)
    fs.rmSync(projects, { recursive: true })
    fs.writeFileSync(projects, 'not a folder')
    assert.equal((await scanUsage({ home: fx.home, now: NOW })).responses, 0)
  } finally {
    fx.cleanup()
  }
})

test('shares one scan between calls that overlap', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage: { output_tokens: 1 } })])
    const [a, b] = await Promise.all([scanUsage({ home: fx.home, now: NOW }), scanUsage({ home: fx.home, now: NOW })])
    assert.deepEqual(a, b)
  } finally {
    fx.cleanup()
  }
})

test('never matches a shorter price id before a longer one', () => {
  assert.equal(priceOf('claude-sonnet-5-5').input, 2)
  assert.equal(priceOf('claude-mythos-5-1-20261001').cacheRead, 0.25)
})
