import { test } from 'node:test'
import assert from 'node:assert/strict'
import { items, state } from '../../public/core/state.js'
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
const { needUsage, renderDash } = await import('../../public/pages/dash.js')

const DAY = 86400000

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
    favoriteCategories: [],
    claudeMd: {},
    settings: {},
    ...over
  }
}

function period(over = {}) {
  return {
    cost: 12.34,
    tokens: 1500000,
    responses: 1234,
    sessions: 7,
    projects: 1,
    saved: 5.5,
    cacheShare: 0.425,
    unpriced: [],
    models: [{ model: 'claude-opus-4-1', cost: 12.34 }],
    ...over
  }
}

function usage(over = {}) {
  return { monthKey: '2026-10', all: period({ cost: 100, sessions: 20, projects: 3 }), month: period(), ...over }
}

function dash(inv, patch = {}) {
  const fields = {
    inventory: inv,
    page: 'dash',
    query: '',
    scope: 'all',
    usage: null,
    usageError: '',
    usagePeriod: 'month',
    projectFiles: null,
    menuKey: null,
    ...patch
  }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  Object.assign(state, fields)
  try {
    state.catalog = normalize(inv)
    renderDash()
    return nodes.get('p-dash').innerHTML
  } finally {
    Object.assign(state, before)
    items.clear()
  }
}

test('the usage band shows a busy skeleton while usage loads', () => {
  const html = dash(inventory())
  assert.ok(html.includes('class="usage is-loading" aria-busy="true"'))
  assert.ok(html.includes('Reading usage from ~/.claude/projects…'))
  assert.equal(html.match(/class="sk sk-b"/g).length, 4)
})

test('the usage band drops the skeleton once usage arrives', () => {
  const html = dash(inventory(), { usage: usage() })
  assert.ok(!html.includes('is-loading'))
  assert.ok(!html.includes('class="sk '))
})

test('the usage band shows the escaped error when usage could not load', () => {
  const html = dash(inventory(), { usageError: 'EACCES <denied>' })
  assert.ok(html.includes('Could not read usage from <code>~/.claude/projects</code>: EACCES &lt;denied&gt;'))
})

test('the usage band says so when there is no usage at all', () => {
  const html = dash(inventory(), { usage: usage({ all: period({ responses: 0 }) }) })
  assert.ok(html.includes('No Claude Code usage found in <code>~/.claude/projects</code>.'))
})

test('the usage band shows this month by default with cost, tokens, sessions, and cache', () => {
  const html = dash(inventory(), { usage: usage() })
  assert.ok(html.includes('<div class="big"><small>$</small>12.34</div>'))
  assert.ok(html.includes('<p>October 2026. All Claude Code usage on this machine'))
  assert.ok(html.includes('data-period="month" aria-pressed="true">This month'))
  assert.ok(html.includes('data-period="all" aria-pressed="false">All time'))
  assert.ok(html.includes('1.5M<span>tokens · 1,234 responses</span>'))
  assert.ok(html.includes('<b>7</b><span>Sessions across 1 project</span>'))
  assert.ok(html.includes('<b class="g">$5.50</b><span>Saved by prompt cache</span>'))
  assert.ok(html.includes('<b>42.5%</b><span>Input tokens served from cache</span>'))
  assert.ok(html.includes('aria-label="Cost by model: Opus 4.1 100.0%"'))
})

test('the All time period shows the all-time numbers and plural projects', () => {
  const html = dash(inventory(), { usage: usage(), usagePeriod: 'all' })
  assert.ok(html.includes('<small>$</small>100.00'))
  assert.ok(html.includes('<p>All time. All Claude Code usage'))
  assert.ok(html.includes('data-period="all" aria-pressed="true"'))
  assert.ok(html.includes('Sessions across 3 projects'))
})

test('a period with no cost says there is no priced usage', () => {
  const html = dash(inventory(), { usage: usage({ month: period({ cost: 0, models: [] }) }) })
  assert.ok(html.includes('<p>No priced usage in this period.</p>'))
})

test('an unknown model is named and escaped in the usage band', () => {
  const html = dash(inventory(), { usage: usage({ month: period({ unpriced: ['<new-model>'] }) }) })
  assert.ok(html.includes('No price for <code>&lt;new-model&gt;</code>. Its tokens count, its cost does not.'))
})

test('the stat tiles show total, on, and off counts for each type', () => {
  const inv = inventory({
    skills: [skill('a'), skill('b'), skill('c', { enabled: false })],
    hooks: [{ id: 'h', event: 'Stop', matcher: '*', command: 'x', file: 'global', scope: 'global', enabled: true }]
  })
  const html = dash(inv)
  assert.match(
    html,
    /data-go="skills">[\s\S]*?<span class="l">Skills<\/span>[\s\S]*?<span class="n">3<\/span>[\s\S]*?<span class="on">2 on<\/span><span class="off">1 off<\/span>/
  )
  assert.match(html, /data-go="hooks">[\s\S]*?<span class="n">1<\/span>[\s\S]*?1 on<\/span><span class="off">0 off/)
  assert.match(html, /data-go="mcp">[\s\S]*?MCP servers[\s\S]*?<span class="n">0<\/span>/)
})

test('files that could not be read show with a home-relative path and an escaped error', () => {
  const html = dash(inventory({ errors: [{ path: '/h/.claude/settings.json', error: 'Unexpected <token>' }] }))
  assert.ok(html.includes('<b>1 file could not be read.</b>'))
  assert.ok(html.includes('<code>~/.claude/settings.json</code>: Unexpected &lt;token&gt;'))
  const two = dash(
    inventory({
      errors: [
        { path: '/a', error: 'x' },
        { path: '/b', error: 'y' }
      ]
    })
  )
  assert.ok(two.includes('<b>2 files could not be read.</b>'))
})

test('Favorites says how to add one when there are none', () => {
  assert.ok(dash(inventory()).includes('No favorites yet. Click the star on any row.'))
})

test('Favorites lists favorite rows with their category tag', () => {
  const inv = inventory({
    skills: [skill('a', { favorite: true })],
    favorites: [{ kind: 'skill', id: 'skill:local:a', name: 'a', source: 'local', category: 'Work' }]
  })
  const html = dash(inv)
  assert.ok(html.includes('<ul class="rows" data-rows="dfav">'))
  assert.ok(html.includes('<span class="cat-tag">Work</span>'))
  assert.ok(!html.includes('data-go="fav"'))
})

test('Favorites says none are in scope and links to all favorites when some are hidden', () => {
  const inv = inventory({
    skills: [skill('a'), skill('p', { source: 'project', scope: 'project' })],
    favorites: [
      { kind: 'skill', id: 'skill:local:a', name: 'a', source: 'local', category: null },
      { kind: 'skill', id: 'skill:project:p', name: 'p', source: 'project', category: null }
    ]
  })
  assert.ok(dash(inv, { scope: 'global' }).includes('data-go="fav">All favorites'))
  const none = inventory({
    skills: [skill('p', { source: 'project', scope: 'project' })],
    favorites: [{ kind: 'skill', id: 'skill:project:p', name: 'p', source: 'project', category: null }]
  })
  assert.ok(dash(none, { scope: 'global' }).includes('No favorites in this scope.'))
})

test('Recently changed lists the 5 newest items, newest first, with kind and scope', () => {
  const now = Date.now()
  const skills = ['s1', 's2', 's3', 's4', 's5', 's6'].map((n, i) => skill(n, { mtime: now - (i + 1) * DAY }))
  const html = dash(inventory({ skills }))
  const names = [...html.matchAll(/<li class="recent" data-key="[^"]+"><button[^>]*>([^<]+)<\/button>/g)].map(
    (m) => m[1]
  )
  assert.deepEqual(names, ['s1', 's2', 's3', 's4', 's5'])
  assert.ok(html.includes('<span class="ck">Skill · global</span>'))
  assert.ok(html.includes('>1 d ago</span>'))
})

test('Recently changed is hidden when no item has a file time', () => {
  assert.ok(!dash(inventory({ skills: [skill('a')] })).includes('Recently changed'))
})

test('the project files list says which files are present', () => {
  const inv = inventory({
    claudeMd: { project: { exists: true } },
    settings: { project: { exists: false }, projectLocal: { exists: true } }
  })
  const html = dash(inv)
  assert.ok(html.includes('aria-label="CLAUDE.md, present. Open CLAUDE.md"'))
  assert.ok(html.includes('aria-label=".claude/settings.json, not found. Open Settings"'))
  assert.ok(html.includes('aria-label=".claude/settings.local.json, present. Open Settings"'))
  assert.ok(html.includes('aria-label=".mcp.json, not found. Open MCP servers"'))
})

test('.mcp.json counts as present from the project files list or a project MCP server', () => {
  const mcp = [{ name: 'x', origin: 'mcpjson', scope: 'project', command: 'x', enabled: true, canToggle: true }]
  assert.ok(dash(inventory({ mcp })).includes('aria-label=".mcp.json, present. Open MCP servers"'))
  assert.ok(
    dash(inventory(), { projectFiles: new Set(['.mcp.json']) }).includes(
      'aria-label=".mcp.json, present. Open MCP servers"'
    )
  )
})

test('Project items lists project rows, or says there are none', () => {
  const html = dash(inventory({ skills: [skill('p', { source: 'project', scope: 'project' })] }))
  assert.ok(html.includes('Project items <span class="pill">1</span>'))
  assert.ok(html.includes('data-rows="dproj"'))
  assert.ok(dash(inventory()).includes('No skills, agents, or plugins in ./.claude.'))
  assert.ok(dash(inventory(), { query: '<q>' }).includes('No project items match &quot;&lt;q&gt;&quot;.'))
})

test('without a project folder the project column shows the project-off note', () => {
  const html = dash(inventory({ project: null }))
  assert.ok(html.includes('project scope is off'))
  assert.ok(!html.includes('Project items'))
})

test('needUsage fetches /api/usage once for a usage page, never for other pages, and waits for the inventory to render', async () => {
  const before = { usage: state.usage, usageLoad: state.usageLoad, inventory: state.inventory }
  const realFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return { ok: true, status: 200, json: async () => usage() }
  }
  try {
    Object.assign(state, { usage: null, usageLoad: null, inventory: null })
    globalThis.document.getElementById('p-dash').innerHTML = 'before'
    needUsage('doctor')
    assert.equal(state.usageLoad, null)
    needUsage('dash')
    needUsage('skills')
    await state.usageLoad
    assert.equal(urls.length, 1)
    assert.ok(urls[0].includes('/api/usage'))
    assert.equal(state.usage.all.responses, usage().all.responses)
    assert.equal(nodes.get('p-dash').innerHTML, 'before')
  } finally {
    globalThis.fetch = realFetch
    Object.assign(state, before)
  }
})
