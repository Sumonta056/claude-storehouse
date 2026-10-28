import { monthName } from '../core/format.js'
import { PERIOD_KEY, state } from '../core/state.js'
import { render } from './nav.js'

export function setPeriod(period) {
  state.usagePeriod = period
  try {
    localStorage.setItem(PERIOD_KEY, period)
  } catch {}
  render()
}

export function periodLabel() {
  return state.usagePeriod === 'month' && state.usage ? monthName(state.usage.monthKey) : 'All time'
}

export function periodHtml() {
  const buttons = [
    ['month', 'This month'],
    ['all', 'All time']
  ]
    .map(
      ([k, text]) =>
        `<button type="button" data-period="${k}" aria-pressed="${k === state.usagePeriod ? 'true' : 'false'}">${text}</button>`
    )
    .join('')
  return `<div class="scope period" role="group" aria-label="Usage period">${buttons}</div>`
}

export function refreshHtml() {
  return `<button type="button" class="btn-link" data-urefresh${state.usageBusy ? ' disabled aria-busy="true"' : ''}>${state.usageBusy ? 'Refreshing…' : 'Refresh'}</button>`
}
