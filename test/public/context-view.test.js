import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chipFilter, items, state } from '../../public/core/state.js'
import { normalize } from '../../public/logic/catalog.js'

const nodes = new Map()
globalThis.location ??= { search: '', href: 'http://localhost/', hash: '' }
globalThis.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '' })
    return nodes.get(id)
  },
  querySelector: () => null
}
const { renderContext } = await import('../../public/pages/context.js')

function skill(name, over = {}) {
  return {
    kind: 'skill',
    name,
    source: 'local',
    scope: 'global',
    description: 'Does a thing',
    enabled: true,
    canToggle: true,
    path: `/h/.claude/skills/${name}/SKILL.md`,
    size: 800,
    ...over
  }
}

function inventory(over = {}) {
  return {
    global: { dir: '/h/.claude' },
    project: { dir: '/p' },
    plugins: [],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    favorites: [],
    claudeMd: {},
    ...over
  }
}

function context(inv, patch = {}, chip = 'all') {
  const fields = { inventory: inv, page: 'context', query: '', scope: 'all', usage: null, menuKey: null, ...patch }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  const chipBefore = chipFilter.context
  Object.assign(state, fields)
  chipFilter.context = chip
  try {
    state.catalog = normalize(inv)
    renderContext()
    return nodes.get('p-context').innerHTML
  } finally {
    Object.assign(state, before)
    chipFilter.context = chipBefore
    items.clear()
  }
}

const md = { global: { exists: true, path: '/h/.claude/CLAUDE.md', size: 400 } }

test('the band totals the tokens loaded in every session and counts each type', () => {
  const html = context(inventory({ claudeMd: md, skills: [skill('a')] }))
  assert.ok(html.includes('<div class="big" id="ctx-total">104<small> tokens</small></div>'))
  assert.ok(html.includes('Estimate: file bytes ÷ 4.'))
  assert.ok(html.includes('1 CLAUDE.md file · 0 rules · 1 skill · 0 agents · MCP servers not measured'))
  assert.ok(html.includes('<div class="mon">CLAUDE.md<span>96% of the total</span></div>'))
  assert.ok(html.includes('aria-label="Context by type: CLAUDE.md 96%, Skills 4%"'))
})

test('the band says nothing loads when there is nothing', () => {
  const html = context(inventory())
  assert.ok(html.includes('id="ctx-total">0<small> tokens</small>'))
  assert.ok(html.includes('<div class="mon">Nothing<span>loads at start</span></div>'))
  assert.ok(html.includes('<div class="empty">Nothing in this scope.</div>'))
})

test('a CLAUDE.md row links to the CLAUDE.md page and shows a home-relative path', () => {
  const html = context(inventory({ claudeMd: md }))
  assert.ok(
    html.includes('<button type="button" class="name btn-plain" data-go="claudemd">~/.claude/CLAUDE.md</button>')
  )
  assert.ok(html.includes('<span class="src">Global · ~/.claude/CLAUDE.md</span>'))
  assert.ok(html.includes('aria-label="CLAUDE.md file"'))
  assert.ok(html.includes('<p class="desc">Loads in full at session start.</p>'))
  assert.ok(html.includes('<span>100 tok</span>'))
})

test('a project file shows a path relative to the project folder', () => {
  const html = context(inventory({ claudeMd: { project: { exists: true, path: '/p/CLAUDE.md', size: 40 } } }))
  assert.ok(html.includes('<span class="src">Project · ./CLAUDE.md</span>'))
})

test('a conditional rule costs nothing at start and shows its on-use cost', () => {
  const rules = [{ path: '/p/.claude/rules/ui.md', scope: 'project', size: 200, conditional: true }]
  const html = context(inventory({ claudeMd: { rules } }))
  assert.ok(html.includes('<span class="name">rules/ui.md</span>'))
  assert.ok(html.includes('aria-label="Rule file"'))
  assert.ok(html.includes('Has paths: in its frontmatter. Loads when Claude reads a matching file.'))
  assert.ok(html.includes('<span class="mchip">On use: 50 tok</span>'))
  assert.ok(html.includes('<span>0 tok</span>'))
})

test('a skill that is on shows its body cost on use', () => {
  const html = context(inventory({ skills: [skill('a')] }))
  assert.ok(html.includes('<span class="mchip">Body on use: 200 tok</span>'))
  assert.ok(html.includes('<span>4 tok</span>'))
})

test('a skill that is off says how many tokens it saves, under the Off chip only', () => {
  const inv = inventory({ skills: [skill('a', { enabled: false })] })
  assert.ok(!context(inv).includes('Saves'))
  const html = context(inv, {}, 'off')
  assert.ok(html.includes('<span class="mchip okc">Saves 4 tok while off</span>'))
  assert.ok(
    html.includes('<h2>Switched off <span class="pill">1</span><span class="hint">4 tok saved while off</span>')
  )
})

test('an MCP server row says its tools are not measured', () => {
  const mcp = [{ name: 'srv', origin: 'user', scope: 'global', command: 'x', enabled: true, canToggle: true }]
  const html = context(inventory({ mcp }))
  assert.ok(html.includes('<span>not measured</span>'))
  assert.ok(html.includes('<span class="mchip">Tool names load at start. Not measured.</span>'))
})

test('an item with a duplicate name links to Duplicates', () => {
  const html = context(inventory({ skills: [skill('a'), skill('a', { source: 'project', scope: 'project' })] }))
  assert.equal(html.match(/data-go="dups">Same name as another skill<\/button>/g).length, 2)
  const mcp = [
    { name: 's', origin: 'user', scope: 'global', command: 'x', enabled: true, canToggle: true },
    { name: 's', origin: 'mcpjson', scope: 'project', command: 'x', enabled: true, canToggle: true }
  ]
  assert.ok(context(inventory({ mcp })).includes('Same name as another MCP server'))
})

test('the largest item gets a full bar and a tiny item gets at least 4%', () => {
  const html = context(
    inventory({
      claudeMd: { global: { exists: true, path: '/h/.claude/CLAUDE.md', size: 40000 } },
      skills: [skill('a')]
    })
  )
  assert.ok(html.includes('<span style="width:100%"></span>'))
  assert.ok(html.includes('<span style="width:4%"></span>'))
})

test('the list shows the heading with the start total and sorts the biggest first', () => {
  const html = context(inventory({ claudeMd: md, skills: [skill('a')] }))
  assert.ok(
    html.includes('<h2>Biggest items <span class="pill">2</span><span class="hint">104 tok at session start</span>')
  )
  assert.ok(html.indexOf('data-go="claudemd"') < html.indexOf('data-key="skill:local:a"'))
})

test('item names and descriptions are escaped in context rows', () => {
  const html = context(inventory({ skills: [skill('<s>', { description: '<d>' })] }))
  assert.ok(html.includes('&lt;s&gt;'))
  assert.ok(html.includes('&lt;d&gt;'))
  assert.ok(!html.includes('<s>'))
})
