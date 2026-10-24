import { test } from 'node:test'
import assert from 'node:assert/strict'

const els = new Map()
const fetched = []

function el(id) {
  if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '' })
  return els.get(id)
}

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = { getElementById: el, activeElement: null, querySelector: () => null, querySelectorAll: () => [] }
globalThis.fetch = async (url) => {
  fetched.push(url)
  throw new Error('no network in tests')
}

const { renderClaudeMd } = await import('../../public/pages/claudemd.js')
const { cmd } = await import('../../public/logic/config.js')
const { bks, eds, msgs, state } = await import('../../public/core/state.js')

const PATHS = {
  mg: '/h/.claude/CLAUDE.md',
  mp: '/p/CLAUDE.md',
  mc: '/p/.claude/CLAUDE.md',
  ml: '/p/CLAUDE.local.md'
}

function info(k, size) {
  return size === undefined ? { path: PATHS[k], exists: false } : { path: PATHS[k], exists: true, size }
}

function inventory({ mg, mp, mc, ml, projectDir = '/p' } = {}) {
  return {
    global: { dir: '/h/.claude' },
    project: projectDir ? { dir: projectDir } : null,
    settings: {},
    claudeMd: {
      global: info('mg', mg),
      project: info('mp', mp),
      projectClaudeDir: info('mc', mc),
      projectLocal: info('ml', ml)
    }
  }
}

function editor(k, text, over = {}) {
  return {
    path: PATHS[k],
    status: 'ready',
    text,
    loaded: text,
    editing: false,
    preview: false,
    stale: false,
    fetching: false,
    ...over
  }
}

function page(inv, { sel = 'mg', editors = {}, messages = {}, backups = {} } = {}) {
  const saved = state.inventory
  const savedSel = cmd.sel
  els.clear()
  fetched.length = 0
  try {
    state.inventory = inv
    cmd.sel = sel
    Object.assign(eds, editors)
    Object.assign(msgs, messages)
    Object.assign(bks, backups)
    renderClaudeMd()
    return el('p-claudemd').innerHTML
  } finally {
    state.inventory = saved
    cmd.sel = savedSel
    for (const store of [eds, msgs, bks]) for (const k of Object.keys(store)) delete store[k]
  }
}

test('the CLAUDE.md list numbers the files that exist in read order', () => {
  const html = page(inventory({ mg: 10, mc: 20 }), {
    editors: { mg: editor('mg', 'a\nb\n'), mc: editor('mc', 'x') }
  })
  const labels = [...html.matchAll(/<span class="cm-label">([^<]+)</g)].map((m) => m[1])
  assert.deepEqual(labels, ['Global', 'Project', 'Project .claude folder', 'Project local'])
  const nums = [...html.matchAll(/<span class="cm-num" aria-hidden="true">([^<]+)</g)].map((m) => m[1])
  assert.deepEqual(nums, ['1', '–', '2', '–'])
  assert.match(html, /<span class="sr">Read 1st\. <\/span>/)
  assert.match(html, /<span class="sr">Read 2nd\. <\/span>/)
  assert.deepEqual(fetched, [])
})

test('the list meta shows lines for a loaded file and where it applies', () => {
  const html = page(inventory({ mg: 10, mp: 2048 }), {
    editors: { mg: editor('mg', 'a\nb\nc\n'), mp: editor('mp', '', { status: 'loading' }) }
  })
  assert.match(html, /<span class="cm-meta">3 lines · every project<\/span>/)
  assert.match(html, /<span class="cm-meta">2\.0 KB · this folder · in git<\/span>/)
})

test('a missing CLAUDE.md shows Not found and a Create button', () => {
  const html = page(inventory({ mg: 1 }), { editors: { mg: editor('mg', 'x') } })
  assert.match(html, /<span class="cm-meta">Not found · git-ignored<\/span>/)
  assert.match(
    html,
    /id="cm-create-mp" data-c="create" data-k="mp" data-v="default" aria-label="Create .\/CLAUDE.md">Create</
  )
})

test('the panel of a missing file offers template and empty create buttons', () => {
  const html = page(inventory({}), { sel: 'mp' })
  assert.match(html, /No .\/CLAUDE.md yet\./)
  assert.match(html, /id="mp-ct" data-c="create" data-k="mp" data-v="default">Create from template</)
  assert.match(html, /id="mp-ce" data-c="create" data-k="mp" data-v="empty">Create empty</)
})

test('without a project folder only Global shows, with the project-off note', () => {
  const html = page(inventory({ mg: 1, projectDir: null }), { editors: { mg: editor('mg', 'x') } })
  assert.match(html, /id="cm-pick-mg"/)
  assert.doesNotMatch(html, /id="cm-pick-mp"/)
  assert.match(html, /<div class="warn" role="note">/)
})

test('the selected file shows its preview with Preview and Edit tabs', () => {
  const html = page(inventory({ mg: 1 }), { editors: { mg: editor('mg', '# Rules\n\nBe <careful>.\n') } })
  assert.match(html, /id="cm-pick-mg" data-c="pick" data-k="mg" aria-current="true"/)
  assert.match(html, /role="tab" id="mg-pv" data-c="preview" data-k="mg" aria-selected="true"/)
  assert.match(html, /role="tab" id="mg-edit" data-c="edit" data-k="mg" aria-selected="false"/)
  assert.match(html, /<div class="cm-pane md" id="mg-pane" role="tabpanel" aria-labelledby="mg-pv" tabindex="0">/)
  assert.match(html, /Rules/)
  assert.match(html, /Be &lt;careful&gt;\./)
  assert.doesNotMatch(html, /<careful>/)
})

test('the edit view shows the escaped text in a labelled textarea', () => {
  const html = page(inventory({ mg: 1 }), { editors: { mg: editor('mg', 'a </textarea> b', { editing: true }) } })
  assert.match(html, /aria-selected="true" aria-controls="mg-pane">Edit</)
  assert.match(
    html,
    /<textarea id="mg-txt" class="ed" data-ed="mg" spellcheck="false" aria-label="~\/.claude\/CLAUDE.md contents">\na &lt;\/textarea&gt; b<\/textarea>/
  )
})

test('a clean file has Save disabled, Discard hidden, and shows its line count', () => {
  const html = page(inventory({ mg: 1 }), { editors: { mg: editor('mg', 'a\nb') } })
  assert.match(html, /id="mg-dirty" aria-live="polite">2 lines · Saved</)
  assert.match(html, /id="mg-save" data-c="save" data-k="mg" disabled>Save</)
  assert.match(html, /id="mg-cancel" data-c="cancel" data-k="mg" hidden>Discard</)
  assert.match(html, /id="mg-del" data-c="delete" data-k="mg">Delete…</)
  assert.match(html, /id="mg-bk" data-c="backups" data-k="mg" aria-expanded="false" aria-controls="mg-bkbox">Backups</)
})

test('an edited file shows Unsaved changes, a dot in the list, and enables Save and Discard', () => {
  const html = page(inventory({ mg: 1 }), {
    editors: { mg: editor('mg', 'new', { loaded: 'old', editing: true }) }
  })
  assert.match(html, /<span class="cm-state is-dirty" id="mg-dirty" aria-live="polite">● Unsaved changes</)
  assert.match(html, /id="mg-save" data-c="save" data-k="mg">Save</)
  assert.match(html, /id="mg-cancel" data-c="cancel" data-k="mg">Discard</)
  assert.match(html, /id="cm-dot-mg">● unsaved</)
})

test('a file that is still loading shows Loading and no tabs', () => {
  const html = page(inventory({ mg: 1 }), { editors: { mg: editor('mg', '', { status: 'loading' }) } })
  assert.match(html, /<p class="note">Loading…<\/p>/)
  assert.doesNotMatch(html, /id="mg-pv"/)
  assert.deepEqual(fetched, [])
})

test('a file that could not be read shows the escaped error', () => {
  const html = page(inventory({ mg: 1 }), {
    editors: { mg: editor('mg', '', { status: 'error', error: 'EACCES <x>' }) }
  })
  assert.match(html, /Could not read ~\/.claude\/CLAUDE.md: EACCES &lt;x&gt;/)
})

test('a save error shows in the alert of the panel', () => {
  const html = page(inventory({ mg: 1 }), {
    editors: { mg: editor('mg', 'x') },
    messages: { mg: 'Could not save <it>' }
  })
  assert.match(html, /<p class="form-err" id="mg-err" role="alert">Could not save &lt;it&gt;<\/p>/)
})

test('open backups list each backup with a Restore button for the panel', () => {
  const html = page(inventory({ mg: 1 }), {
    editors: { mg: editor('mg', 'x') },
    backups: {
      mg: { open: true, loading: false, list: [{ path: '/h/.claude/backups/storehouse/CLAUDE.md.1' }], error: '' }
    }
  })
  assert.match(html, /aria-expanded="true" aria-controls="mg-bkbox">Backups</)
  assert.match(
    html,
    /id="mg-rs-0" data-c="restore" data-k="mg" data-path="\/h\/.claude\/backups\/storehouse\/CLAUDE.md.1">Restore</
  )
})

test('the git-ignored file shows its pill in the panel title', () => {
  const html = page(inventory({ mg: 1, ml: 1 }), {
    sel: 'ml',
    editors: { mg: editor('mg', 'x'), ml: editor('ml', 'y') }
  })
  assert.match(
    html,
    /<h2 id="ml-h">Project local<span class="pill">git-ignored<\/span><\/h2><code class="cm-path">\/p\/CLAUDE.local.md<\/code>/
  )
})
