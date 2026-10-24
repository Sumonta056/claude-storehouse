import { test } from 'node:test'
import assert from 'node:assert/strict'

const els = new Map()

function el(id) {
  if (!els.has(id)) {
    els.set(id, {
      id,
      innerHTML: '',
      textContent: '',
      title: '',
      dataset: {},
      parentElement: {},
      classList: { contains: () => true },
      contains: () => false
    })
  }
  return els.get(id)
}

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = {
  getElementById: el,
  activeElement: null,
  querySelector: () => null,
  querySelectorAll: () => []
}

const { syncDrawerHead } = await import('../../public/ui/drawer.js')
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

function skill(over = {}) {
  return {
    kind: 'skill',
    name: 'review',
    source: 'global',
    scope: 'global',
    description: 'Review code',
    path: '/h/.claude/skills/review/SKILL.md',
    enabled: true,
    canToggle: true,
    favorite: false,
    ...over
  }
}

function pluginSkill(over = {}) {
  return skill({
    name: 'lint',
    source: 'tools@market',
    scope: 'plugin',
    plugin: 'tools@market',
    path: '/h/.claude/plugins/cache/market/tools/1.2.0/skills/lint/SKILL.md',
    readOnly: true,
    canToggle: false,
    ...over
  })
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

function head(inv, pick, { menu = false } = {}) {
  const saved = { inventory: state.inventory, catalog: state.catalog }
  const savedDr = { ...dr }
  els.clear()
  try {
    state.inventory = inv
    state.catalog = normalize(inv)
    const item = pick(state.catalog)
    dr.key = item.key
    dr.menu = menu
    dr.mainFile = null
    dr.file = null
    dr.root = null
    syncDrawerHead()
    return {
      kind: el('dr').dataset.kind,
      name: el('dr-name').textContent,
      desc: el('dr-desc').textContent,
      meta: el('dr-meta').innerHTML,
      tools: el('dr-tools').innerHTML,
      status: el('dr-status').innerHTML,
      facts: el('dr-facts').innerHTML,
      bar: el('dr-bar').innerHTML,
      path: el('dr-path').textContent
    }
  } finally {
    Object.assign(state, saved)
    Object.assign(dr, savedDr)
  }
}

test('drawer head of a local skill shows its kind, scope, name, and description', () => {
  const h = head(inventory({ skills: [skill()] }), (c) => c.skill[0])
  assert.equal(h.kind, 'skill')
  assert.equal(h.name, 'review')
  assert.equal(h.desc, 'Review code')
  assert.match(h.meta, /<b class="k">Skill<\/b>/)
  assert.match(h.meta, /<span>global<\/span>/)
})

test('drawer head says No description. when the item has none', () => {
  const h = head(inventory({ skills: [skill({ description: '' })] }), (c) => c.skill[0])
  assert.equal(h.desc, 'No description.')
})

test('drawer switch of a skill that is on names the action and the file it writes', () => {
  const h = head(inventory({ skills: [skill()] }), (c) => c.skill[0])
  assert.match(h.tools, /role="switch" data-dact="toggle" aria-checked="true" aria-label="Switch off skill review"/)
  assert.ok(h.tools.includes('title="Writes skillOverrides[&quot;review&quot;] in ~/.claude/settings.json"'))
  assert.match(h.tools, />On<\/button>/)
})

test('drawer switch of a skill that is off offers Switch on and shows Off', () => {
  const h = head(inventory({ skills: [skill({ enabled: false })] }), (c) => c.skill[0])
  assert.match(h.tools, /aria-checked="false" aria-label="Switch on skill review"/)
  assert.match(h.tools, />Off<\/button>/)
})

test('drawer head of a local skill has a star button and a closed More actions menu', () => {
  const h = head(inventory({ skills: [skill({ favorite: true })] }), (c) => c.skill[0])
  assert.match(h.tools, /data-dact="star"[^>]*aria-pressed="true" aria-label="Favorite review"/)
  assert.match(h.tools, /data-dact="menu"[^>]*aria-expanded="false"[^>]*aria-label="More actions"/)
  assert.doesNotMatch(h.tools, /role="menu"/)
})

test('drawer menu when open lists switch and reveal and points aria-controls at the menu', () => {
  const h = head(inventory({ skills: [skill()] }), (c) => c.skill[0], { menu: true })
  assert.match(h.tools, /aria-expanded="true" aria-controls="dr-menu"/)
  assert.match(h.tools, /role="menu" id="dr-menu" aria-label="More actions for review"/)
  assert.match(h.tools, /data-dact="m-toggle">Switch off</)
  assert.match(h.tools, /data-dact="m-finder">Reveal in Finder</)
  assert.doesNotMatch(h.tools, /m-open/)
})

test('drawer bar of a local skill offers Delete, Reveal in Finder, and Open in editor', () => {
  const h = head(inventory({ skills: [skill()] }), (c) => c.skill[0])
  assert.match(h.bar, /data-dact="delete">Delete…</)
  assert.match(h.bar, /data-dact="finder">Reveal in Finder</)
  assert.match(h.bar, /data-dact="editor">Open in editor</)
  assert.equal(h.status, '')
})

test('drawer bar of a read-only local item has no Delete button', () => {
  const h = head(inventory({ skills: [skill({ readOnly: true })] }), (c) => c.skill[0])
  assert.doesNotMatch(h.bar, /data-dact="delete"/)
  assert.match(h.bar, /data-dact="finder"/)
})

test('drawer shows the path with the home folder as ~ and a Copy path button', () => {
  const h = head(inventory({ skills: [skill()] }), (c) => c.skill[0])
  assert.equal(h.path, '~/.claude/skills/review/SKILL.md')
  assert.match(h.facts, /data-dact="copy" id="dr-copy" aria-label="Copy path"/)
})

test('drawer of a plugin skill says via plugin and follows the plugin state', () => {
  const h = head(inventory({ skills: [pluginSkill()] }), (c) => c.skill[0])
  assert.match(h.meta, /via plugin tools/)
  assert.doesNotMatch(h.tools, /role="switch"/)
  assert.match(h.tools, /<span class="st-chip on" title="Follows the plugin tools">On<\/span>/)
  assert.doesNotMatch(h.tools, /data-dact="menu"/)
})

test('drawer of a plugin skill shows a lock note that names the plugin and plugin actions', () => {
  const h = head(inventory({ skills: [pluginSkill()] }), (c) => c.skill[0])
  assert.match(h.status, /role="note"/)
  assert.match(h.status, /You cannot delete this skill\./)
  assert.match(h.status, /part of the plugin <b>tools<\/b>/)
  assert.match(h.status, /data-dact="plugin-toggle">Switch off plugin</)
  assert.match(h.status, /data-dact="plugin-uninstall">Uninstall plugin…</)
  assert.match(h.status, /data-dact="plugin-open">Open plugin/)
})

test('drawer of a plugin skill offers Copy to my skills and no Delete', () => {
  const h = head(inventory({ skills: [pluginSkill()] }), (c) => c.skill[0])
  assert.match(h.bar, /Want your own version\?/)
  assert.match(h.bar, /data-dact="fork">Copy to my skills</)
  assert.doesNotMatch(h.bar, /data-dact="delete"/)
  assert.doesNotMatch(h.bar, /data-dact="editor"/)
})

test('drawer of a skill in a plugin that is off shows Off and Switch on plugin', () => {
  const inv = inventory({ plugins: [plugin({ enabled: false })], skills: [pluginSkill()] })
  const h = head(inv, (c) => c.skill[0])
  assert.match(h.tools, /<span class="st-chip off"[^>]*>Off<\/span>/)
  assert.match(h.status, /Switch on plugin/)
})

test('drawer of a plugin agent uses the word agent in the lock note and offers no fork', () => {
  const agent = {
    kind: 'agent',
    name: 'helper',
    source: 'tools@market',
    scope: 'plugin',
    plugin: 'tools@market',
    path: '/h/.claude/plugins/cache/market/tools/1.2.0/agents/helper.md',
    readOnly: true,
    canToggle: false,
    enabled: true
  }
  const h = head(inventory({ agents: [agent] }), (c) => c.agent[0])
  assert.match(h.status, /You cannot delete this agent\./)
  assert.doesNotMatch(h.bar, /data-dact="fork"/)
  assert.match(h.bar, /data-dact="editor"/)
})

test('drawer meta of an agent lists its model and tool count with the tool names in a title', () => {
  const agent = {
    kind: 'agent',
    name: 'helper',
    source: 'global',
    scope: 'global',
    path: '/h/.claude/agents/helper.md',
    enabled: true,
    canToggle: true,
    model: 'opus',
    tools: ['Read', 'Edit']
  }
  const h = head(inventory({ agents: [agent] }), (c) => c.agent[0])
  assert.match(h.meta, /<b class="k">Agent<\/b>/)
  assert.match(h.meta, /<span>opus<\/span>/)
  assert.match(h.meta, /<span title="Read, Edit">2 tools<\/span>/)
  assert.match(h.tools, /title="Renames helper.md to helper.md.disabled"/)
})

test('drawer escapes a name with HTML in the star label and the menu label', () => {
  const h = head(inventory({ skills: [skill({ name: '<img src=x>' })] }), (c) => c.skill[0], { menu: true })
  assert.match(h.tools, /aria-label="Favorite &lt;img src=x&gt;"/)
  assert.match(h.tools, /aria-label="More actions for &lt;img src=x&gt;"/)
  assert.doesNotMatch(h.tools, /<img src=x>/)
})

test('drawer of a plugin shows its version and an Uninstall plugin button', () => {
  const h = head(inventory(), (c) => c.plugin[0])
  assert.match(h.meta, /<b class="k">Plugin<\/b>/)
  assert.match(h.meta, /<span title="1.2.0">v1.2.0<\/span>/)
  assert.match(h.tools, /aria-label="Switch off plugin tools"/)
  assert.ok(h.tools.includes('title="Writes enabledPlugins[&quot;tools@market&quot;] in ~/.claude/settings.json"'))
  assert.match(h.bar, /data-dact="uninstall">Uninstall plugin…</)
  assert.equal(h.status, '')
})

test('drawer of a mod says Mod and counts its modules', () => {
  const inv = inventory({ plugins: [plugin({ isMod: true, modules: ['a.js', 'b.js'] })] })
  const h = head(inv, (c) => c.plugin[0])
  assert.match(h.meta, /<b class="k">Mod<\/b>/)
  assert.match(h.meta, /<span title="a.js, b.js">2 modules<\/span>/)
})

test('drawer of a missing plugin warns that the folder is gone and offers Remove entry', () => {
  const inv = inventory({ plugins: [plugin({ id: 'x<y>@m', missing: true })] })
  const h = head(inv, (c) => c.plugin[0])
  assert.match(h.tools, /<span class="st-chip bad">Missing<\/span>/)
  assert.match(h.status, /Plugin folder missing\./)
  assert.match(h.status, /x&lt;y&gt;@m is listed in installed_plugins.json/)
  assert.match(h.bar, /data-dact="uninstall">Remove entry…</)
  assert.doesNotMatch(h.bar, /data-dact="finder"/)
})

test('drawer of a development mod is read-only with no star and no uninstall', () => {
  const mod = {
    id: 'skins@dev',
    name: 'skins',
    description: 'Skin mod',
    path: '/h/.claude/dev-mods/abcdef123456/skins',
    session: 'abcdef123456',
    version: '0.1.0',
    modules: ['m.js']
  }
  const h = head(inventory({ devMods: [mod] }), (c) => c.mod.find((m) => m.dev))
  assert.match(h.meta, /<b class="k">Mod<\/b>/)
  assert.match(h.meta, /in development/)
  assert.match(h.meta, /<span title="abcdef123456">session abcdef12<\/span>/)
  assert.match(h.tools, /<span class="st-chip" title="Development mod in ~\/.claude\/dev-mods\/abcdef123456/)
  assert.match(h.tools, />Read-only<\/span>/)
  assert.doesNotMatch(h.tools, /data-dact="star"/)
  assert.match(h.status, /Development mod\./)
  assert.doesNotMatch(h.bar, /data-dact="uninstall"/)
})

test('drawer of a hook names it by event and matcher and has no star or menu', () => {
  const hook = {
    id: 'h1',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'node ~/.claude/hooks/guard.mjs',
    scope: 'global',
    file: 'global',
    index: { group: 0, hook: 0 },
    enabled: true,
    canToggle: true,
    path: '/h/.claude/settings.json'
  }
  const h = head(inventory({ hooks: [hook] }), (c) => c.hook[0])
  assert.equal(h.name, 'PreToolUse · Bash')
  assert.match(h.meta, /<b class="k">Hook<\/b>/)
  assert.match(h.tools, /<span class="st-chip on">On<\/span>/)
  assert.doesNotMatch(h.tools, /data-dact="star"|data-dact="menu"/)
})
