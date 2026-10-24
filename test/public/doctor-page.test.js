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
const { renderDoctor } = await import('../../public/pages/doctor.js')

function inventory() {
  return {
    global: { dir: '/h/.claude' },
    plugins: [],
    skills: [
      {
        kind: 'skill',
        name: 'review',
        source: 'local',
        scope: 'global',
        enabled: true,
        canToggle: true,
        path: '/h/.claude/skills/review/SKILL.md'
      }
    ],
    agents: [],
    hooks: [],
    mcp: [],
    favorites: []
  }
}

function issue(over = {}) {
  return {
    id: 'i1',
    check: 'x',
    severity: 'warning',
    kind: 'skill',
    name: 'review',
    file: '/h/.claude/skills/review/SKILL.md',
    message: 'Has no description',
    target: null,
    ...over
  }
}

function doctor(value, patch = {}, chip = 'all') {
  const inv = inventory()
  const fields = { inventory: inv, page: 'doctor', query: '', scope: 'all', doctor: value, ...patch }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  const chipBefore = chipFilter.doctor
  Object.assign(state, fields)
  chipFilter.doctor = chip
  try {
    state.catalog = normalize(inv)
    renderDoctor()
    return nodes.get('p-doctor').innerHTML
  } finally {
    Object.assign(state, before)
    chipFilter.doctor = chipBefore
    items.clear()
  }
}

test('Doctor says how many files it checked when it found no issues', () => {
  assert.ok(doctor({ issues: [], checked: 3 }).includes('No issues found. Doctor checked 3 files.'))
  assert.ok(doctor({ issues: [], checked: 1 }).includes('No issues found. Doctor checked 1 file.'))
  assert.ok(doctor(null).includes('No issues found. Doctor checked 0 files.'))
})

test('Doctor shows an escaped error when it could not run', () => {
  const html = doctor({ error: 'boom <b>' })
  assert.equal(html, '<div class="empty">Doctor could not run: boom &lt;b&gt;</div>')
})

test('an issue row shows severity, name, kind, home-relative file, and escaped message', () => {
  const html = doctor({ issues: [issue({ message: 'Bad <tag> & more' })], checked: 2 })
  assert.ok(
    html.includes(
      '<h2>Warnings <span class="pill">1</span><span class="hint">These items do not work as the file says.</span></h2>'
    )
  )
  assert.ok(html.includes('data-doc="i1"'))
  assert.ok(html.includes('class="lead-ic sev-warning" role="img" aria-label="Warnings"'))
  assert.ok(
    html.includes('<span class="name">review</span><span class="src">Skill · ~/.claude/skills/review/SKILL.md</span>')
  )
  assert.ok(html.includes('<p class="desc">Bad &lt;tag&gt; &amp; more</p>'))
})

test('issues group by severity in the order errors, warnings, info', () => {
  const html = doctor({
    issues: [issue({ id: 'a', severity: 'info' }), issue({ id: 'b', severity: 'error' }), issue({ id: 'c' })],
    checked: 1
  })
  const heads = [...html.matchAll(/<h2>(\w+) <span class="pill">/g)].map((m) => m[1])
  assert.deepEqual(heads, ['Errors', 'Warnings', 'Info'])
  assert.ok(html.includes('aria-label="Errors"'))
  assert.ok(html.includes('aria-label="Info"'))
})

test('the row button opens a page, an item, or a file, in that order of preference', () => {
  const page = doctor({ issues: [issue({ target: { page: 'settings' } })] })
  assert.ok(page.includes('<button type="button" class="btn" data-go="settings">Open Settings</button>'))
  const item = doctor({ issues: [issue({ target: { kind: 'skill', name: 'review', scope: 'global' } })] })
  assert.ok(item.includes('data-doc-act="item">Open item</button>'))
  const file = doctor({ issues: [issue({ target: { kind: 'skill', name: 'gone', scope: 'global' } })] })
  assert.ok(file.includes('data-doc-act="file">Open file</button>'))
  const none = doctor({ issues: [issue({ file: '', target: null })] })
  assert.ok(none.includes('<div class="tail"></div>'))
})

test('an issue with no file shows only the kind as its source', () => {
  const html = doctor({ issues: [issue({ kind: 'mcp', file: null })] })
  assert.ok(html.includes('<span class="src">MCP server</span>'))
})

test('an issue of an unknown kind shows the raw kind, escaped', () => {
  const html = doctor({ issues: [issue({ kind: '<odd>', file: null })] })
  assert.ok(html.includes('<span class="src">&lt;odd&gt;</span>'))
})

test('the severity chip keeps only that severity and says when none match', () => {
  const issues = [issue({ id: 'a', severity: 'error' }), issue({ id: 'b' })]
  const errors = doctor({ issues }, {}, 'error')
  assert.ok(errors.includes('<h2>Errors'))
  assert.ok(!errors.includes('<h2>Warnings'))
  assert.ok(doctor({ issues }, {}, 'info').includes('No issues of this type.'))
})

test('a search that matches no issue shows the nothing-matches note', () => {
  const html = doctor({ issues: [issue()] }, { query: 'zzz' })
  assert.ok(html.includes('Nothing matches &quot;zzz&quot; in this scope.'))
})

test('the page note offers Check again', () => {
  assert.ok(doctor({ issues: [] }).includes('id="doc-again">Check again</button>'))
})
