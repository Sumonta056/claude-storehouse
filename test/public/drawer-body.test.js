import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.location = { search: '', href: 'http://localhost/' }

const { fileBodyHtml, pluginBodyHtml, jsonBodyHtml, backupsListHtml } = await import('../../public/ui/drawer-body.js')
const { normalize } = await import('../../public/logic/catalog.js')
const { dr, state } = await import('../../public/core/state.js')

function plugin(over = {}) {
  return {
    id: 'tools@market',
    name: 'tools',
    marketplace: 'market',
    version: '1.2.0',
    description: 'Tool kit',
    scope: 'global',
    installPath: '/h/.claude/plugins/cache/market/tools/1.2.0',
    enabled: true,
    missing: false,
    favorite: false,
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    ...over
  }
}

function inventory(over = {}) {
  return {
    global: { dir: '/h/.claude' },
    project: { dir: '/p' },
    plugins: [plugin()],
    devMods: [],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    favorites: [],
    ...over
  }
}

function withInv(inv, fn, drPatch = {}) {
  const saved = { inventory: state.inventory, catalog: state.catalog }
  const savedDr = { ...dr }
  try {
    state.inventory = inv
    state.catalog = normalize(inv)
    Object.assign(dr, drPatch)
    return fn(state.catalog)
  } finally {
    Object.assign(state, saved)
    Object.assign(dr, savedDr)
  }
}

const own = { kind: 'skill', name: 'review', scope: 'global', path: '/h/.claude/skills/review/SKILL.md' }
const fromPlugin = { ...own, scope: 'plugin', plugin: 'tools@market', readOnly: true }

const tabIds = (html) => [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1])

test('fileBodyHtml of an own file has Preview, Edit, and Backups tabs', () => {
  const html = withInv(inventory(), () => fileBodyHtml(own, false), { tab: 'preview', mainFile: own.path })
  assert.deepEqual(tabIds(html), ['preview', 'file', 'backups'])
  assert.match(html, /role="tablist" aria-label="Drawer views"/)
  assert.match(html, /data-tab="file"[^>]*>Edit</)
  assert.match(html, /id="pane-backups" role="tabpanel"/)
})

test('fileBodyHtml marks the current tab selected and the others not', () => {
  const html = withInv(inventory(), () => fileBodyHtml(own, false), { tab: 'file', mainFile: own.path })
  assert.match(html, /data-tab="file" aria-controls="pane-file" aria-selected="true"/)
  assert.match(html, /data-tab="preview" aria-controls="pane-preview" aria-selected="false"/)
})

test('fileBodyHtml of an own file has a format toolbar and a disabled Save button', () => {
  const html = withInv(inventory(), () => fileBodyHtml(own, false), { tab: 'preview', mainFile: own.path })
  assert.match(html, /role="toolbar" aria-label="Format"/)
  assert.match(html, /data-dact="fmt" data-fmt="bold" title="Bold \(Cmd\+B\)" aria-label="Bold \(Cmd\+B\)"/)
  assert.match(html, /data-dact="fmt" data-fmt="code"[^>]*>&lt;\/&gt;</)
  assert.match(html, /data-dact="save" id="dr-save" disabled>Save</)
  assert.match(html, /<textarea id="dr-txt" spellcheck="false" aria-label="File contents">/)
})

test('fileBodyHtml of a plugin file is read-only with no toolbar and no Backups tab', () => {
  const html = withInv(inventory(), () => fileBodyHtml(fromPlugin, false), { tab: 'preview', mainFile: own.path })
  assert.deepEqual(tabIds(html), ['preview', 'file'])
  assert.match(html, />Source \(read-only\)</)
  assert.doesNotMatch(html, /role="toolbar"|data-dact="save"|pane-backups/)
})

test('fileBodyHtml of a read-only local file also hides Edit and Backups', () => {
  const html = withInv(inventory(), () => fileBodyHtml({ ...own, readOnly: true }, false), { mainFile: own.path })
  assert.match(html, />Source \(read-only\)</)
  assert.doesNotMatch(html, /pane-backups/)
})

test('fileBodyHtml adds a Files tab for a folder skill', () => {
  const html = withInv(inventory(), () => fileBodyHtml(own, true), { mainFile: own.path })
  assert.deepEqual(tabIds(html), ['preview', 'file', 'files', 'backups'])
  assert.match(html, /id="pane-files" role="tabpanel"/)
})

test('fileBodyHtml names the main file on the Back button and escapes it', () => {
  const html = withInv(inventory(), () => fileBodyHtml(own, false), { mainFile: '/h/.claude/agents/<b>.md' })
  assert.match(html, /data-dact="main" id="dr-main" hidden>Back to &lt;b&gt;.md</)
})

test('pluginBodyHtml counts the skills, agents, hooks, and MCP servers of the plugin', () => {
  const inv = inventory({
    skills: [
      {
        kind: 'skill',
        name: 'lint',
        source: 'tools@market',
        scope: 'plugin',
        plugin: 'tools@market',
        description: 'Lints'
      },
      { kind: 'skill', name: 'mine', source: 'global', scope: 'global' }
    ],
    mcp: [
      {
        name: 'gh',
        origin: 'plugin',
        plugin: 'tools@market',
        scope: 'plugin',
        transport: 'stdio',
        command: 'gh-mcp',
        enabled: true
      }
    ]
  })
  const html = withInv(inv, (c) => pluginBodyHtml(c.plugin[0]), { tab: 'overview' })
  assert.match(html, /data-dact="jump" data-to="ov-skills"><b>1<\/b><span>Skills</)
  assert.match(html, /class="ov-tile zero" data-dact="jump" data-to="ov-agents"><b>0<\/b>/)
  assert.match(html, /data-to="ov-mcp"><b>1<\/b><span>MCP servers</)
  assert.match(html, /data-dact="sub" data-key="skill:tools@market:lint"/)
  assert.match(html, /<span class="cn">lint<\/span><span class="cd">Lints<\/span>/)
  assert.doesNotMatch(html, /<span class="cn">mine</)
  assert.match(html, /<span class="cd">Local · stdio · gh-mcp<\/span>/)
})

test('pluginBodyHtml says the plugin files are read-only and names Copy to my skills', () => {
  const html = withInv(inventory(), (c) => pluginBodyHtml(c.plugin[0]))
  assert.match(html, /Plugin files are read-only\. To edit a skill, open it and use <b>Copy to my skills<\/b>/)
  assert.match(html, /placeholder="Pick a file in the Files tab." readonly/)
})

test('pluginBodyHtml shows an empty line for each kind the plugin does not add', () => {
  const html = withInv(inventory(), (c) => pluginBodyHtml(c.plugin[0]))
  assert.match(html, /This plugin adds no skills\./)
  assert.match(html, /This plugin adds no agents\./)
  assert.match(html, /This plugin adds no hooks\./)
  assert.match(html, /This plugin adds no MCP servers\./)
  assert.match(html, /aria-labelledby="ov-skills-h"/)
})

test('pluginBodyHtml of a missing plugin has only the Overview tab', () => {
  const html = withInv(inventory({ plugins: [plugin({ missing: true })] }), (c) => pluginBodyHtml(c.plugin[0]))
  assert.deepEqual(tabIds(html), ['overview'])
})

test('pluginBodyHtml of a development mod leaves out the read-only note and lists its modules', () => {
  const inv = inventory({
    devMods: [
      { id: 'skins@dev', name: 'skins', path: '/h/.claude/dev-mods/s/skins', session: 's', modules: ['<m>.js'] }
    ]
  })
  const html = withInv(inv, (c) => pluginBodyHtml(c.mod[0]))
  assert.doesNotMatch(html, /Plugin files are read-only/)
  assert.match(html, /<code>&lt;m&gt;.js<\/code>/)
  assert.match(html, /CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1/)
})

test('pluginBodyHtml shows plugin items as Off when the plugin is off', () => {
  const inv = inventory({
    plugins: [plugin({ enabled: false })],
    skills: [{ kind: 'skill', name: 'lint', source: 'tools@market', scope: 'plugin', plugin: 'tools@market' }]
  })
  const html = withInv(inv, (c) => pluginBodyHtml(c.plugin[0]))
  assert.match(html, /class="ov-card off"/)
  assert.match(html, /<span class="badge off">Off<\/span>/)
})

test('pluginBodyHtml groups plugin hooks by event with the event help and the matcher', () => {
  const inv = inventory({
    hooks: [
      {
        id: 'h1',
        event: 'PreToolUse',
        matcher: 'Bash|Edit',
        command: 'node guard.mjs',
        plugin: 'tools@market',
        scope: 'plugin',
        file: 'plugin',
        index: { group: 0, hook: 0 }
      },
      {
        id: 'h2',
        event: 'MyEvent',
        matcher: '*',
        command: 'node other.mjs',
        plugin: 'tools@market',
        scope: 'plugin',
        file: 'plugin',
        index: { group: 1, hook: 0 }
      }
    ]
  })
  const html = withInv(inv, (c) => pluginBodyHtml(c.plugin[0]))
  assert.match(html, /<b>PreToolUse<\/b><span>Before Claude runs a tool\. It can block the tool\.<\/span>/)
  assert.match(html, /<span class="what">guard.mjs<\/span><span class="mchip">Tools: Bash, Edit<\/span>/)
  assert.match(html, /<b>MyEvent<\/b><span>Claude Code event\.<\/span>/)
  assert.match(html, /data-to="ov-hooks"><b>2<\/b>/)
})

test('jsonBodyHtml of a settings hook shows its JSON and where to edit it', () => {
  const item = {
    kind: 'hook',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'echo "<hi>"',
    timeout: 5,
    file: 'project'
  }
  const html = jsonBodyHtml(item)
  assert.match(html, /role="region" aria-label="JSON"/)
  assert.ok(html.includes('&quot;PreToolUse&quot;: ['))
  assert.ok(html.includes('&quot;command&quot;: &quot;echo \\&quot;&lt;hi&gt;\\&quot;&quot;'))
  assert.ok(html.includes('&quot;timeout&quot;: 5'))
  assert.match(
    html,
    /Read-only here\. Switch it on the Hooks page, or edit .claude\/settings.json on the Settings page\./
  )
})

test('jsonBodyHtml of a parked hook says it is parked in storehouse.json', () => {
  const html = jsonBodyHtml({ kind: 'hook', event: 'Stop', matcher: '', command: 'x', file: 'global', parked: true })
  assert.match(
    html,
    /parked in ~\/.claude\/storehouse.json\. Switch it on to put it back in ~\/.claude\/settings.json\./
  )
  assert.doesNotMatch(html, /timeout/)
})

test('jsonBodyHtml of a plugin hook names the plugin', () => {
  const html = withInv(inventory(), () =>
    jsonBodyHtml({ kind: 'hook', event: 'Stop', matcher: '', command: 'x', plugin: 'tools@market' })
  )
  assert.match(html, /This hook comes from the plugin tools and follows its switch\./)
})

test('jsonBodyHtml of an MCP server shows its config and says secrets are hidden', () => {
  const html = jsonBodyHtml({ kind: 'mcp', name: 'gh', config: { command: 'gh-mcp', env: { TOKEN: '••••' } } })
  assert.ok(html.includes('&quot;gh&quot;: {'))
  assert.match(html, /Env and header values are hidden\./)
})

test('backupsListHtml says there are no backups yet for an empty list', () => {
  assert.equal(
    backupsListHtml([], 'data-dact="restore"', true, 'dr'),
    '<p class="note">No backups for this file yet. Each save writes one.</p>'
  )
})

test('backupsListHtml lists each backup with a Restore button that carries the path', () => {
  const html = backupsListHtml(
    [{ path: '/h/.claude/backups/storehouse/a"b.json.1' }, { path: '/b/x.json.2', time: '2026-01-01T00:00:00Z' }],
    'data-dact="restore"',
    true,
    'dr'
  )
  assert.match(
    html,
    /id="dr-rs-0" data-dact="restore" data-path="\/h\/.claude\/backups\/storehouse\/a&quot;b.json.1">Restore</
  )
  assert.match(html, /<span class="when">a&quot;b.json.1<\/span>/)
  assert.match(html, /id="dr-rs-1"/)
  assert.ok(html.includes(new Date('2026-01-01T00:00:00Z').toLocaleString()))
  assert.match(html, /Newest first\./)
})

test('backupsListHtml disables Restore when the file cannot be restored', () => {
  const html = backupsListHtml([{ path: '/b/x.1' }], 'data-c="restore" data-k="sg"', false, 'sg')
  assert.match(html, /id="sg-rs-0" data-c="restore" data-k="sg" data-path="\/b\/x.1" disabled>Restore</)
})
