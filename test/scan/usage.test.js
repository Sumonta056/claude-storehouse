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
    assert.equal(result.all.responses, 1)
    assert.equal(result.all.tokens, 10000)
    close(result.all.cost, cost)
    close(result.all.saved, (4000 * (4 - 0.2)) / 1e6)
    close(result.month.cost, cost)
    assert.equal(result.monthKey, '2026-10')
    assert.equal(result.month.tokens, 10000)
    close(result.all.cacheShare, 4000 / 8000)
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
    assert.equal(result.all.responses, 3)
    assert.equal(result.all.sessions, 3)
    assert.equal(result.all.projects, 2)
    close(result.all.cost, 20 + 10 + 5)
    assert.deepEqual(
      result.all.models.map((m) => m.model),
      ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']
    )
    assert.equal(result.month.responses, 2)
    assert.equal(result.month.sessions, 2)
    assert.equal(result.month.projects, 2)
    close(result.month.cost, 25)
    assert.deepEqual(
      result.month.models.map((m) => m.model),
      ['claude-opus-5-5', 'claude-haiku-4-5-20251001']
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
    assert.equal(result.all.responses, 1)
    assert.equal(result.all.tokens, 30)
    assert.equal(result.all.cost, 0)
    assert.deepEqual(result.all.unpriced, ['claude-future-9'])
    assert.deepEqual(result.month.unpriced, ['claude-future-9'])
  } finally {
    fx.cleanup()
  }
})

test('rereads a transcript after it changes', async () => {
  const fx = makeFixture()
  try {
    const usage = { input_tokens: 0, output_tokens: 1000000 }
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage })])
    assert.equal((await scanUsage({ home: fx.home, now: NOW })).all.responses, 1)
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage }), line({ id: 'b', usage })])
    assert.equal((await scanUsage({ home: fx.home, now: NOW })).all.responses, 2)
  } finally {
    fx.cleanup()
  }
})

test('returns zero totals when there are no transcripts', async () => {
  const fx = makeFixture()
  try {
    const result = await scanUsage({ home: fx.home, now: NOW })
    for (const period of [result.all, result.month]) {
      assert.equal(period.responses, 0)
      assert.equal(period.cacheShare, 0)
      assert.deepEqual(period.models, [])
    }
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
    assert.equal(result.all.responses, 2)
    assert.equal(result.all.sessions, 1)
    assert.equal(result.all.projects, 1)
    close(result.all.cost, 40)
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
    assert.equal(result.all.responses, 1)
    assert.equal(result.all.output, 500)
    assert.equal(result.month.responses, 1)
    assert.equal(result.month.output, 500)
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
    assert.equal(result.all.responses, 2)
    assert.equal(result.all.output, 14)
  } finally {
    fx.cleanup()
  }
})

test('prices a cache write with no breakdown as 5 minutes', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [line({ id: 'a', usage: { cache_creation_input_tokens: 1000000 } })])
    const result = await scanUsage({ home: fx.home, now: NOW })
    close(result.all.cost, 5)
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
    assert.equal(result.all.tokens, 2)
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
    assert.equal(result.all.responses, process.getuid?.() === 0 ? 2 : 1)
    fs.chmodSync(locked, 0o755)
    fs.rmSync(projects, { recursive: true })
    fs.writeFileSync(projects, 'not a folder')
    assert.equal((await scanUsage({ home: fx.home, now: NOW })).all.responses, 0)
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

function toolLine({ id, at = '2026-10-10T10:00:00Z', tools }) {
  return JSON.stringify({
    sessionId: 's1',
    requestId: `req-${id}`,
    timestamp: at,
    message: {
      id: `msg-${id}`,
      model: 'claude-opus-5-5',
      role: 'assistant',
      usage: { output_tokens: 1 },
      content: [
        { type: 'text', text: 'working' },
        ...tools.map(([toolId, name, input]) => ({ type: 'tool_use', id: toolId, name, input }))
      ]
    }
  })
}

test('maps Skill, Agent, MCP, and plugin MCP calls to item keys', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [
      toolLine({
        id: 'a',
        tools: [
          ['t1', 'Skill', { skill: 'release-tag', args: 'x' }],
          ['t2', 'Skill', { skill: 'superpowers:brainstorming' }],
          ['t3', 'Agent', { prompt: 'p', description: 'd' }],
          ['t4', 'Task', { subagent_type: 'toggle-reviewer', prompt: 'p' }],
          ['t5', 'mcp__github__create_issue', { title: 'x' }],
          ['t6', 'mcp__plugin_chrome-devtools-mcp_chrome-devtools__click', {}],
          ['t7', 'Bash', { command: 'ls' }],
          ['t8', 'Skill', {}]
        ]
      })
    ])
    const { items } = await scanUsage({ home: fx.home, now: NOW })
    const last = Date.parse('2026-10-10T10:00:00Z')
    assert.deepEqual(items, {
      'skill:release-tag': { count30: 1, last },
      'skill:superpowers:brainstorming': { count30: 1, last },
      'agent:general-purpose': { count30: 1, last },
      'agent:toggle-reviewer': { count30: 1, last },
      'mcp:github': { count30: 1, last },
      'mcp:plugin:chrome-devtools-mcp:chrome-devtools': { count30: 1, last }
    })
  } finally {
    fx.cleanup()
  }
})

test('counts one tool call once when it shows in two lines and two files', async () => {
  const fx = makeFixture()
  try {
    const repeat = toolLine({ id: 'a', tools: [['t1', 'Skill', { skill: 'release-tag' }]] })
    writeTranscript(fx.home, '-proj-a', 's1', [repeat, repeat])
    writeTranscript(fx.home, '-proj-a', 's1/subagents/agent-x', [repeat])
    writeTranscript(fx.home, '-proj-a', 's2', [
      toolLine({ id: 'b', at: '2026-10-12T10:00:00Z', tools: [['t2', 'Skill', { skill: 'release-tag' }]] })
    ])
    const { items } = await scanUsage({ home: fx.home, now: NOW })
    assert.deepEqual(items['skill:release-tag'], { count30: 2, last: Date.parse('2026-10-12T10:00:00Z') })
  } finally {
    fx.cleanup()
  }
})

test('keeps a call older than 30 days in last but not in count30', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [
      toolLine({ id: 'a', at: '2026-08-01T10:00:00Z', tools: [['t1', 'Skill', { skill: 'old' }]] }),
      toolLine({ id: 'b', at: '2026-08-02T10:00:00Z', tools: [['t2', 'Skill', { skill: 'mixed' }]] }),
      toolLine({ id: 'c', at: '2026-10-20T10:00:00Z', tools: [['t3', 'Skill', { skill: 'mixed' }]] })
    ])
    const { items } = await scanUsage({ home: fx.home, now: NOW })
    assert.deepEqual(items['skill:old'], { count30: 0, last: Date.parse('2026-08-01T10:00:00Z') })
    assert.deepEqual(items['skill:mixed'], { count30: 1, last: Date.parse('2026-10-20T10:00:00Z') })
  } finally {
    fx.cleanup()
  }
})

test('never returns prompt, args, or message text', async () => {
  const fx = makeFixture()
  try {
    const secret = 'SECRET-sk-ant-1234'
    writeTranscript(fx.home, '-proj-a', 's1', [
      toolLine({
        id: 'a',
        tools: [
          ['t1', 'Skill', { skill: 'release-tag', args: secret }],
          ['t2', 'Agent', { subagent_type: 'toggle-reviewer', prompt: secret, description: secret }],
          ['t3', 'mcp__github__create_issue', { body: secret }]
        ]
      }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: secret } })
    ])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.equal(Object.keys(result.items).length, 3)
    assert.ok(!JSON.stringify(result).includes(secret))
  } finally {
    fx.cleanup()
  }
})

test('skips tool calls in a symlinked transcript', async () => {
  const fx = makeFixture()
  try {
    writeTranscript(fx.home, '-proj-a', 's1', [toolLine({ id: 'a', tools: [['t1', 'Skill', { skill: 'kept' }]] })])
    const outside = path.join(path.dirname(fx.home), 'outside-tools.jsonl')
    fs.writeFileSync(outside, toolLine({ id: 'b', tools: [['t2', 'Skill', { skill: 'linked' }]] }) + '\n')
    fs.symlinkSync(outside, path.join(fx.home, '.claude', 'projects', '-proj-a', 'linked.jsonl'))
    const { items } = await scanUsage({ home: fx.home, now: NOW })
    assert.deepEqual(Object.keys(items), ['skill:kept'])
  } finally {
    fx.cleanup()
  }
})

test('ignores tool calls of unknown shape without an error', async () => {
  const fx = makeFixture()
  try {
    const odd = JSON.stringify({
      sessionId: 's1',
      timestamp: 'not a date',
      message: {
        model: 'claude-opus-5-5',
        usage: { output_tokens: 1 },
        content: [{ type: 'tool_use', name: 42 }, { type: 'tool_use', id: 'x', name: 'mcp__' }, null, 'text']
      }
    })
    writeTranscript(fx.home, '-proj-a', 's1', [odd, JSON.stringify({ message: { content: 'x', usage: {} } })])
    const result = await scanUsage({ home: fx.home, now: NOW })
    assert.deepEqual(result.items, {})
    assert.equal(result.all.responses, 1)
  } finally {
    fx.cleanup()
  }
})
