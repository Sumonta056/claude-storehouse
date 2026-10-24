import { test } from 'node:test'
import assert from 'node:assert/strict'

const els = new Map()

function el(id) {
  if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '' })
  return els.get(id)
}

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = { getElementById: el, activeElement: null, querySelector: () => null, querySelectorAll: () => [] }

const { renderHooks } = await import('../../public/pages/hooks.js')
const { normalize } = await import('../../public/logic/catalog.js')
const { cfg, chipFilter, freshHookForm, groupOpen, state } = await import('../../public/core/state.js')

function hook(over = {}) {
  return {
    id: 'h1',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'node ~/.claude/hooks/guard.mjs',
    scope: 'global',
    file: 'global',
    index: { group: 0, hook: 0 },
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

function page(inv, { form, query = '', chip = 'all', closed = [] } = {}) {
  const saved = { inventory: state.inventory, catalog: state.catalog, page: state.page, query: state.query }
  const savedChip = chipFilter.hooks
  const savedForm = cfg.hook
  els.clear()
  try {
    state.inventory = inv
    state.catalog = normalize(inv)
    state.page = 'hooks'
    state.query = query
    chipFilter.hooks = chip
    cfg.hook = { ...freshHookForm(), ...form }
    for (const g of closed) groupOpen.set(g, false)
    renderHooks()
    return el('p-hooks').innerHTML
  } finally {
    Object.assign(state, saved)
    chipFilter.hooks = savedChip
    cfg.hook = savedForm
    for (const g of closed) groupOpen.delete(g)
  }
}

test('Hooks page says where it looked when there are no hooks', () => {
  const html = page(inventory())
  assert.match(
    html,
    /No hooks in ~\/.claude\/settings.json, .claude\/settings.json, .claude\/settings.local.json, or plugins\./
  )
})

test('a hook row names the script, the tools it runs for, and the settings file', () => {
  const html = page(inventory({ hooks: [hook()] }))
  assert.match(html, /data-act="open" aria-label="Show PreToolUse hook guard.mjs">guard.mjs</)
  assert.match(html, /<span class="mchip">Tools: Bash<\/span>/)
  assert.match(html, /<span class="tag global">global<\/span><span class="src">~\/.claude\/settings.json<\/span>/)
  assert.match(html, /<summary>Show command<\/summary><pre>node ~\/.claude\/hooks\/guard.mjs<\/pre>/)
})

test('a hook switch names the event and the file it moves the hook out of', () => {
  const html = page(inventory({ hooks: [hook()] }))
  assert.match(
    html,
    /role="switch" data-act="toggle" aria-checked="true" aria-label="Switch off PreToolUse hook guard.mjs"/
  )
  assert.match(html, /title="Off moves this hook from ~\/.claude\/settings.json to ~\/.claude\/storehouse.json"/)
})

test('a hook row has a Delete button with an aria label that names the hook', () => {
  const html = page(inventory({ hooks: [hook()] }))
  assert.match(html, /data-act="del" aria-label="Delete PreToolUse hook guard.mjs">Delete</)
})

test('a parked hook is marked off and parked and points at storehouse.json', () => {
  const html = page(inventory({ hooks: [hook({ enabled: false, parked: true })] }))
  assert.match(html, /<li class="lrow hrow off"/)
  assert.match(html, /<span class="flag">Off<\/span>/)
  assert.match(html, /<span class="tag">parked<\/span><span class="src">~\/.claude\/storehouse.json<\/span>/)
  assert.match(html, /aria-checked="false" aria-label="Switch on PreToolUse hook guard.mjs"/)
})

test('a plugin hook is locked, says via plugin, and has no Delete button', () => {
  const html = page(
    inventory({ hooks: [hook({ plugin: 'tools@market', scope: 'plugin', file: 'plugin', canToggle: false })] })
  )
  assert.match(html, /<li class="lrow hrow locked"/)
  assert.match(html, /<span>via plugin tools<\/span>/)
  assert.match(html, /class="lead-ic" role="img" aria-label="Follows the plugin tools@market/)
  assert.doesNotMatch(html, /data-act="del"/)
})

test('a hook with a timeout shows it in seconds', () => {
  const html = page(inventory({ hooks: [hook({ timeout: 30 })] }))
  assert.match(html, /<span class="src">30s timeout<\/span>/)
})

test('a hook command with HTML is escaped', () => {
  const html = page(inventory({ hooks: [hook({ command: 'echo "<script>alert(1)</script>"' })] }))
  assert.ok(html.includes('<pre>echo &quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;</pre>'))
  assert.doesNotMatch(html, /<script>/)
})

test('hooks are grouped by event in session order with a count and the event help', () => {
  const html = page(
    inventory({
      hooks: [
        hook({ id: 'a', event: 'Stop', matcher: '' }),
        hook({ id: 'b', index: { group: 1, hook: 0 } }),
        hook({ id: 'c', event: 'SessionStart', matcher: '' })
      ]
    })
  )
  const order = [...html.matchAll(/<span class="gname">([^<]+)<\/span>/g)].map((m) => m[1])
  assert.deepEqual(order, ['SessionStart', 'PreToolUse', 'Stop'])
  assert.match(
    html,
    /id="gb-hook-PreToolUse" data-group="hook:PreToolUse" aria-expanded="true" aria-controls="gp-hook-PreToolUse"/
  )
  assert.match(
    html,
    /<span class="gdesc">Before Claude runs a tool\. It can block the tool\.<\/span><span class="gcount">1 hook<\/span>/
  )
  assert.match(html, /<span class="mchip">Every start<\/span>/)
})

test('a hook of an unknown event gets its own group after the known events', () => {
  const html = page(inventory({ hooks: [hook({ id: 'x', event: 'Future<Event>' }), hook()] }))
  const order = [...html.matchAll(/<span class="gname">([^<]+)<\/span>/g)].map((m) => m[1])
  assert.deepEqual(order, ['PreToolUse', 'Future&lt;Event&gt;'])
  assert.match(html, /<span class="gdesc">Claude Code event\.<\/span>/)
})

test('a closed group keeps its header and hides its rows', () => {
  const html = page(inventory({ hooks: [hook()] }), { closed: ['hook:PreToolUse'] })
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /id="gp-hook-PreToolUse" hidden><\/div>/)
  assert.doesNotMatch(html, /hrow/)
})

test('the Hooks page says nothing matches the search', () => {
  const html = page(inventory({ hooks: [hook()] }), { query: 'zzz' })
  assert.match(html, /Nothing matches &quot;zzz&quot; in this scope\./)
})

test('the Hooks page says no hooks match the chip filter', () => {
  const html = page(inventory({ hooks: [hook()] }), { chip: 'off' })
  assert.match(html, /No hooks match this filter\./)
})

test('the Add hook button is closed and the form is hidden by default', () => {
  const html = page(inventory())
  assert.match(html, /id="hf-open" data-c="hf-open" aria-expanded="false" aria-controls="hook-form">Add hook</)
  assert.doesNotMatch(html, /id="hook-form"/)
})

test('the open hook form lists both scopes, every event, and keeps the typed values escaped', () => {
  const html = page(inventory(), { form: { open: true, command: 'a"b<c>', matcher: 'Edit|Write' } })
  assert.match(html, /id="hf-open"[^>]*aria-expanded="true"[^>]*>Close form</)
  assert.match(html, /<form class="form" id="hook-form" novalidate aria-labelledby="hf-title">/)
  assert.match(html, /<option value="global" selected>Global · ~\/.claude\/settings.json<\/option>/)
  assert.match(html, /<option value="project">Project · .claude\/settings.json<\/option>/)
  assert.match(html, /<option value="PreToolUse" selected>PreToolUse<\/option>/)
  assert.match(html, /<option value="SessionStart">SessionStart<\/option>/)
  assert.match(html, /id="hf-matcher" data-f="hook.matcher" value="Edit\|Write"/)
  assert.match(html, /id="hf-command" data-f="hook.command" value="a&quot;b&lt;c&gt;"/)
  assert.match(html, /aria-required="true" aria-describedby="hf-err"/)
})

test('the hook form has no Project scope when no project folder is open', () => {
  const html = page(inventory({ project: null }), { form: { open: true } })
  assert.doesNotMatch(html, /value="project"/)
})

test('the hook form marks the invalid field and shows the error in an alert', () => {
  const html = page(inventory(), { form: { open: true, invalid: 'command', error: 'Enter the <command>.' } })
  assert.match(html, /id="hf-command"[^>]*aria-invalid="true"/)
  assert.match(html, /<p class="form-err" id="hf-err" role="alert">Enter the &lt;command&gt;\.<\/p>/)
})
