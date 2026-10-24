import { test } from 'node:test'
import assert from 'node:assert/strict'

const els = new Map()

function el(id) {
  if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '' })
  return els.get(id)
}

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = { getElementById: el, activeElement: null, querySelector: () => null, querySelectorAll: () => [] }

const { renderMcp } = await import('../../public/pages/mcp.js')
const { normalize } = await import('../../public/logic/catalog.js')
const { cfg, chipFilter, freshMcpForm, state } = await import('../../public/core/state.js')

function server(over = {}) {
  return {
    name: 'github',
    origin: 'user',
    scope: 'global',
    transport: 'stdio',
    command: 'npx',
    config: { command: 'npx', env: { GH_VAR: 'x' } },
    enabled: true,
    canToggle: true,
    ...over
  }
}

function inventory(over = {}) {
  return {
    global: { dir: '/h/.claude' },
    project: { dir: '/p' },
    plugins: [
      { id: 'tools@market', name: 'tools', enabled: true, skills: [], agents: [], hooks: [], mcp: [], scope: 'global' }
    ],
    devMods: [],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    favorites: [],
    ...over
  }
}

function page(inv, { form, query = '', chip = 'all' } = {}) {
  const keys = ['inventory', 'catalog', 'page', 'query', 'usage', 'usageSort']
  const saved = Object.fromEntries(keys.map((k) => [k, state[k]]))
  const savedChip = chipFilter.mcp
  const savedForm = cfg.mcp
  els.clear()
  try {
    state.inventory = inv
    state.catalog = normalize(inv)
    state.page = 'mcp'
    state.query = query
    state.usage = null
    state.usageSort = 'name'
    chipFilter.mcp = chip
    cfg.mcp = { ...freshMcpForm(), ...form }
    renderMcp()
    return el('p-mcp').innerHTML
  } finally {
    Object.assign(state, saved)
    chipFilter.mcp = savedChip
    cfg.mcp = savedForm
  }
}

test('MCP page says where it looked when there are no servers', () => {
  assert.match(page(inventory()), /No MCP servers in ~\/.claude.json, .mcp.json, or plugins\./)
})

test('an MCP row shows name, transport, command, source file, and env key names', () => {
  const html = page(inventory({ mcp: [server()] }))
  assert.match(
    html,
    /data-act="open" aria-label="Show MCP server github">github<\/button><span class="mchip">Local · stdio<\/span>/
  )
  assert.match(html, /<code class="one-line" title="npx">npx<\/code>/)
  assert.match(html, /<span class="tag global">global<\/span><span class="src">~\/.claude.json<\/span>/)
  assert.match(html, /<span class="mchip key">env GH_VAR<\/span>/)
})

test('an MCP row shows env and header names but never their values', () => {
  const env = { SERVICE_VAR: 'leak-env-value' }
  const headers = { Authorization: 'leak-header-value' }
  const html = page(inventory({ mcp: [server({ config: { command: 'npx', env, headers } })] }))
  assert.match(html, /env SERVICE_VAR/)
  assert.match(html, /header Authorization/)
  assert.doesNotMatch(html, /leak-env-value|leak-header-value/)
})

test('a remote MCP row shows its URL', () => {
  const html = page(inventory({ mcp: [server({ transport: 'http', command: undefined, url: 'https://x.dev/mcp' })] }))
  assert.match(html, /<span class="mchip">Remote · http<\/span>/)
  assert.match(html, /<code class="one-line" title="https:\/\/x.dev\/mcp">/)
})

test('an MCP switch names the server and the file it writes', () => {
  const html = page(inventory({ mcp: [server()] }))
  assert.match(html, /role="switch" data-act="toggle" aria-checked="true" aria-label="Switch off MCP server github"/)
  assert.match(html, /title="Writes disabledMcpServers for this folder in ~\/.claude.json"/)
})

test('a .mcp.json server switch names settings.local.json and sits under Project', () => {
  const html = page(inventory({ mcp: [server({ origin: 'mcpjson', scope: 'project' })] }))
  assert.match(html, /title="Writes enabledMcpjsonServers or disabledMcpjsonServers in .claude\/settings.local.json"/)
  assert.match(html, /<h2>Project <span class="pill">1<\/span>/)
})

test('an MCP server that is off has the off class and an Off flag', () => {
  const html = page(inventory({ mcp: [server({ enabled: false })] }))
  assert.match(html, /<li class="lrow mrow off"/)
  assert.match(html, /<span class="flag">Off<\/span>/)
  assert.match(html, /aria-label="Switch on MCP server github"/)
})

test('user, local, and .mcp.json servers have a Delete button', () => {
  for (const origin of ['user', 'local', 'mcpjson']) {
    const html = page(inventory({ mcp: [server({ origin })] }))
    assert.match(html, /data-act="del" aria-label="Delete MCP server github">Delete</, origin)
  }
})

test('a plugin MCP server shows its Claude Code name and has no Delete button', () => {
  const html = page(inventory({ mcp: [server({ origin: 'plugin', plugin: 'tools@market', scope: 'plugin' })] }))
  assert.match(html, /<li class="lrow mrow locked"/)
  assert.match(html, /<span>via plugin tools<\/span>/)
  assert.match(html, /Claude Code name: plugin:tools:github/)
  assert.match(html, /<h2>From plugins <span class="pill">1<\/span>/)
  assert.doesNotMatch(html, /data-act="del"/)
})

test('a plugin MCP server that cannot switch shows a lock instead of a switch', () => {
  const html = page(
    inventory({ mcp: [server({ origin: 'plugin', plugin: 'tools@market', scope: 'plugin', canToggle: false })] })
  )
  assert.match(html, /class="lead-ic" role="img" aria-label="github cannot be switched here\."/)
  assert.doesNotMatch(html, /role="switch"/)
})

test('a server name used twice is flagged with the count and the other sources', () => {
  const html = page(inventory({ mcp: [server(), server({ origin: 'mcpjson', scope: 'project' })] }))
  assert.match(html, /<span class="flag" title="Also from: .mcp.json">Name used 2 times<\/span>/)
  assert.match(html, /<span class="flag" title="Also from: ~\/.claude.json">Name used 2 times<\/span>/)
})

test('MCP rows are split into Global, Project, and From plugins sections', () => {
  const html = page(
    inventory({
      mcp: [
        server({ name: 'p', origin: 'plugin', plugin: 'tools@market', scope: 'plugin' }),
        server({ name: 'g' }),
        server({ name: 'l', origin: 'mcpjson', scope: 'project' })
      ]
    })
  )
  const heads = [...html.matchAll(/<h2>([^<]+) <span class="pill">/g)].map((m) => m[1])
  assert.deepEqual(heads, ['Global', 'Project', 'From plugins'])
})

test('an MCP name with HTML is escaped', () => {
  const html = page(inventory({ mcp: [server({ name: '<b>x</b>' })] }))
  assert.match(html, />&lt;b&gt;x&lt;\/b&gt;<\/button>/)
  assert.doesNotMatch(html, /<b>x<\/b>/)
})

test('the MCP page says nothing matches the search', () => {
  const html = page(inventory({ mcp: [server()] }), { query: 'zzz' })
  assert.match(html, /Nothing matches &quot;zzz&quot; in this scope\./)
})

test('the MCP page says no servers match the chip filter', () => {
  const html = page(inventory({ mcp: [server()] }), { chip: 'off' })
  assert.match(html, /No MCP servers match this filter\./)
})

test('the stdio form asks for command, arguments, and env and escapes typed values', () => {
  const html = page(inventory(), { form: { open: true, name: 'gh"x', env: 'A=<1>' } })
  assert.match(html, /id="mf-open"[^>]*aria-expanded="true"[^>]*>Close form</)
  assert.match(
    html,
    /<option value="global" selected>Global · ~\/.claude.json<\/option><option value="project">Project · .mcp.json<\/option>/
  )
  assert.match(html, /id="mf-name" data-f="mcp.name" value="gh&quot;x"/)
  assert.match(html, /<option value="stdio" selected>stdio<\/option>/)
  assert.match(html, /<label for="mf-command">Command \(required\)<\/label>/)
  assert.match(html, /id="mf-args"/)
  assert.match(html, /data-f="mcp.env"[^>]*>\nA=&lt;1&gt;<\/textarea>/)
  assert.doesNotMatch(html, /id="mf-url"/)
})

test('the http form asks for a URL instead of a command', () => {
  const html = page(inventory(), { form: { open: true, transport: 'http', url: 'https://x' } })
  assert.match(html, /<option value="http" selected>http<\/option>/)
  assert.match(html, /id="mf-url" data-f="mcp.url" value="https:\/\/x"[^>]*aria-required="true"/)
  assert.doesNotMatch(html, /id="mf-command"/)
})

test('the MCP form marks the invalid field, shows the error, and has no Project scope without a project', () => {
  const html = page(inventory({ project: null }), { form: { open: true, invalid: 'name', error: 'Bad <name>' } })
  assert.match(html, /id="mf-name"[^>]*aria-invalid="true"/)
  assert.match(html, /<p class="form-err" id="mf-err" role="alert">Bad &lt;name&gt;<\/p>/)
  assert.doesNotMatch(html, /value="project"/)
})
