import { $ } from '../core/dom.js'

const bar = (cls) => `<span class="sk ${cls}"></span>`

const ROW = `<div class="sk-row">${bar('sk-l')}${bar('sk-line')}</div>`

export function usageSkeletonHtml() {
  return `<section class="usage is-loading" aria-busy="true" aria-label="Usage and cost">
      <span class="sr-only">Reading usage from ~/.claude/projects…</span>
      <div aria-hidden="true">${bar('sk-k')}${bar('sk-big')}${bar('sk-line')}${bar('sk-line sk-short')}</div>
      <div class="right" aria-hidden="true">${bar('sk-k')}${bar('sk-mon')}${bar('sk-bar')}${bar('sk-line sk-short')}</div>
    </section>
    <div class="utiles" aria-hidden="true">${`<div>${bar('sk-b')}${bar('sk-l')}</div>`.repeat(4)}</div>`
}

export function bootHtml(page) {
  const rows = (n) => ROW.repeat(n)
  const note = '<span class="sr-only">Loading your Claude Code setup…</span>'
  if (page !== 'dash') return `${note}<div aria-hidden="true">${rows(6)}</div>`
  return `${note}${usageSkeletonHtml()}
    <div class="stats" aria-hidden="true">${`<div class="stat sk-card">${bar('sk-l')}${bar('sk-n')}${bar('sk-l')}</div>`.repeat(5)}</div>
    <div class="two" aria-hidden="true"><div>${rows(3)}</div><div>${rows(3)}</div></div>`
}

export function showBoot(page) {
  $('p-boot').innerHTML = bootHtml(page)
}
