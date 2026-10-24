import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOKEN_BYTES, tokensOf, listingTokens, sumTokens, contextItems, keepCtx } from '../../public/logic/context.js'
import { state } from '../../public/core/state.js'

function emptyCatalog() {
  return { skill: [], agent: [], plugin: [], mod: [], hook: [], mcp: [] }
}

function withState(fields, fn) {
  const saved = {}
  for (const k of Object.keys(fields)) saved[k] = state[k]
  Object.assign(state, fields)
  try {
    return fn()
  } finally {
    Object.assign(state, saved)
  }
}

function byKey(list) {
  return Object.fromEntries(list.map((e) => [e.key, e]))
}

test('TOKEN_BYTES is 4 and tokensOf rounds up', () => {
  assert.equal(TOKEN_BYTES, 4)
  assert.equal(tokensOf(0), 0)
  assert.equal(tokensOf(1), 1)
  assert.equal(tokensOf(4), 1)
  assert.equal(tokensOf(5), 2)
  assert.equal(tokensOf(400), 100)
})

test('listingTokens counts the bytes of name, colon, space, and description', () => {
  assert.equal(listingTokens({ name: 'ab', description: 'cdefgh' }), 3)
  assert.equal(listingTokens({ name: 'abcd', description: 'efgh' }), 3)
})

test('listingTokens treats a missing description as empty', () => {
  assert.equal(listingTokens({ name: 'abcdef' }), 2)
  assert.equal(listingTokens({ name: 'abcdef', description: null }), 2)
})

test('listingTokens cuts the description at 1,536 characters', () => {
  const capped = listingTokens({ name: 'x', description: 'a'.repeat(1536) })
  assert.equal(capped, Math.ceil((3 + 1536) / 4))
  assert.equal(listingTokens({ name: 'x', description: 'a'.repeat(5000) }), capped)
})

test('listingTokens counts UTF-8 bytes, not characters', () => {
  assert.equal(listingTokens({ name: 'é', description: 'éé' }), Math.ceil((2 + 2 + 4) / 4))
})

test('sumTokens adds the always field', () => {
  assert.equal(sumTokens([]), 0)
  assert.equal(sumTokens([{ always: 3 }, { always: 0 }, { always: 7 }]), 10)
})

test('contextItems lists CLAUDE.md files that exist at their full size', () => {
  const inventory = {
    claudeMd: {
      global: { exists: true, path: '/h/.claude/CLAUDE.md', size: 400 },
      project: { exists: false, path: '/p/CLAUDE.md', size: 999 },
      projectLocal: { exists: true, path: '/p/CLAUDE.local.md', size: 9 },
      projectClaudeDir: { exists: true, path: '/p/.claude/CLAUDE.md', size: 4 }
    }
  }
  withState({ inventory, catalog: emptyCatalog() }, () => {
    const out = byKey(contextItems())
    assert.deepEqual(Object.keys(out).sort(), ['ctx:md:global', 'ctx:md:projectClaudeDir', 'ctx:md:projectLocal'])
    assert.equal(out['ctx:md:global'].always, 100)
    assert.equal(out['ctx:md:global'].scope, 'global')
    assert.equal(out['ctx:md:global'].name, '~/.claude/CLAUDE.md')
    assert.equal(out['ctx:md:projectLocal'].always, 3)
    assert.equal(out['ctx:md:projectLocal'].scope, 'project')
    assert.equal(out['ctx:md:projectClaudeDir'].name, '.claude/CLAUDE.md')
  })
})

test('contextItems loads a rule without paths always and a rule with paths on use', () => {
  const inventory = {
    claudeMd: {
      rules: [
        { path: '/p/.claude/rules/code.md', size: 40, scope: 'project', conditional: false },
        { path: '/p/.claude/rules/ui/web.md', size: 80, scope: 'project', conditional: true }
      ]
    }
  }
  withState({ inventory, catalog: emptyCatalog() }, () => {
    const out = byKey(contextItems())
    const always = out['ctx:rule:/p/.claude/rules/code.md']
    const cond = out['ctx:rule:/p/.claude/rules/ui/web.md']
    assert.equal(always.name, 'rules/code.md')
    assert.equal(always.always, 10)
    assert.equal(always.onUse, 0)
    assert.equal(cond.name, 'rules/ui/web.md')
    assert.equal(cond.always, 0)
    assert.equal(cond.onUse, 20)
    assert.equal(cond.conditional, true)
  })
})

test('contextItems names a Windows rule path after the rules folder', () => {
  const inventory = {
    claudeMd: { rules: [{ path: 'C:\\p\\.claude\\rules\\a.md', size: 4, scope: 'project', conditional: false }] }
  }
  withState({ inventory, catalog: emptyCatalog() }, () => assert.equal(contextItems()[0].name, 'rules/a.md'))
})

test('contextItems charges an on skill or agent its listing and an off one nothing', () => {
  const on = { kind: 'skill', key: 'skill:global:on', name: 'on', description: 'abcdef', enabled: true, size: 400 }
  const off = { kind: 'skill', key: 'skill:global:off', name: 'off', description: 'abcde', enabled: false, size: 40 }
  const agent = { kind: 'agent', key: 'agent:global:ag', name: 'ag', description: 'xx', enabled: true }
  withState({ inventory: {}, catalog: { ...emptyCatalog(), skill: [on, off], agent: [agent] } }, () => {
    const out = byKey(contextItems())
    assert.equal(out['skill:global:on'].always, 3)
    assert.equal(out['skill:global:on'].cost, 3)
    assert.equal(out['skill:global:on'].onUse, 100)
    assert.equal(out['skill:global:on'].type, 'skills')
    assert.equal(out['skill:global:off'].always, 0)
    assert.equal(out['skill:global:off'].cost, 3)
    assert.equal(out['skill:global:off'].onUse, 10)
    assert.equal(out['agent:global:ag'].type, 'agents')
    assert.equal(out['agent:global:ag'].always, 2)
    assert.equal(out['agent:global:ag'].onUse, 0)
  })
})

test('contextItems lists MCP servers with no measured cost', () => {
  const mcp = { kind: 'mcp', key: 'mcp:user::srv', name: 'srv', enabled: true }
  withState({ inventory: {}, catalog: { ...emptyCatalog(), mcp: [mcp] } }, () => {
    const [e] = contextItems()
    assert.equal(e.type, 'mcp')
    assert.equal(e.always, 0)
    assert.equal(e.onUse, 0)
  })
})

test('contextItems counts every copy of a skill with a duplicate name', () => {
  const a = { kind: 'skill', key: 'skill:global:dup', name: 'dup', description: 'abcdef', enabled: true }
  const b = { kind: 'skill', key: 'skill:project:dup', name: 'dup', description: 'abcdef', enabled: true }
  withState({ inventory: {}, catalog: { ...emptyCatalog(), skill: [a, b] } }, () =>
    assert.equal(sumTokens(contextItems()), 6)
  )
})

test('contextItems sorts by always, then on use, then name', () => {
  const inventory = {
    claudeMd: {
      rules: [
        { path: '/p/.claude/rules/b.md', size: 40, scope: 'project', conditional: true },
        { path: '/p/.claude/rules/a.md', size: 40, scope: 'project', conditional: true },
        { path: '/p/.claude/rules/c.md', size: 80, scope: 'project', conditional: true },
        { path: '/p/.claude/rules/d.md', size: 4, scope: 'project', conditional: false }
      ]
    }
  }
  withState({ inventory, catalog: emptyCatalog() }, () =>
    assert.deepEqual(
      contextItems().map((e) => e.name),
      ['rules/d.md', 'rules/c.md', 'rules/a.md', 'rules/b.md']
    )
  )
})

test('contextItems works with no claudeMd in the inventory', () => {
  withState({ inventory: {}, catalog: emptyCatalog() }, () => assert.deepEqual(contextItems(), []))
})

test('keepCtx shows only off catalog items under the Off chip', () => {
  const offSkill = { type: 'skills', item: {}, enabled: false }
  const onSkill = { type: 'skills', item: {}, enabled: true }
  const rule = { type: 'rules', enabled: true }
  assert.equal(keepCtx(offSkill, 'off'), true)
  assert.equal(keepCtx(onSkill, 'off'), false)
  assert.equal(keepCtx(rule, 'off'), false)
})

test('keepCtx hides off items from All and type chips and filters by type', () => {
  const offSkill = { type: 'skills', item: {}, enabled: false }
  const onSkill = { type: 'skills', item: {}, enabled: true }
  const rule = { type: 'rules', enabled: true }
  assert.equal(keepCtx(offSkill, 'all'), false)
  assert.equal(keepCtx(offSkill, 'skills'), false)
  assert.equal(keepCtx(onSkill, 'all'), true)
  assert.equal(keepCtx(onSkill, 'skills'), true)
  assert.equal(keepCtx(onSkill, 'rules'), false)
  assert.equal(keepCtx(rule, 'rules'), true)
})
