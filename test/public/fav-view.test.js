import { test } from 'node:test'
import assert from 'node:assert/strict'
import { favOpen, items, state } from '../../public/core/state.js'
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
const { renderFav } = await import('../../public/pages/fav.js')

function skill(name, over = {}) {
  return {
    kind: 'skill',
    name,
    source: 'local',
    scope: 'global',
    description: 'Does a thing',
    enabled: true,
    canToggle: true,
    favorite: true,
    path: `/h/.claude/skills/${name}/SKILL.md`,
    ...over
  }
}

function fav(name, category = null, over = {}) {
  return { kind: 'skill', id: `skill:local:${name}`, name, source: 'local', category, ...over }
}

function inventory(over = {}) {
  return {
    plugins: [{ id: 'tools@market', name: 'tools', enabled: true, skills: [], agents: [], hooks: [], mcp: [] }],
    skills: [],
    agents: [],
    hooks: [],
    mcp: [],
    favorites: [],
    favoriteCategories: [],
    ...over
  }
}

function render(inv, patch = {}) {
  const fields = {
    inventory: inv,
    page: 'fav',
    query: '',
    scope: 'all',
    usage: null,
    menuKey: null,
    favEditing: null,
    favRenameValue: '',
    favNewName: '',
    ...patch
  }
  const before = {}
  for (const k of [...Object.keys(fields), 'catalog']) before[k] = state[k]
  Object.assign(state, fields)
  try {
    state.catalog = normalize(inv)
    renderFav()
    return nodes.get('p-fav').innerHTML
  } finally {
    Object.assign(state, before)
    items.clear()
  }
}

function withFavOpen(key, value, fn) {
  favOpen.set(key, value)
  try {
    return fn()
  } finally {
    favOpen.delete(key)
  }
}

test('Favorites says how to start when there are no favorites and no categories', () => {
  const html = render(inventory())
  assert.ok(html.includes('No favorites yet. Click the star on any row and pick a category.'))
  assert.ok(html.includes('Favorites and categories live in <code>~/.claude/storehouse.json</code>.'))
})

test('a favorite whose item is gone shows Missing with a Remove button', () => {
  const html = render(inventory({ favorites: [fav('<gone>')] }))
  assert.ok(html.includes('<li class="lrow missing" data-fav="skill:local:&lt;gone&gt;" draggable="true">'))
  assert.ok(html.includes('aria-label="Missing"'))
  assert.ok(
    html.includes(
      '<span class="name">&lt;gone&gt;</span><span class="src">skill · local</span><span class="flag bad">Missing</span>'
    )
  )
  assert.ok(html.includes('<p class="desc">This skill is no longer on disk.</p>'))
  assert.ok(html.includes('data-act="unfav">Remove</button>'))
})

test('a favorite that is off stays in the list and shows the Off flag', () => {
  const html = render(inventory({ skills: [skill('a', { enabled: false })], favorites: [fav('a')] }))
  assert.ok(html.includes('data-key="skill:local:a" draggable="true"'))
  assert.ok(html.includes('<span class="flag">Off</span>'))
})

test('a plugin skill favorite says which plugin it comes from', () => {
  const inv = inventory({
    skills: [skill('x', { source: 'tools', scope: 'plugin', plugin: 'tools@market', canToggle: false })],
    favorites: [fav('x', null, { id: 'skill:tools:x', source: 'tools' })]
  })
  assert.ok(render(inv).includes('<span class="src">via plugin tools</span>'))
})

test('each category gets a section with a count, and rename and delete buttons', () => {
  const inv = inventory({
    skills: [skill('a'), skill('b')],
    favorites: [fav('a', 'Work'), fav('b')],
    favoriteCategories: ['Work']
  })
  const html = render(inv)
  assert.ok(html.includes('<section class="fav-sec" data-cat="Work" aria-label="Work">'))
  assert.match(
    html,
    /data-fc="collapse" data-cat="Work" aria-expanded="true" aria-controls="favsec-0">[\s\S]*?<span class="fav-name">Work<\/span><span class="pill">1<\/span>/
  )
  assert.ok(html.includes('data-fc="rename" data-cat="Work" aria-label="Rename category Work"'))
  assert.ok(html.includes('data-fc="delete" data-cat="Work" aria-label="Delete category Work"'))
  assert.ok(html.includes('<section class="fav-sec" data-cat="" aria-label="Uncategorized">'))
  assert.ok(
    html.includes('class="fav-tog uncat" data-fc="collapse" data-cat="" aria-expanded="true" aria-controls="favsec-1"')
  )
  assert.ok(!html.includes('aria-label="Rename category Uncategorized"'))
})

test('an empty category invites a drag or a star pick', () => {
  const html = render(inventory({ favoriteCategories: ['<Work>'] }))
  assert.ok(html.includes('No favorites here. Drag a row here, or pick &lt;Work&gt; from a star.'))
  assert.ok(html.includes('aria-label="Rename category &lt;Work&gt;"'))
  assert.ok(!html.includes('<Work>'))
})

test('a collapsed category hides its body', () => {
  const inv = inventory({ skills: [skill('a')], favorites: [fav('a', 'Work')], favoriteCategories: ['Work'] })
  const html = withFavOpen('Work', false, () => render(inv))
  assert.match(html, /data-cat="Work" aria-expanded="false" aria-controls="favsec-0"/)
  assert.ok(html.includes('<div id="favsec-0" hidden>'))
})

test('a category in rename mode shows a form with the escaped draft name', () => {
  const html = render(inventory({ favoriteCategories: ['Work'] }), { favEditing: 'Work', favRenameValue: 'W "x"' })
  assert.ok(html.includes('<form class="fav-edit" data-form="cat-rename" data-cat="Work">'))
  assert.ok(html.includes('value="W &quot;x&quot;"'))
  assert.ok(html.includes('aria-label="New name for Work"'))
  assert.ok(html.includes('data-fc="cancel">Cancel</button>'))
  assert.ok(!html.includes('data-fc="rename"'))
})

test('the new-category input keeps the escaped draft name', () => {
  const html = render(inventory(), { favNewName: '<new>' })
  assert.ok(html.includes('id="fav-newcat" name="n" value="&lt;new&gt;"'))
})

test('a search shows only sections with a match', () => {
  const inv = inventory({
    skills: [skill('alpha'), skill('beta')],
    favorites: [fav('alpha', 'Work'), fav('beta')],
    favoriteCategories: ['Work', 'Empty']
  })
  const html = render(inv, { query: 'alpha' })
  assert.ok(html.includes('aria-label="Work"'))
  assert.ok(!html.includes('aria-label="Empty"'))
  assert.ok(!html.includes('aria-label="Uncategorized"'))
})

test('a search matches a missing favorite by name', () => {
  const html = render(inventory({ favorites: [fav('ghost')] }), { query: 'ghost' })
  assert.ok(html.includes('<span class="flag bad">Missing</span>'))
})

test('a search with no match shows the nothing-matches note', () => {
  const html = render(inventory({ skills: [skill('a')], favorites: [fav('a')] }), { query: 'zzz' })
  assert.ok(html.includes('Nothing matches &quot;zzz&quot; in this scope.'))
})
