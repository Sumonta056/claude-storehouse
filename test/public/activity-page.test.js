import { test } from 'node:test'
import assert from 'node:assert/strict'

const els = new Map()
let reply = null

function el(id) {
  if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '' })
  return els.get(id)
}

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = { getElementById: el, activeElement: null, querySelector: () => null, querySelectorAll: () => [] }
globalThis.fetch = async (url) => {
  assert.equal(url, '/api/activity')
  return { ok: reply.ok, status: reply.status, json: async () => reply.body }
}

const { loadActivity } = await import('../../public/pages/activity.js')
const { state } = await import('../../public/core/state.js')

async function show(entries, { ok = true, status = 200, body } = {}) {
  const saved = state.inventory
  els.clear()
  reply = { ok, status, body: body ?? { entries } }
  try {
    state.inventory = { global: { dir: '/h/.claude' } }
    await loadActivity()
    return { list: el('act').innerHTML, count: el('n-activity').textContent }
  } finally {
    state.inventory = saved
    reply = null
  }
}

function entry(over = {}) {
  return {
    id: 'e1',
    kind: 'toggle',
    message: 'Switched off skill review',
    file: '/h/.claude/settings.json',
    time: new Date(Date.now() - 5 * 60000).toISOString(),
    canUndo: true,
    ...over
  }
}

test('Activity with no entries says No changes yet and clears the nav count', async () => {
  const { list, count } = await show([])
  assert.match(list, /<b>No changes yet<\/b><span>Switches, saves, and stars show here\. You can undo them\.<\/span>/)
  assert.equal(count, '')
})

test('the nav count is the number of entries', async () => {
  const { count } = await show([entry(), entry({ id: 'e2' })])
  assert.equal(count, '2')
})

test('an Activity row shows what changed, the file name, and how long ago', async () => {
  const { list } = await show([entry()])
  assert.match(list, /<li class="act-row k-toggle" data-entry="e1">/)
  assert.match(list, /<b>Switched off skill review<\/b>/)
  assert.match(list, /<code title="~\/.claude\/settings.json">settings.json<\/code>/)
  assert.match(list, /<time datetime="[^"]+" title="[^"]+">5 min ago<\/time>/)
})

test('an entry that can be undone has an Undo button that names the change', async () => {
  const { list } = await show([entry()])
  assert.match(
    list,
    /<button type="button" class="act-undo" data-undo="e1" title="Undo" aria-label="Undo: Switched off skill review">/
  )
})

test('an entry that cannot be undone has no Undo button', async () => {
  const { list } = await show([entry({ canUndo: false })])
  assert.doesNotMatch(list, /act-undo/)
})

test('an undo entry gets the undo icon class whatever its kind', async () => {
  const { list } = await show([entry({ message: 'Undid: Switched off skill review', kind: 'toggle' })])
  assert.match(list, /class="act-row k-undo"/)
})

test('favorite and save entries keep their kind and an unknown kind shows as save', async () => {
  const { list } = await show([
    entry({ id: 'a', kind: 'favorite' }),
    entry({ id: 'b', kind: 'save' }),
    entry({ id: 'c', kind: 'weird' })
  ])
  assert.match(list, /class="act-row k-favorite" data-entry="a"/)
  assert.match(list, /class="act-row k-save" data-entry="b"/)
  assert.match(list, /class="act-row k-save" data-entry="c"/)
})

test('every icon is hidden from screen readers', async () => {
  const { list } = await show([entry()])
  const svgs = list.match(/<svg[^>]*>/g)
  assert.equal(svgs.length, 2)
  for (const svg of svgs) assert.match(svg, /aria-hidden="true"/)
})

test('an entry message and file are HTML-escaped', async () => {
  const { list } = await show([entry({ id: 'x"y', message: 'Saved <b>evil</b>', file: '/h/.claude/agents/<a>.md' })])
  assert.match(list, /data-entry="x&quot;y"/)
  assert.match(list, /<b>Saved &lt;b&gt;evil&lt;\/b&gt;<\/b>/)
  assert.match(list, /aria-label="Undo: Saved &lt;b&gt;evil&lt;\/b&gt;"/)
  assert.match(list, /<code title="~\/.claude\/agents\/&lt;a&gt;.md">&lt;a&gt;.md<\/code>/)
})

test('an entry with a bad time or no file still renders with empty fields', async () => {
  const { list } = await show([entry({ time: 'not a time', file: undefined })])
  assert.match(list, /<code title=""><\/code><time datetime="not a time" title=""><\/time>/)
})

test('a failed load shows the escaped error in the list', async () => {
  const { list } = await show([], { ok: false, status: 500, body: { error: 'disk <full>' } })
  assert.equal(list, '<li class="sub">Could not load activity: disk &lt;full&gt;</li>')
})
