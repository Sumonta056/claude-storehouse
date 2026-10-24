import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.location = { search: '', href: 'http://localhost/' }
globalThis.document = {
  getElementById: () => null,
  activeElement: null,
  querySelector: () => null,
  querySelectorAll: () => []
}

const { IS_MAC, closePalette, onPaletteKey, paletteFootHtml, paletteListHtml, wirePalette } =
  await import('../../public/ui/palette.js')
const { dr, state } = await import('../../public/core/state.js')

function fakeDom({ drawer = false } = {}) {
  const dom = { drawer, active: null, handlers: new Map(), saved: new Map() }
  const els = new Map()
  const make = (id) => ({
    id,
    hidden: id === 'pal',
    inert: id === 'dr' ? !drawer : false,
    value: '',
    textContent: '',
    innerHTML: '',
    attrs: {},
    classList: {
      contains: (c) => id === 'dr' && c === 'open' && dom.drawer,
      add() {},
      remove() {},
      toggle() {}
    },
    setAttribute(k, v) {
      this.attrs[k] = v
    },
    focus() {
      dom.active = this
    },
    addEventListener(type, fn) {
      dom.handlers.set(`${id}:${type}`, fn)
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null
  })
  const get = (id) => {
    if (!els.has(id)) els.set(id, make(id))
    return els.get(id)
  }
  const app = make('app')
  app.inert = drawer
  globalThis.document = {
    getElementById: get,
    querySelector: (s) => (s === '.app' ? app : null),
    querySelectorAll: () => [],
    contains: () => true,
    get activeElement() {
      return dom.active
    }
  }
  globalThis.localStorage = {
    getItem: (k) => dom.saved.get(k) ?? null,
    setItem: (k, v) => dom.saved.set(k, v),
    removeItem: (k) => dom.saved.delete(k)
  }
  return { get, app, dom }
}

function press(code, key, mods = {}) {
  const mod = mods.mod ? (IS_MAC ? { metaKey: true } : { ctrlKey: true }) : {}
  return {
    code,
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    repeat: false,
    ...mod,
    ...mods,
    prevented: false,
    preventDefault() {
      this.prevented = true
    }
  }
}

async function withPalette(opts, fn) {
  const before = { inventory: state.inventory, key: state.paletteKey }
  const drBefore = { editable: dr.editable, loaded: dr.loaded }
  state.inventory = { favorites: [], plugins: [], project: null }
  state.paletteKey = 'mod+p'
  const page = fakeDom(opts)
  try {
    await fn(page)
  } finally {
    closePalette(false)
    state.inventory = before.inventory
    state.paletteKey = before.key
    Object.assign(dr, drBefore)
  }
}

function skill(over = {}) {
  return {
    key: 'skill:global:debugging',
    kind: 'skill',
    name: 'debugging',
    source: 'global',
    scope: 'global',
    enabled: true,
    canToggle: true,
    ...over
  }
}

function withInventory(fn) {
  const before = state.inventory
  state.inventory = { favorites: [], plugins: [{ id: 'toolkit@market', name: 'toolkit' }] }
  try {
    return fn()
  } finally {
    state.inventory = before
  }
}

const none = { items: [], pages: [], actions: [] }

test('paletteListHtml escapes item names', () =>
  withInventory(() => {
    const html = paletteListHtml({ ...none, items: [skill({ name: '<img src=x onerror=alert(1)>' })] }, 0)
    assert.ok(!html.includes('<img src=x'))
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  }))

test('paletteListHtml marks the selected option for aria-activedescendant', () =>
  withInventory(() => {
    const results = {
      items: [skill(), skill({ key: 'k2', name: 'docs' })],
      pages: [{ key: 'dups', title: 'Duplicates' }],
      actions: []
    }
    const html = paletteListHtml(results, 2)
    assert.match(html, /id="pal-opt-2"[^>]*aria-selected="true"/)
    assert.match(html, /id="pal-opt-0"[^>]*aria-selected="false"/)
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1)
    assert.match(html, /Duplicates/)
  }))

test('paletteListHtml shows the group names and the item kind, scope, and state', () =>
  withInventory(() => {
    const html = paletteListHtml(
      {
        items: [skill({ enabled: false })],
        pages: [{ key: 'dups', title: 'Duplicates' }],
        actions: [{ id: 'scope-global', label: 'Scope: Global' }]
      },
      0
    )
    assert.match(html, />Items</)
    assert.match(html, />Pages</)
    assert.match(html, />Actions</)
    assert.match(html, /Skill · global/)
    assert.match(html, />off</)
  }))

test('paletteListHtml says "via plugin X" on a row without a switch', () =>
  withInventory(() => {
    const owned = skill({ scope: 'plugin', source: 'toolkit', plugin: 'toolkit@market', canToggle: false })
    const html = paletteListHtml({ ...none, items: [owned] }, 0)
    assert.match(html, /via plugin toolkit/)
  }))

test('paletteListHtml shows a star on a favorite item', () => {
  const before = state.inventory
  state.inventory = { favorites: [{ id: 'skill:global:debugging' }], plugins: [] }
  try {
    const html = paletteListHtml({ ...none, items: [skill()] }, 0)
    assert.match(html, /aria-label="favorite"/)
  } finally {
    state.inventory = before
  }
})

test('paletteListHtml says when nothing matches', () => {
  assert.match(paletteListHtml(none, 0), /No match/)
})

test('paletteFootHtml shows the shortcut and the Change and Reset buttons', () => {
  const mac = paletteFootHtml('mod+shift+k', true, false)
  assert.match(mac, /⌘⇧K/)
  assert.match(mac, /data-pal="change"/)
  assert.match(mac, /data-pal="reset"/)
  assert.match(paletteFootHtml('mod+p', false, false), /Ctrl\+P/)
})

test('paletteFootHtml disables Reset when the shortcut is the default', () => {
  assert.match(paletteFootHtml('mod+p', true, false), /data-pal="reset" disabled/)
  assert.doesNotMatch(paletteFootHtml('mod+shift+k', true, false), /data-pal="reset" disabled/)
})

test('paletteFootHtml asks for the new key while it records', () => {
  const html = paletteFootHtml('mod+p', true, true)
  assert.match(html, /Press the new shortcut/)
  assert.match(html, /Esc cancels/)
})

test('the palette key opens the palette over an inert page, and Esc gives the page back', () =>
  withPalette({}, ({ get, app }) => {
    const open = press('KeyP', 'p', { mod: true })
    assert.equal(onPaletteKey(open), true)
    assert.equal(open.prevented, true)
    assert.equal(get('pal').hidden, false)
    assert.equal(app.inert, true)
    assert.equal(get('dr').inert, true)
    onPaletteKey(press('Escape', 'Escape'))
    assert.equal(get('pal').hidden, true)
    assert.equal(app.inert, false)
    assert.equal(get('dr').inert, true)
  }))

test('closing the palette after the drawer closed under it leaves the page usable', () =>
  withPalette({ drawer: true }, ({ get, app, dom }) => {
    onPaletteKey(press('KeyP', 'p', { mod: true }))
    dom.drawer = false
    app.inert = false
    get('dr').inert = true
    onPaletteKey(press('Escape', 'Escape'))
    assert.equal(app.inert, false)
    assert.equal(get('dr').inert, true)
  }))

test('closing the palette over an open drawer keeps the drawer usable', () =>
  withPalette({ drawer: true }, ({ get, app }) => {
    onPaletteKey(press('KeyP', 'p', { mod: true }))
    onPaletteKey(press('Escape', 'Escape'))
    assert.equal(app.inert, true)
    assert.equal(get('dr').inert, false)
  }))

test('the palette key does nothing while the drawer has unsaved edits, wherever the focus is', () =>
  withPalette({ drawer: true }, ({ get }) => {
    dr.editable = true
    dr.loaded = 'old'
    get('dr-txt').value = 'new'
    get('dr-close').focus()
    const e = press('KeyP', 'p', { mod: true })
    assert.equal(onPaletteKey(e), true)
    assert.equal(e.prevented, true)
    assert.equal(get('pal').hidden, true)
    assert.match(get('toast').textContent, /unsaved/)
  }))

test('the palette ignores Enter and the palette key during IME composition', () =>
  withPalette({}, ({ get }) => {
    assert.equal(onPaletteKey(press('KeyP', 'p', { mod: true, isComposing: true })), false)
    assert.equal(get('pal').hidden, true)
    onPaletteKey(press('KeyP', 'p', { mod: true }))
    const enter = press('Enter', 'Enter', { isComposing: true })
    onPaletteKey(enter)
    assert.equal(enter.prevented, false)
    assert.equal(get('pal').hidden, false)
  }))

function startRecord(page) {
  wirePalette()
  onPaletteKey(press('KeyP', 'p', { mod: true }))
  page.dom.handlers.get('pal-ft:click')({ target: { closest: () => ({ dataset: { pal: 'change' } }) } })
}

test('Change records a new key, saves it, and shows it on the header button', () =>
  withPalette({}, (page) => {
    startRecord(page)
    onPaletteKey(press('KeyK', 'K', { mod: true, shiftKey: true }))
    assert.equal(state.paletteKey, 'mod+shift+k')
    assert.equal(page.dom.saved.get('storehouse.paletteKey'), 'mod+shift+k')
    assert.match(page.get('pal-key').textContent, /K$/)
    assert.match(page.get('pal-msg').textContent, /now opens with/)
  }))

test('Reset removes the saved key and brings back mod+p', () =>
  withPalette({}, (page) => {
    startRecord(page)
    onPaletteKey(press('KeyK', 'k', { mod: true, shiftKey: true }))
    page.dom.handlers.get('pal-ft:click')({ target: { closest: () => ({ dataset: { pal: 'reset' } }) } })
    assert.equal(state.paletteKey, 'mod+p')
    assert.equal(page.dom.saved.has('storehouse.paletteKey'), false)
  }))

test('Change refuses copy, paste, and other editing keys', () =>
  withPalette({}, (page) => {
    startRecord(page)
    for (const [code, key] of [
      ['KeyC', 'c'],
      ['KeyV', 'v'],
      ['KeyB', 'b'],
      ['Digit1', '1']
    ]) {
      onPaletteKey(press(code, key, { mod: true }))
      assert.equal(state.paletteKey, 'mod+p', key)
      assert.match(page.get('pal-msg').textContent, /already/, key)
    }
  }))

test('Change waits through modifier-only keys, AltGr, and the OS key without an error', () =>
  withPalette({}, (page) => {
    startRecord(page)
    for (const [code, key] of [
      ['OSLeft', 'OS'],
      ['AltRight', 'AltGraph'],
      ['MetaLeft', 'Meta'],
      ['CapsLock', 'CapsLock']
    ]) {
      assert.doesNotThrow(() => onPaletteKey(press(code, key, { altKey: key === 'AltGraph' })), key)
      assert.equal(state.paletteKey, 'mod+p', key)
    }
    onPaletteKey(press('KeyJ', 'j', { mod: true, altKey: true }))
    assert.equal(state.paletteKey, 'mod+alt+j')
  }))
