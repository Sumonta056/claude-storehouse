import { test } from 'node:test'
import assert from 'node:assert/strict'
import { state } from '../../public/core/state.js'

const nodes = new Map()
globalThis.location ??= { search: '', href: 'http://localhost/', hash: '' }
globalThis.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '' })
    return nodes.get(id)
  },
  querySelector: () => null,
  querySelectorAll: () => []
}
const { openProject, renderProjects } = await import('../../public/pages/projects.js')
const { go } = await import('../../public/ui/nav.js')

const EVIL = '~/<script>x</script>'

function usage() {
  return {
    monthKey: '2026-10',
    byProject: {
      month: [
        {
          project: '~/acme',
          sessions: 2,
          tokens: 3000000,
          cost: 12.5,
          list: [
            {
              id: 'abcdef12-3456-7890',
              start: Date.UTC(2026, 9, 21, 9),
              end: Date.UTC(2026, 9, 21, 10, 30),
              responses: 7,
              tokens: 2000000,
              cost: 10,
              models: ['claude-opus-4-1']
            },
            {
              id: 'zz<img onerror=x>',
              start: Date.UTC(2026, 9, 20, 9),
              end: Date.UTC(2026, 9, 20, 9, 5),
              responses: 1,
              tokens: 1000000,
              cost: 2.5,
              models: []
            }
          ]
        },
        { project: EVIL, sessions: 0, tokens: 10, cost: 0.01, list: [] }
      ],
      all: []
    }
  }
}

function page(patch) {
  const fields = { usage: usage(), usageError: '', usagePeriod: 'month', query: '', projectSel: null, ...patch }
  const before = {}
  for (const k of Object.keys(fields)) before[k] = state[k]
  Object.assign(state, fields)
  try {
    renderProjects()
    return nodes.get('p-projects').innerHTML
  } finally {
    Object.assign(state, before)
  }
}

test('the list shows each project with sessions, tokens, cost, and an open button, escaped', () => {
  const html = page()
  assert.ok(html.includes('All projects <span class="pill">2</span>'))
  assert.ok(html.includes('data-proj="~/acme"'))
  assert.ok(html.includes('<td class="num">2</td>'))
  assert.ok(html.includes('<td class="num">3M</td>'))
  assert.ok(html.includes('<td class="num">$12.50</td>'))
  assert.ok(html.includes('~/&lt;script&gt;x&lt;/script&gt;'))
  assert.ok(!html.includes('<script>x'))
  assert.ok(html.includes('data-period="month" aria-pressed="true"'))
  assert.ok(html.includes('data-urefresh'))
})

test('the search box filters the list', () => {
  const html = page({ query: 'acm' })
  assert.ok(html.includes('data-proj="~/acme"'))
  assert.ok(!html.includes('&lt;script'))
  assert.ok(page({ query: 'nope' }).includes('No projects match "nope".'))
})

test('the detail view lists each session with length, models, and cost, and a Back button', () => {
  const html = page({ projectSel: '~/acme' })
  assert.ok(html.includes('data-proj=""'))
  assert.ok(html.includes('All projects</button>'))
  assert.ok(html.includes('Sessions <span class="pill">2</span>'))
  assert.ok(html.includes('title="abcdef12-3456-7890"><code>abcdef12</code>'))
  assert.ok(html.includes('<td class="num">1 h 30 min</td>'))
  assert.ok(html.includes('<td class="num">$10.00</td>'))
  assert.ok(html.includes('class="mtag"'))
  assert.ok(html.includes('zz&lt;img onerror=x&gt;'))
  assert.ok(!html.includes('<img onerror'))
  assert.ok(html.indexOf('abcdef12') < html.indexOf('zz&lt;img'))
})

test('the detail view says so when the project has no use in this period', () => {
  const html = page({ projectSel: '~/acme', usagePeriod: 'all' })
  assert.ok(html.includes('No use of this project in this period.'))
})

test('the page shows the escaped error and the loading text', () => {
  assert.ok(page({ usage: null, usageError: 'EACCES <x>' }).includes('EACCES &lt;x&gt;'))
  assert.ok(page({ usage: null }).includes('aria-busy="true"'))
})

test('openProject opens a project, an empty name goes back to the list, and leaving the page resets it', () => {
  const before = { page: state.page, projectSel: state.projectSel, inventory: state.inventory }
  const realHistory = globalThis.history
  const realWindow = globalThis.window
  globalThis.history = { replaceState() {} }
  globalThis.window = { scrollTo() {} }
  try {
    Object.assign(state, { page: 'projects', projectSel: null, inventory: null })
    openProject('~/acme')
    assert.equal(state.projectSel, '~/acme')
    openProject('')
    assert.equal(state.projectSel, null)
    Object.assign(state, { page: 'dash' })
    openProject('~/acme')
    assert.equal(state.page, 'projects')
    assert.equal(state.projectSel, '~/acme')
    go('skills')
    assert.equal(state.projectSel, null)
  } finally {
    Object.assign(state, before)
    globalThis.history = realHistory
    globalThis.window = realWindow
  }
})

test('a project row with no sessions shows an empty session table', () => {
  const u = usage()
  u.byProject.month[0].list = []
  const html = page({ usage: u, projectSel: '~/acme' })
  assert.ok(html.includes('Sessions <span class="pill">0</span>'))
  assert.ok(!html.includes('NaN') && !html.includes('Infinity'))
})
