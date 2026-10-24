import { test } from 'node:test'
import assert from 'node:assert/strict'
import { items, state } from '../../public/core/state.js'
import { normalize } from '../../public/logic/catalog.js'
import {
  cellSwitch,
  empty,
  nothingMatches,
  rowHtml,
  scopeTag,
  useChips,
  useFlag,
  viaPlugin
} from '../../public/ui/rows.js'

const DAY = 86400000
const old = Date.now() - 60 * DAY

function inventory(over = {}) {
  return {
    plugins: [
      {
        id: 'tools@market',
        name: 'tools',
        marketplace: 'market',
        description: 'Tool kit',
        version: '1.2.0',
        scope: 'global',
        installPath: '/h/.claude/plugins/cache/market/tools/1.2.0',
        enabled: true,
        skills: [{}, {}],
        agents: [{}],
        hooks: [],
        mcp: [{}]
      }
    ],
    skills: [
      {
        kind: 'skill',
        name: 'review',
        source: 'local',
        scope: 'global',
        description: 'Checks code',
        enabled: true,
        canToggle: true,
        path: '/h/.claude/skills/review/SKILL.md',
        size: 400,
        mtime: old
      },
      {
        kind: 'skill',
        name: 'lint',
        source: 'project',
        scope: 'project',
        description: 'Lints',
        enabled: false,
        canToggle: true,
        path: '/p/.claude/skills/lint/SKILL.md',
        mtime: old
      },
      {
        kind: 'skill',
        name: 'deploy',
        source: 'tools',
        scope: 'plugin',
        plugin: 'tools@market',
        description: 'Ships',
        enabled: true,
        canToggle: false,
        mtime: old
      }
    ],
    agents: [
      {
        kind: 'agent',
        name: 'helper',
        source: 'local',
        scope: 'global',
        description: 'Helps',
        enabled: true,
        canToggle: true,
        path: '/h/.claude/agents/helper.md',
        model: 'opus',
        tools: ['Read', 'Grep']
      }
    ],
    hooks: [
      {
        id: 'h1',
        event: 'PreToolUse',
        matcher: '*',
        command: 'run.sh',
        file: 'global',
        enabled: true,
        canToggle: true,
        scope: 'global',
        index: { group: 0, hook: 0 }
      }
    ],
    mcp: [
      { name: 'srv', origin: 'user', scope: 'global', command: 'node', enabled: true, canToggle: true },
      { name: 'files', origin: 'mcpjson', scope: 'project', command: 'npx', enabled: false, canToggle: true },
      { name: 'stuck', origin: 'user', scope: 'global', command: 'x', enabled: true, canToggle: false }
    ],
    devMods: [
      {
        id: 'skins',
        name: 'skins',
        description: 'Dev skin',
        path: '/h/.claude/dev-mods/abcdef123456/skins',
        session: 'abcdef123456',
        modules: ['skin.js']
      }
    ],
    favorites: [],
    ...over
  }
}

function withCatalog(patch, fn, over = {}) {
  const inv = inventory(over)
  const before = {}
  const fields = { inventory: inv, page: 'skills', query: '', menuKey: null, menuCtx: '', usage: null, ...patch }
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  Object.assign(state, fields)
  try {
    state.catalog = normalize(inv)
    return fn(state.catalog)
  } finally {
    Object.assign(state, before)
    items.clear()
  }
}

function find(list, name) {
  return list.find((i) => i.name === name)
}

function usage(map = {}) {
  return { items: map, all: { responses: 5 }, since: Date.now() - 40 * DAY }
}

test('rowHtml escapes the name and description of an item', () => {
  withCatalog({}, (c) => {
    const item = { ...find(c.skill, 'review'), name: '<b>x</b>', description: 'a & "b"' }
    const html = rowHtml(item)
    assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'))
    assert.ok(html.includes('a &amp; &quot;b&quot;'))
    assert.ok(!html.includes('<b>x</b>'))
  })
})

test('rowHtml shows "No description" when an item has none', () => {
  withCatalog({}, (c) => {
    const html = rowHtml({ ...find(c.skill, 'review'), description: '' })
    assert.match(html, /<p class="desc">No description<\/p>/)
  })
})

test('a global skill that is on has a switch that names the file it writes', () => {
  withCatalog({}, (c) => {
    const html = rowHtml(find(c.skill, 'review'))
    assert.match(html, /role="switch" data-act="toggle" aria-checked="true"/)
    assert.ok(html.includes('aria-label="Switch off skill review"'))
    assert.ok(html.includes('title="Writes skillOverrides[&quot;review&quot;] in ~/.claude/settings.json"'))
    assert.ok(!html.includes('<span class="flag">Off</span>'))
  })
})

test('a project skill that is off shows the Off flag and writes settings.local.json', () => {
  withCatalog({}, (c) => {
    const html = rowHtml(find(c.skill, 'lint'))
    assert.match(html, /<li class="lrow off"/)
    assert.match(html, /aria-checked="false"/)
    assert.ok(html.includes('aria-label="Switch on skill lint"'))
    assert.ok(html.includes('in .claude/settings.local.json'))
    assert.ok(html.includes('<span class="flag">Off</span>'))
  })
})

test('an agent switch says it renames the file, and the meta shows model and tools', () => {
  withCatalog({}, (c) => {
    const html = rowHtml(find(c.agent, 'helper'))
    assert.ok(html.includes('title="Renames helper.md to helper.md.disabled"'))
    assert.ok(html.includes('<span class="mchip">model: opus</span>'))
    assert.ok(html.includes('<span class="mchip">Read · Grep</span>'))
  })
})

test('a plugin skill has a lock instead of a switch and follows its plugin', () => {
  withCatalog({}, (c) => {
    const html = rowHtml(find(c.skill, 'deploy'))
    assert.ok(!html.includes('role="switch"'))
    assert.match(html, /<li class="lrow locked"/)
    assert.ok(html.includes('aria-label="Follows the plugin tools@market. Switch the plugin on the Plugins page."'))
    assert.ok(!html.includes('<span class="src">'))
  })
})

test('a plugin skill in Favorites shows "via plugin" with the plugin name', () => {
  withCatalog({}, (c) => {
    assert.ok(rowHtml(find(c.skill, 'deploy'), 'fav').includes('<span class="src">via plugin tools</span>'))
  })
})

test('a plugin row shows its parts, version, marketplace, and the enabledPlugins tooltip', () => {
  withCatalog({ page: 'plugins' }, (c) => {
    const html = rowHtml(c.plugin[0])
    assert.ok(html.includes('title="Writes enabledPlugins[&quot;tools@market&quot;] in ~/.claude/settings.json"'))
    assert.ok(html.includes('<p class="meta">2 skills · 1 agent · 1 MCP</p>'))
    assert.ok(html.includes('<span class="ver" title="1.2.0">v1.2.0</span>'))
    assert.ok(html.includes('<span class="src">market</span>'))
    assert.ok(html.includes('aria-label="Favorite tools"'))
  })
})

test('a plugin with no parts says so in a muted meta line', () => {
  withCatalog(
    { page: 'plugins' },
    (c) => {
      assert.ok(
        rowHtml(c.plugin[0]).includes('<p class="meta muted">No skills, agents, hooks, or MCP servers found</p>')
      )
    },
    {
      plugins: [{ id: 'bare@m', name: 'bare', enabled: true, skills: [], agents: [], hooks: [], mcp: [] }]
    }
  )
})

test('a plugin whose folder is missing shows a warning, a flag, and a Remove entry button', () => {
  withCatalog(
    { page: 'plugins' },
    (c) => {
      const html = rowHtml(c.plugin[0])
      assert.ok(html.includes('aria-label="Plugin folder missing"'))
      assert.ok(html.includes('title="gone@m is listed but its folder is missing"'))
      assert.ok(html.includes('<span class="flag bad">Folder missing</span>'))
      assert.ok(html.includes('data-act="uninstall">Remove entry</button>'))
      assert.ok(html.includes('Listed in installed_plugins.json, but the plugin folder is gone.'))
      assert.ok(html.includes('Use “Remove entry” to clean up installed_plugins.json.'))
    },
    {
      plugins: [
        { id: 'gone@m', name: 'gone', missing: true, enabled: true, skills: [], agents: [], hooks: [], mcp: [] }
      ]
    }
  )
})

test('the star shows the favorite state and is absent for hooks, MCP servers, and dev mods', () => {
  withCatalog({}, (c) => {
    const fav = rowHtml({ ...find(c.skill, 'review'), favorite: true })
    assert.match(fav, /data-act="star"[^>]*aria-pressed="true"/)
    assert.match(rowHtml(find(c.skill, 'review')), /data-act="star"[^>]*aria-pressed="false"/)
    assert.ok(!rowHtml(c.hook[0]).includes('data-act="star"'))
    assert.ok(!rowHtml(find(c.mcp, 'srv')).includes('data-act="star"'))
    assert.ok(!rowHtml(c.mod.find((m) => m.dev)).includes('data-act="star"'))
  })
})

test('a dev mod shows its modules and the first 8 characters of its session, with no switch', () => {
  withCatalog({ page: 'mods' }, (c) => {
    const html = rowHtml(c.mod.find((m) => m.dev))
    assert.ok(html.includes('<span class="mchip">skin.js</span>'))
    assert.ok(html.includes('<span class="mchip">session abcdef12</span>'))
    assert.ok(!html.includes('role="switch"'))
    assert.ok(html.includes('aria-label="Development mod in ~/.claude/dev-mods/abcdef123456. It has no switch here."'))
  })
})

test('the Mod flag shows outside the Mods page only', () => {
  const plugins = [
    { id: 'm@m', name: 'm', enabled: true, isMod: true, modules: ['a.js'], skills: [], agents: [], hooks: [], mcp: [] }
  ]
  withCatalog({ page: 'plugins' }, (c) => assert.ok(rowHtml(c.plugin[0]).includes('<span class="flag">Mod</span>')), {
    plugins
  })
  withCatalog(
    { page: 'mods' },
    (c) => {
      const html = rowHtml(c.plugin[0])
      assert.ok(!html.includes('<span class="flag">Mod</span>'))
      assert.ok(html.includes('<span class="mchip">a.js</span>'))
    },
    { plugins }
  )
})

test('the menu is closed unless its key and context match the open menu', () => {
  withCatalog({}, (c) => {
    const item = find(c.skill, 'review')
    const closed = rowHtml(item)
    assert.ok(closed.includes('aria-expanded="false"'))
    assert.ok(!closed.includes('role="menu"'))
    state.menuKey = item.key
    state.menuCtx = 'fav'
    assert.ok(!rowHtml(item).includes('role="menu"'))
    assert.ok(rowHtml(item, 'fav').includes('role="menu"'))
  })
})

test('an open skill menu lists open, switch, and reveal, with the item name in its label', () => {
  withCatalog({}, (c) => {
    const item = find(c.skill, 'review')
    state.menuKey = item.key
    const html = rowHtml(item)
    assert.ok(html.includes('aria-expanded="true" aria-controls="menu-skill_local_review"'))
    assert.ok(html.includes('aria-label="More actions for review"'))
    assert.ok(html.includes('data-act="m-open">Open details</button>'))
    assert.ok(html.includes('data-act="m-toggle">Switch off</button>'))
    assert.ok(html.includes('data-act="m-finder">Reveal in Finder</button>'))
    assert.ok(!html.includes('m-uninstall'))
  })
})

test('an open plugin menu ends with a danger Uninstall entry after a separator', () => {
  withCatalog({ page: 'plugins' }, (c) => {
    const item = c.plugin[0]
    state.menuKey = item.key
    assert.match(
      rowHtml(item),
      /role="separator"><\/div><button type="button" role="menuitem" class="menu-item danger" data-act="m-uninstall">Uninstall plugin…<\/button>/
    )
  })
})

test('in Duplicates the source is Global, Project, or via plugin, and keep adds Keep only this', () => {
  withCatalog({ page: 'dups' }, (c) => {
    assert.ok(rowHtml(find(c.skill, 'review'), 'dups').includes('<span class="src">Global</span>'))
    assert.ok(rowHtml(find(c.skill, 'lint'), 'dups').includes('<span class="src">Project</span>'))
    assert.ok(rowHtml(find(c.skill, 'deploy'), 'dups').includes('<span class="src">via plugin tools</span>'))
    assert.ok(!rowHtml(find(c.skill, 'review'), 'dups').includes('data-act="keep"'))
    assert.ok(rowHtml(find(c.skill, 'review'), 'dups', { keep: true }).includes('data-act="keep">Keep only this'))
  })
})

test('rowHtml adds draggable, a category tag, a right cell, and a note when asked', () => {
  withCatalog({}, (c) => {
    const html = rowHtml(find(c.skill, 'review'), 'fav', {
      draggable: true,
      cat: '<Work>',
      right: '<i id="r"></i>',
      note: '<i id="n"></i>'
    })
    assert.ok(html.includes('draggable="true"'))
    assert.ok(html.includes('<span class="cat-tag">&lt;Work&gt;</span>'))
    assert.ok(html.includes('<i id="r"></i>'))
    assert.ok(html.includes('<i id="n"></i>'))
  })
})

test('the token chip shows the listing cost on the Skills and Agents pages only', () => {
  withCatalog({}, (c) => {
    const html = rowHtml(find(c.skill, 'review'))
    assert.ok(
      html.includes(
        '<span class="tokc" title="About 5 tok in every session for the name and description. The full file, about 100 tok, loads on use.">5 tok</span>'
      )
    )
    state.page = 'dash'
    assert.ok(!rowHtml(find(c.skill, 'review')).includes('class="tokc"'))
    state.page = 'agents'
    assert.ok(rowHtml(find(c.agent, 'helper')).includes('class="tokc"'))
    assert.ok(!rowHtml(find(c.mcp, 'srv')).includes('class="tokc"'))
  })
})

test('useChips is empty without usage, outside usage pages, and for plugins', () => {
  withCatalog({}, (c) => {
    assert.equal(useChips(find(c.skill, 'review')), '')
    state.usage = usage({ 'skill:review': { count30: 3, last: Date.now() - 2 * DAY } })
    state.page = 'plugins'
    assert.equal(useChips(find(c.skill, 'review')), '')
    state.page = 'skills'
    assert.equal(useChips(c.plugin[0]), '')
  })
})

test('useChips shows the 30-day count and the last use', () => {
  withCatalog({ usage: usage({ 'skill:review': { count30: 3, last: Date.now() - 2 * DAY } }) }, (c) => {
    const html = useChips(find(c.skill, 'review'))
    assert.ok(html.includes('<span class="mchip">Used 3× in 30 d</span>'))
    assert.match(html, /<span class="mchip" title="[^"]+">last: 2 d ago<\/span>/)
    assert.equal(useFlag(find(c.skill, 'review')), '')
  })
})

test('an unused skill shows Never used and the Unused 30 d flag in its row', () => {
  withCatalog({ usage: usage({ 'skill:other': { count30: 1, last: Date.now() } }) }, (c) => {
    const item = find(c.skill, 'review')
    assert.ok(useChips(item).includes('<span class="mchip warnc">Never used</span>'))
    assert.equal(useFlag(item), '<span class="flag bad">Unused 30 d</span>')
    assert.ok(rowHtml(item).includes('<span class="flag bad">Unused 30 d</span>'))
  })
})

test('a skill with disable-model-invocation is never flagged Unused', () => {
  withCatalog({ usage: usage({ 'skill:other': { count30: 1, last: Date.now() } }) }, (c) => {
    const item = { ...find(c.skill, 'review'), disableModelInvocation: true }
    assert.equal(useFlag(item), '')
    assert.ok(!useChips(item).includes('Never used'))
  })
})

test('useChips says when the count is shared with another item of the same name', () => {
  const skills = [
    { kind: 'skill', name: 'review', source: 'local', scope: 'global', enabled: true, canToggle: true, path: '/a' },
    { kind: 'skill', name: 'review', source: 'project', scope: 'project', enabled: true, canToggle: true, path: '/b' }
  ]
  withCatalog(
    { usage: usage({ 'skill:review': { count30: 2, last: Date.now() - 2 * DAY } }) },
    (c) => assert.ok(useChips(c.skill[0]).includes('Shared with 1 item of this name')),
    { skills }
  )
})

test('scopeTag and empty escape their text', () => {
  assert.equal(scopeTag('<g>'), '<span class="tag &lt;g&gt;">&lt;g&gt;</span>')
  assert.equal(empty('a < b'), '<div class="empty">a &lt; b</div>')
})

test('nothingMatches quotes the escaped search, or names the scope when there is none', () => {
  withCatalog({ query: '<script>' }, () =>
    assert.equal(nothingMatches(), '<div class="empty">Nothing matches &quot;&lt;script&gt;&quot; in this scope.</div>')
  )
  withCatalog({ query: '' }, () => assert.equal(nothingMatches(), '<div class="empty">Nothing in this scope.</div>'))
})

test('cellSwitch shows a lock for a plugin item that has no switch', () => {
  const mcp = [
    {
      name: 'pm',
      origin: 'plugin',
      plugin: 'tools@market',
      scope: 'plugin',
      command: 'x',
      enabled: true,
      canToggle: false
    }
  ]
  withCatalog(
    {},
    (c) => {
      const html = cellSwitch(c.mcp[0], 'MCP server pm')
      assert.ok(!html.includes('role="switch"'))
      assert.ok(html.includes('role="img" aria-label="pm cannot be switched here."'))
    },
    { mcp }
  )
})

test('cellSwitch for an MCP server names the file it writes', () => {
  withCatalog({}, (c) => {
    const global = cellSwitch(find(c.mcp, 'srv'), 'MCP server srv')
    assert.ok(global.includes('aria-checked="true"'))
    assert.ok(global.includes('aria-label="Switch off MCP server srv"'))
    assert.ok(global.includes('title="Writes disabledMcpServers for this folder in ~/.claude.json"'))
    assert.ok(!global.includes(' disabled>'))
    const local = cellSwitch(find(c.mcp, 'files'), 'MCP server files')
    assert.ok(local.includes('aria-label="Switch on MCP server files"'))
    assert.ok(
      local.includes('title="Writes enabledMcpjsonServers or disabledMcpjsonServers in .claude/settings.local.json"')
    )
  })
})

test('cellSwitch disables the switch and says why when an item cannot switch', () => {
  withCatalog({}, (c) => {
    const html = cellSwitch(find(c.mcp, 'stuck'), 'MCP server stuck')
    assert.ok(html.includes('<span class="via" title="stuck cannot be switched here.">cannot switch</span>'))
    assert.match(html, /role="switch"[^>]* disabled><\/button>/)
  })
})

test('cellSwitch for a hook says where Off parks it', () => {
  withCatalog({}, (c) => {
    assert.ok(
      cellSwitch(c.hook[0], 'hook run.sh').includes(
        'title="Off moves this hook from ~/.claude/settings.json to ~/.claude/storehouse.json"'
      )
    )
  })
})

test('viaPlugin names the plugin and escapes it', () => {
  withCatalog({}, (c) => {
    const html = viaPlugin(find(c.skill, 'deploy'))
    assert.ok(html.includes('<span>via plugin tools</span>'))
    assert.ok(html.includes('title="Follows the plugin tools. Switch or uninstall it on the Plugins page."'))
  })
  withCatalog({}, () => assert.ok(viaPlugin({ plugin: '<x>@m' }).includes('via plugin &lt;x&gt;@m')))
})
