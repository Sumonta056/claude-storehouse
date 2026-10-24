import { send } from '../api.js'
import { render } from '../app.js'
import { afterWrite, busy } from '../core/actions.js'
import { $, showBanner, toast } from '../core/dom.js'
import { esc, opt, plural, slug, tilde } from '../core/format.js'
import { ICON } from '../core/icons.js'
import { cfg, chipFilter, freshHookForm, groupOpen, state } from '../core/state.js'
import { SETTINGS_FILE, projectOn, visible } from '../logic/catalog.js'
import { keepChip } from '../logic/chips.js'
import { HOOK_EVENTS, HOOK_INFO, hookLabel, hookRunsFor } from '../logic/hooks.js'
import { chipsHtml } from '../ui/chips.js'
import { addButton, cellSwitch, empty, invalidAttr, nothingMatches, pageBar, scopeTag, viaPlugin } from '../ui/rows.js'

function hookSource(h) {
  if (h.plugin) return viaPlugin(h)
  const file = h.parked ? '~/.claude/storehouse.json' : (SETTINGS_FILE[h.file] ?? h.file)
  return `<span class="tags">${scopeTag(h.scope)}${h.parked ? '<span class="tag">parked</span>' : ''}<span class="src">${esc(file)}</span></span>`
}

function hookRowHtml(h) {
  const what = hookLabel(h)
  const label = `${h.event} hook ${what}`
  const runs = hookRunsFor(h)
  const off = h.canToggle && !h.enabled
  const del = h.plugin
    ? ''
    : `<button type="button" class="btn danger ghost" data-act="del" aria-label="${esc(`Delete ${label}`)}">Delete</button>`
  const cls = ['lrow', 'hrow', off ? 'off' : '', h.plugin ? 'locked' : ''].filter(Boolean).join(' ')
  return `<li class="${cls}" data-key="${esc(h.key)}">
    <div class="lead">${cellSwitch(h, label)}</div>
    <div class="body">
      <div class="l1"><button type="button" class="name btn-plain" data-act="open" aria-label="${esc(`Show ${label}`)}">${esc(what)}</button>${runs ? `<span class="mchip">${esc(runs)}</span>` : ''}${off ? '<span class="flag">Off</span>' : ''}</div>
      <div class="meta-row">${hookSource(h)}${h.timeout ? `<span class="src">${esc(`${h.timeout}s timeout`)}</span>` : ''}</div>
      ${h.command ? `<details class="cmd-box"><summary>Show command</summary><pre>${esc(h.command)}</pre></details>` : ''}
    </div>
    <div class="tail">${del}</div>
  </li>`
}

function hookGroupsHtml(list) {
  const byEvent = new Map(HOOK_INFO.map(([e]) => [e, []]))
  for (const h of list) {
    if (!byEvent.has(h.event)) byEvent.set(h.event, [])
    byEvent.get(h.event).push(h)
  }
  const info = new Map(HOOK_INFO)
  const body = [...byEvent]
    .filter(([, rows]) => rows.length)
    .map(([event, rows]) => {
      const gk = `hook:${event}`
      const open = groupOpen.get(gk) ?? true
      const panel = `gp-hook-${slug(event)}`
      return `<div class="pgroup">
        <h3 class="ghead"><button type="button" class="gbtn" id="gb-hook-${slug(event)}" data-group="${esc(gk)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panel}">${ICON.chev}<span class="gname">${esc(event)}</span><span class="gdesc">${esc(info.get(event) ?? 'Claude Code event.')}</span><span class="gcount">${esc(plural(rows.length, 'hook'))}</span></button></h3>
        <div class="gbody" id="${panel}"${open ? '' : ' hidden'}>${open ? `<ul class="rows">${rows.map(hookRowHtml).join('')}</ul>` : ''}</div>
      </div>`
    })
    .join('')
  return `<div class="groups ev-groups">${body}</div>`
}

export function renderHooks() {
  const list = state.catalog.hook.filter((h) => visible(h) && keepChip('hooks', h))
  const body = !state.catalog.hook.length
    ? empty('No hooks in ~/.claude/settings.json, .claude/settings.json, .claude/settings.local.json, or plugins.')
    : list.length
      ? hookGroupsHtml(list)
      : chipFilter.hooks !== 'all' && state.catalog.hook.some(visible)
        ? empty('No hooks match this filter.')
        : nothingMatches()
  const bar = pageBar(
    'A hook runs a command when an event happens in Claude Code. Hooks are grouped by event, in the order the events happen in a session. Off moves your hook into <code>~/.claude/storehouse.json</code>. Plugin hooks follow their plugin.',
    `<button type="button" class="btn" data-go="settings">Edit settings files</button>${addButton('hook', 'Add hook')}`
  )
  $('p-hooks').innerHTML = `${bar}${hookFormHtml()}${chipsHtml('hooks', state.catalog.hook, '')}${body}`
}

function hookFormHtml() {
  const f = cfg.hook
  if (!f.open) return ''
  return `<form class="form" id="hook-form" novalidate aria-labelledby="hf-title">
    <div class="form-head"><h3 id="hf-title">Add hook</h3><p class="note">Writes the hook into the settings file you pick. A backup is made first.</p></div>
    <label for="hf-scope">Scope</label>
    <select id="hf-scope" data-f="hook.scope">${opt('global', 'Global · ~/.claude/settings.json', f.scope)}${projectOn() ? opt('project', 'Project · .claude/settings.json', f.scope) : ''}</select>
    <label for="hf-event">Event</label>
    <select id="hf-event" data-f="hook.event">${HOOK_EVENTS.map((e) => opt(e, e, f.event)).join('')}</select>
    <label for="hf-matcher">Matcher</label>
    <input id="hf-matcher" data-f="hook.matcher" value="${esc(f.matcher)}" placeholder="* or Bash or Edit|Write" autocomplete="off" spellcheck="false">
    <label for="hf-command">Command (required)</label>
    <input id="hf-command" data-f="hook.command" value="${esc(f.command)}" placeholder="~/.claude/hooks/my-hook.sh" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="hf-err"${invalidAttr('hook', 'command')}>
    <div class="form-actions"><button type="submit" class="btn p" id="hf-save">Save hook</button><button type="button" class="btn" id="hf-cancel" data-c="hf-cancel">Cancel</button></div>
    <p class="form-err" id="hf-err" role="alert">${esc(f.error)}</p>
  </form>`
}

export function formFail(form, field, message, focusId) {
  cfg[form].error = message
  cfg[form].invalid = field
  render()
  $(focusId)?.focus()
}

export function submitHook() {
  return busy('hook-add', async () => {
    const f = cfg.hook
    f.error = ''
    f.invalid = ''
    const command = f.command.trim()
    if (!command) return formFail('hook', 'command', 'Enter the command the hook runs.', 'hf-command')
    try {
      const res = await send('POST', '/api/hook', {
        scope: f.scope,
        event: f.event,
        matcher: f.matcher.trim(),
        command
      })
      cfg.hook = freshHookForm()
      toast(`Added ${f.event} hook · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
      $('hf-open')?.focus()
    } catch (err) {
      formFail('hook', '', `Could not add the hook: ${err.message}`, 'hf-save')
    }
  })
}
