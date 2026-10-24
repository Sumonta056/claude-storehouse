import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paletteResults, pushRecent, scoreMatch } from '../../public/logic/palette.js'

function item(name, over = {}) {
  return {
    key: `skill:${over.scope ?? 'global'}:${name}`,
    kind: 'skill',
    name,
    scope: 'global',
    description: '',
    ...over
  }
}

function sources(over = {}) {
  return { items: [], pages: [], actions: [], recent: [], ...over }
}

test('scoreMatch ranks a prefix, then a word start, then letters in order', () => {
  const prefix = scoreMatch('debugging', 'debu')
  const word = scoreMatch('fast-debugger', 'debu')
  const letters = scoreMatch('dead-bugs', 'debu')
  assert.ok(prefix > word, 'prefix above word start')
  assert.ok(word > letters, 'word start above letters in order')
  assert.ok(letters > 0, 'letters in order still match')
})

test('scoreMatch ignores case and returns 0 for no match or an empty query', () => {
  assert.equal(scoreMatch('Debugging', 'DEBU'), scoreMatch('debugging', 'debu'))
  assert.equal(scoreMatch('debugging', 'xyz'), 0)
  assert.equal(scoreMatch('debugging', 'ubed'), 0)
  assert.equal(scoreMatch('debugging', ''), 0)
  assert.equal(scoreMatch(undefined, 'a'), 0)
})

test('paletteResults ranks a name match above a description match', () => {
  const byDesc = item('reviewer', { description: 'debugging helper' })
  const byName = item('zz-debug')
  const out = paletteResults('debug', sources({ items: [byDesc, byName] }))
  assert.deepEqual(
    out.items.map((i) => i.name),
    ['zz-debug', 'reviewer']
  )
})

test('paletteResults matches the plugin name', () => {
  const owned = item('lint', { scope: 'plugin', plugin: 'toolkit@market' })
  const out = paletteResults('toolk', sources({ items: [owned, item('other')] }))
  assert.deepEqual(
    out.items.map((i) => i.name),
    ['lint']
  )
})

test('paletteResults puts the global copy first when two items have the same score', () => {
  const plugin = item('debugging', { scope: 'plugin', plugin: 'toolkit@market', key: 'p' })
  const project = item('debugging', { scope: 'project', key: 'j' })
  const global = item('debugging', { scope: 'global', key: 'g' })
  const out = paletteResults('debu', sources({ items: [plugin, project, global] }))
  assert.deepEqual(
    out.items.map((i) => i.key),
    ['g', 'j', 'p']
  )
})

test('paletteResults shows at most 8 items, 5 pages, and 3 actions', () => {
  const many = Array.from({ length: 12 }, (_, i) => item(`alpha${i}`))
  const pages = Array.from({ length: 9 }, (_, i) => ({ key: `p${i}`, title: `Alpha page ${i}` }))
  const actions = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, label: `Alpha action ${i}` }))
  const out = paletteResults('alpha', sources({ items: many, pages, actions }))
  assert.equal(out.items.length, 8)
  assert.equal(out.pages.length, 5)
  assert.equal(out.actions.length, 3)
})

test('paletteResults matches pages by title and actions by label', () => {
  const pages = [
    { key: 'dups', title: 'Duplicates' },
    { key: 'skills', title: 'Skills' }
  ]
  const actions = [
    { id: 'scope-global', label: 'Scope: Global' },
    { id: 'dups-needs', label: 'Show Duplicates conflicts' }
  ]
  const out = paletteResults('dup', sources({ pages, actions }))
  assert.deepEqual(
    out.pages.map((p) => p.key),
    ['dups']
  )
  assert.deepEqual(
    out.actions.map((a) => a.id),
    ['dups-needs']
  )
})

test('paletteResults with an empty query shows the recent items in order', () => {
  const a = item('a')
  const b = item('b')
  const c = item('c')
  const out = paletteResults('  ', sources({ items: [a, b, c], recent: [c.key, 'gone', a.key] }))
  assert.deepEqual(
    out.items.map((i) => i.name),
    ['c', 'a']
  )
})

test('pushRecent puts the key first, drops its old copy, and keeps 5', () => {
  assert.deepEqual(pushRecent(['a', 'b'], 'b'), ['b', 'a'])
  assert.deepEqual(pushRecent(['1', '2', '3', '4', '5'], '6'), ['6', '1', '2', '3', '4'])
})
