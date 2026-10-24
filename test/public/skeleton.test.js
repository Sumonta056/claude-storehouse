import { test } from 'node:test'
import assert from 'node:assert/strict'

const nodes = new Map()
globalThis.location ??= { search: '', href: 'http://localhost/', hash: '' }
globalThis.document = {
  getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '' })
    return nodes.get(id)
  }
}
const { bootHtml, showBoot, usageSkeletonHtml } = await import('../../public/ui/skeleton.js')

test('the Dashboard boot skeleton has the usage band, 5 type cards, and 2 columns of rows', () => {
  const html = bootHtml('dash')
  assert.ok(html.includes(usageSkeletonHtml()))
  assert.equal(html.match(/class="stat sk-card"/g).length, 5)
  assert.ok(html.includes('class="two" aria-hidden="true"'))
  assert.equal(html.match(/class="sk-row"/g).length, 6)
})

test('every boot skeleton tells screen readers that the setup is loading', () => {
  for (const page of ['dash', 'skills'])
    assert.ok(bootHtml(page).includes('<span class="sr-only">Loading your Claude Code setup…</span>'))
})

test('other pages get a plain row skeleton without the usage band', () => {
  const html = bootHtml('skills')
  assert.equal(html.match(/class="sk-row"/g).length, 6)
  assert.ok(!html.includes('usage'))
})

test('the usage skeleton is busy for screen readers and hides its shapes', () => {
  const html = usageSkeletonHtml()
  assert.ok(html.includes('aria-busy="true"'))
  assert.ok(html.includes('<span class="sr-only">Reading usage from ~/.claude/projects…</span>'))
  assert.equal(html.match(/aria-hidden="true"/g).length, 3)
})

test('showBoot writes the skeleton for the page into #p-boot', () => {
  showBoot('dash')
  assert.ok(nodes.get('p-boot').innerHTML.includes('class="stat sk-card"'))
  showBoot('mcp')
  assert.ok(nodes.get('p-boot').innerHTML.includes('class="sk-row"'))
  assert.ok(!nodes.get('p-boot').innerHTML.includes('sk-card'))
})
