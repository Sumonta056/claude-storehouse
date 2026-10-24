import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chipFilter, items, state } from '../../public/core/state.js'
import { normalize } from '../../public/logic/catalog.js'

globalThis.location ??= { search: '', href: 'http://localhost/', hash: '' }
const { chipsHtml } = await import('../../public/ui/chips.js')

const DAY = 86400000
const old = Date.now() - 60 * DAY

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
    mtime: old,
    ...over
  }
}

function inventory(over = {}) {
  return { plugins: [], skills: [], agents: [], hooks: [], mcp: [], favorites: [], ...over }
}

function withCatalog(inv, patch, fn) {
  const fields = { inventory: inv, query: '', scope: 'all', usage: null, usageSort: 'name', ...patch }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  const chips = { ...chipFilter }
  Object.assign(state, fields)
  try {
    state.catalog = normalize(inv)
    return fn(state.catalog)
  } finally {
    Object.assign(state, before)
    Object.assign(chipFilter, chips)
    items.clear()
  }
}

function usage(map = {}) {
  return { items: map, all: { responses: 5 }, since: Date.now() - 40 * DAY }
}

test('chipsHtml lists the chips with counts and marks the active one pressed', () => {
  const inv = inventory({ skills: [skill('a'), skill('b', { enabled: false }), skill('c')] })
  withCatalog(inv, { page: 'skills' }, (c) => {
    const html = chipsHtml('skills', c.skill, 'A note')
    assert.ok(html.includes('role="group" aria-label="Filter skills"'))
    assert.match(html, /data-chip="all" aria-pressed="true">All <span class="n">3<\/span>/)
    assert.match(html, /data-chip="on" aria-pressed="false">On <span class="n">2<\/span>/)
    assert.match(html, /data-chip="off" aria-pressed="false">Off <span class="n">1<\/span>/)
    assert.match(html, /data-chip="plugin" aria-pressed="false">From plugins <span class="n">0<\/span>/)
    assert.ok(html.includes('<p class="note">A note</p>'))
  })
})

test('without usage the Unused chip, the sort, and the banner are hidden', () => {
  const inv = inventory({ skills: [skill('a')] })
  withCatalog(inv, { page: 'skills' }, (c) => {
    const html = chipsHtml('skills', c.skill, '')
    assert.ok(!html.includes('data-chip="unused"'))
    assert.ok(!html.includes('class="usort"'))
    assert.ok(!html.includes('class="ubanner"'))
  })
})

test('with usage the sort group marks the current sort pressed', () => {
  const inv = inventory({ skills: [skill('a')] })
  withCatalog(
    inv,
    { page: 'skills', usage: usage({ 'skill:a': { count30: 1, last: Date.now() } }), usageSort: 'most' },
    (c) => {
      const html = chipsHtml('skills', c.skill, '')
      assert.ok(html.includes('role="group" aria-label="Sort by use"'))
      assert.ok(html.includes('data-usort="most" aria-pressed="true">Most used</button>'))
      assert.ok(html.includes('data-usort="least" aria-pressed="false">Least used</button>'))
      assert.ok(html.includes('data-usort="name" aria-pressed="false">Name</button>'))
      assert.match(
        html,
        /class="chip" id="chip-skills-unused" data-chip="unused"[^>]*>Unused 30 d <span class="n">0<\/span>/
      )
      assert.ok(!html.includes('class="ubanner"'))
    }
  )
})

test('an unused skill gets a red Unused chip and a banner with its token cost and switch-off button', () => {
  const inv = inventory({ skills: [skill('a'), skill('b')] })
  withCatalog(inv, { page: 'skills', usage: usage({ 'skill:b': { count30: 4, last: Date.now() } }) }, (c) => {
    const html = chipsHtml('skills', c.skill, '')
    assert.match(html, /class="chip bad" id="chip-skills-unused"[^>]*>Unused 30 d <span class="n">1<\/span>/)
    assert.ok(html.includes('<div class="ubanner" role="note"><p><b>1 skill had no use in 30 days.</b>'))
    assert.ok(html.includes(' Together they add 4 tok to every session.'))
    assert.ok(html.includes('Skills you start by typing /name do not count as use.'))
    assert.ok(html.includes('data-unused="show">Show them</button>'))
    assert.ok(html.includes('data-unused="off">Switch off 1</button>'))
  })
})

test('the banner hides Show them while the Unused chip is active', () => {
  const inv = inventory({ skills: [skill('a')] })
  withCatalog(inv, { page: 'skills', usage: usage({ 'skill:z': { count30: 1, last: Date.now() } }) }, (c) => {
    chipFilter.skills = 'unused'
    const html = chipsHtml('skills', c.skill, '')
    assert.match(html, /data-chip="unused" aria-pressed="true"/)
    assert.ok(!html.includes('data-unused="show"'))
    assert.ok(html.includes('data-unused="off"'))
  })
})

test('the banner counts only items the scope filter shows', () => {
  const inv = inventory({ skills: [skill('a'), skill('p', { source: 'project', scope: 'project' })] })
  withCatalog(
    inv,
    { page: 'skills', scope: 'global', usage: usage({ 'skill:z': { count30: 1, last: Date.now() } }) },
    (c) => assert.ok(chipsHtml('skills', c.skill, '').includes('<b>1 skill had no use in 30 days.</b>'))
  )
})

test('the MCP banner has no token cost, no typed note, and no switch for servers that cannot switch', () => {
  const mcp = [
    { name: 'a', origin: 'user', scope: 'global', command: 'x', enabled: true, canToggle: false },
    { name: 'b', origin: 'user', scope: 'global', command: 'x', enabled: true, canToggle: false }
  ]
  withCatalog(inventory({ mcp }), { page: 'mcp', usage: usage({ 'mcp:z': { count30: 1, last: Date.now() } }) }, (c) => {
    const html = chipsHtml('mcp', c.mcp, '')
    assert.ok(html.includes('<b>2 MCP servers had no use in 30 days.</b>'))
    assert.ok(!html.includes('Together they add'))
    assert.ok(!html.includes('typing /name'))
    assert.ok(!html.includes('data-unused="off"'))
    assert.ok(html.includes('aria-label="Filter mcp servers"'))
  })
})

test('the Plugins page marks Broken red when a plugin folder is missing and has no sort', () => {
  const plugins = [
    { id: 'a@m', name: 'a', enabled: true, skills: [], agents: [], hooks: [], mcp: [] },
    { id: 'b@m', name: 'b', missing: true, enabled: true, skills: [], agents: [], hooks: [], mcp: [] }
  ]
  withCatalog(
    inventory({ plugins }),
    { page: 'plugins', usage: usage({ 'skill:z': { count30: 1, last: Date.now() } }) },
    (c) => {
      const html = chipsHtml('plugins', c.plugin, '')
      assert.match(html, /class="chip bad" id="chip-plugins-broken"[^>]*>Broken <span class="n">1<\/span>/)
      assert.ok(!html.includes('class="usort"'))
      assert.ok(!html.includes('class="ubanner"'))
    }
  )
})

test('the Doctor page marks Errors red only when an error exists', () => {
  withCatalog(inventory(), { page: 'doctor' }, () => {
    const bad = chipsHtml('doctor', [{ severity: 'error' }, { severity: 'info' }], '')
    assert.match(bad, /class="chip bad" id="chip-doctor-error"[^>]*>Errors <span class="n">1<\/span>/)
    assert.match(bad, /class="chip" id="chip-doctor-warning"[^>]*>Warnings <span class="n">0<\/span>/)
    const ok = chipsHtml('doctor', [{ severity: 'info' }], '')
    assert.match(ok, /class="chip" id="chip-doctor-error"/)
  })
})

test('the Duplicates chip bar counts groups that need action', () => {
  const groups = [{ items: [{ enabled: true }, { enabled: true }] }, { items: [{ enabled: true }, { enabled: false }] }]
  withCatalog(inventory(), { page: 'dups' }, () => {
    const html = chipsHtml('dups', groups, '')
    assert.ok(html.includes('aria-label="Filter duplicates"'))
    assert.match(html, /data-chip="needs"[^>]*>Needs action <span class="n">1<\/span>/)
  })
})
