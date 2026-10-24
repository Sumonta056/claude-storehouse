import { get, send } from './api.js'
import {
  $,
  HOLDER,
  ask,
  cardKey,
  focusMark,
  focusRestore,
  holderKey,
  insertText,
  showBanner,
  toast,
  trapTab,
  waitFor
} from './core/dom.js'
import {
  ago,
  baseName,
  compact,
  esc,
  fmtSize,
  isFolderSkill,
  isPlain,
  lineCount,
  money,
  monthName,
  opt,
  parentDir,
  plural,
  relTo,
  shortVersion,
  slug,
  tilde,
  tok
} from './core/format.js'
import { ICON, kindIcon } from './core/icons.js'
import {
  PERIOD_KEY,
  SORTS,
  SORT_KEY,
  bks,
  cfg,
  chipFilter,
  dr,
  eds,
  favOpen,
  freshHookForm,
  freshMcpForm,
  groupOpen,
  items,
  msgs,
  pending,
  state
} from './core/state.js'
import {
  KIND_WORD,
  PAGES,
  SETTINGS_FILE,
  counts,
  favBody,
  favCats,
  favNameError,
  favOf,
  favPopOptions,
  favoriteEntries,
  hasSwitch,
  isPluginOwned,
  itemLabel,
  matches,
  normalize,
  otherCounts,
  ownerId,
  ownerPlugin,
  pluginById,
  pluginLabel,
  projectOn,
  switchInfo,
  switchable,
  visible
} from './logic/catalog.js'
import { CHIPS, chipCounts, keepChip } from './logic/chips.js'
import {
  ELSEWHERE,
  FORM_FIELDS,
  FORM_GROUPS,
  MD_ORDER,
  SET_ORDER,
  cfgDirty,
  cfgPanels,
  cmd,
  dropMissing,
  edDirty,
  elsewhereText,
  fieldGet,
  fieldPath,
  fieldSet,
  formValue,
  isCfgPage,
  lockedKeys,
  lockedText,
  markStale,
  mdDirtyKey,
  setData,
  setDirty,
  sformDirtyKeys,
  sformEdit,
  sformValues,
  shortValue
} from './logic/config.js'
import { CTX_TYPES, TOKEN_BYTES, contextItems, keepCtx, listingTokens, sumTokens, tokensOf } from './logic/context.js'
import { DOC_KIND, DOC_SEVERITY, doctorIssues, doctorItem, doctorMatches } from './logic/doctor.js'
import { DUP_KINDS, dupSource, duplicateGroups, needsAction, onCount } from './logic/duplicates.js'
import { EFF_GROUPS, SCOPE_KEY, SCOPE_TAG, effRow, effRows } from './logic/effective.js'
import { HOOK_EVENTS, HOOK_INFO, hookLabel, hookRunsFor } from './logic/hooks.js'
import { highlight, isMd, previewHtml } from './logic/markdown.js'
import { mcpTransport, parseEnv } from './logic/mcp.js'
import {
  USAGE_PAGES,
  USE_WORD,
  isUnused,
  lastText,
  modelShares,
  sharedWith,
  sortRows,
  useOf,
  useReady
} from './logic/usage.js'

function scopeTag(scope) {
  return `<span class="tag ${esc(scope)}">${esc(scope)}</span>`
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`
}

function nothingMatches() {
  return empty(state.query ? `Nothing matches "${state.query}" in this scope.` : 'Nothing in this scope.')
}

function navIcon(page) {
  return document.querySelector(`#nav [data-p="${page}"] .ic`)?.outerHTML ?? ''
}

function statTile(page, label, c) {
  return `<button type="button" class="stat" data-go="${page}">
    <span class="st-top"><span class="st-ic">${navIcon(page)}</span><span class="l">${esc(label)}</span></span>
    <span class="n">${c.total}</span>
    <span class="s"><span class="on">${c.on} on</span><span class="off">${c.total - c.on} off</span></span>
  </button>`
}

function setSort(value) {
  state.usageSort = value
  try {
    localStorage.setItem(SORT_KEY, value)
  } catch {}
  render()
}

function setPeriod(period) {
  state.usagePeriod = period
  try {
    localStorage.setItem(PERIOD_KEY, period)
  } catch {}
  renderDash()
}

function usageHtml() {
  const source = '<code>~/.claude/projects</code>'
  if (state.usageError)
    return `<section class="usage note-only"><p>Could not read usage from ${source}: ${esc(state.usageError)}</p></section>`
  if (!state.usage) return `<section class="usage note-only"><p>Reading usage from ${source}…</p></section>`
  if (!state.usage.all.responses)
    return `<section class="usage note-only"><p>No Claude Code usage found in ${source}.</p></section>`
  const u = state.usage[state.usagePeriod]
  const label = state.usagePeriod === 'month' ? monthName(state.usage.monthKey) : 'All time'
  const shares = modelShares(u)
  const pct = (n) => `${n.toFixed(1)}%`
  const unpriced = u.unpriced.length
    ? `<br>No price for ${u.unpriced.map((m) => `<code>${esc(m)}</code>`).join(', ')}. Its tokens count, its cost does not.`
    : ''
  const [dollars, cents] = money(u.cost).slice(1).split('.')
  const periods = [
    ['month', 'This month'],
    ['all', 'All time']
  ]
    .map(
      ([k, text]) =>
        `<button type="button" data-period="${k}" aria-pressed="${k === state.usagePeriod ? 'true' : 'false'}">${text}</button>`
    )
    .join('')
  const legend = shares.length
    ? `<div class="bar" role="img" aria-label="${esc(`Cost by model: ${shares.map((m) => `${m.name} ${pct(m.share)}`).join(', ')}`)}">${shares
        .map((m) => `<span class="${m.cls}" style="width:${m.share}%"></span>`)
        .join('')}</div>
        <div class="legend">${shares.map((m) => `<span><i class="${m.cls}"></i>${esc(m.name)} ${pct(m.share)}</span>`).join('')}</div>`
    : '<p>No priced usage in this period.</p>'
  return `<section class="usage" aria-label="Usage and cost">
      <div>
        <div class="k">API-equal value</div>
        <div class="big"><small>$</small>${esc(dollars)}.${esc(cents)}</div>
        <p>${esc(label)}. All Claude Code usage on this machine, priced at current Anthropic API rates.<br>Read from ${source}${unpriced}</p>
      </div>
      <div class="right">
        <div class="rhead">
          <div class="k">Cost by model</div>
          <div class="scope period" role="group" aria-label="Usage period">${periods}</div>
        </div>
        <div class="mon">${compact(u.tokens)}<span>tokens · ${u.responses.toLocaleString('en-US')} responses</span></div>
        ${legend}
      </div>
    </section>
    <div class="utiles">
      <div><b>${compact(u.tokens)}</b><span>Total tokens</span></div>
      <div><b>${u.sessions.toLocaleString('en-US')}</b><span>Sessions across ${u.projects} project${u.projects === 1 ? '' : 's'}</span></div>
      <div><b class="g">${money(u.saved)}</b><span>Saved by prompt cache</span></div>
      <div><b>${pct(u.cacheShare * 100)}</b><span>Input tokens served from cache</span></div>
    </div>`
}

async function loadUsage() {
  try {
    state.usage = await get('/api/usage')
    state.usageError = ''
  } catch (err) {
    state.usageError = err.message
  }
  if (state.inventory && USAGE_PAGES.has(state.page)) render()
}

function needUsage() {
  state.usageLoad ??= loadUsage()
}

function renderDash() {
  const inv = state.inventory
  const tiles = [
    statTile('skills', 'Skills', counts(state.catalog.skill)),
    statTile('agents', 'Agents', counts(state.catalog.agent)),
    statTile('plugins', 'Plugins', counts(state.catalog.plugin)),
    statTile('hooks', 'Hooks', otherCounts(inv.hooks)),
    statTile('mcp', 'MCP servers', otherCounts(inv.mcp))
  ].join('')
  const favs = favoriteEntries()
    .filter((e) => e.item && visible(e.item))
    .slice(0, 6)
  const favHtml = favs.length
    ? `<ul class="rows" data-rows="dfav">${favs.map((e) => rowHtml(e.item, 'dfav', { cat: e.fav.category })).join('')}</ul>`
    : empty(inv.favorites.length ? 'No favorites in this scope.' : 'No favorites yet. Click the star on any row.')
  const more =
    inv.favorites.length > favs.length && favs.length
      ? '<button type="button" class="btn-link" data-go="fav">All favorites <span aria-hidden="true">→</span></button>'
      : ''
  const proj = [...state.catalog.skill, ...state.catalog.agent, ...state.catalog.plugin].filter(
    (i) => i.scope === 'project' && visible(i)
  )
  const projHtml = proj.length
    ? rowsHtml(proj, 'dproj')
    : empty(state.query ? `No project items match "${state.query}".` : 'No skills, agents, or plugins in ./.claude.')
  const errors = inv.errors?.length
    ? `<div class="warn"><b>${inv.errors.length} file${inv.errors.length > 1 ? 's' : ''} could not be read.</b> ${inv.errors.map((e) => `<code>${esc(tilde(e.path))}</code>: ${esc(e.error)}`).join('; ')}</div>`
    : ''
  $('p-dash').innerHTML = `${errors}
    ${usageHtml()}
    <div class="stats">${tiles}</div>
    <div class="two">
      <div><h2>Favorites ${more}</h2>${favHtml}${recentHtml()}</div>
      <div>
        <h2>This project</h2>
        ${projectOn() ? `${filesHtml()}<h2>Project items <span class="pill">${proj.length}</span></h2>${projHtml}` : projectOffHtml()}
      </div>
    </div>`
}

function recentHtml() {
  const all = [...state.catalog.skill, ...state.catalog.agent, ...state.catalog.plugin]
  if (!all.some((i) => typeof i.mtime === 'number')) return ''
  const recent = all
    .filter((i) => typeof i.mtime === 'number' && visible(i))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 5)
  const body = recent.length
    ? `<ul class="clist">${recent
        .map(
          (i) =>
            `<li class="recent" data-key="${esc(i.key)}"><button type="button" class="btn-plain name" data-act="open">${esc(i.name)}</button><span class="ck">${esc(KIND_WORD[i.kind] ?? i.kind)} · ${esc(i.scope)}</span><span class="when" title="${esc(new Date(i.mtime).toLocaleString())}">${esc(ago(i.mtime))}</span></li>`
        )
        .join('')}</ul>`
    : nothingMatches()
  return `<h2>Recently changed</h2>${body}`
}

function filesHtml() {
  const inv = state.inventory
  const rows = [
    ['CLAUDE.md', inv.claudeMd?.project?.exists, 'claudemd'],
    ['.claude/settings.json', inv.settings?.project?.exists, 'settings'],
    ['.claude/settings.local.json', inv.settings?.projectLocal?.exists, 'settings'],
    [
      '.mcp.json',
      state.projectFiles ? state.projectFiles.has('.mcp.json') : inv.mcp.some((m) => m.origin === 'mcpjson'),
      'mcp'
    ]
  ]
  return `<ul class="clist files">${rows
    .map(
      ([name, yes, page]) =>
        `<li><span class="dot${yes ? ' yes' : ''}" aria-hidden="true"></span><button type="button" class="btn-plain fname" data-go="${page}" aria-label="${esc(`${name}, ${yes ? 'present' : 'not found'}. Open ${PAGES[page]}`)}">${esc(name)}</button><span class="${yes ? 'yes' : 'no'}">${yes ? 'present' : 'not found'}</span></li>`
    )
    .join('')}</ul>`
}

function missingFavRowHtml(fav) {
  return `<li class="lrow missing" data-fav="${esc(fav.id)}" draggable="true">
    <div class="lead"><span class="lead-ic bad" role="img" aria-label="Missing">${ICON.warn}</span></div>
    <div class="body">
      <div class="l1"><span class="name">${esc(fav.name)}</span><span class="src">${esc(fav.kind)} · ${esc(fav.source)}</span><span class="flag bad">Missing</span></div>
      <p class="desc">This ${esc(fav.kind)} is no longer on disk.</p>
    </div>
    <div class="tail"><button type="button" class="btn danger" data-act="unfav">Remove</button></div>
  </li>`
}

function favHeadHtml(cat, label, count, open, index) {
  if (cat !== null && state.favEditing === cat) {
    return `<form class="fav-edit" data-form="cat-rename" data-cat="${esc(cat)}">
      <input type="text" id="fav-rename" name="n" value="${esc(state.favRenameValue)}" maxlength="40" required aria-label="${esc(`New name for ${cat}`)}">
      <button type="submit" class="btn p">Rename</button>
      <button type="button" class="btn ghost" data-fc="cancel">Cancel</button>
    </form>`
  }
  const tools =
    cat === null
      ? ''
      : `<span class="fav-tools"><button type="button" class="icon-btn" data-fc="rename" data-cat="${esc(cat)}" aria-label="${esc(`Rename category ${cat}`)}">${ICON.pen}</button><button type="button" class="icon-btn del" data-fc="delete" data-cat="${esc(cat)}" aria-label="${esc(`Delete category ${cat}`)}">${ICON.bin}</button></span>`
  return `<button type="button" class="fav-tog${cat === null ? ' uncat' : ''}" data-fc="collapse" data-cat="${esc(cat ?? '')}" aria-expanded="${open}" aria-controls="favsec-${index}">${ICON.chev}<span class="fav-name">${esc(label)}</span><span class="pill">${count}</span></button>${tools}`
}

function favSectionHtml(cat, list, index) {
  const label = cat ?? 'Uncategorized'
  const open = favOpen.get(cat ?? '') !== false
  const rows = list
    .map((e) => (e.item ? rowHtml(e.item, 'fav', { draggable: true }) : missingFavRowHtml(e.fav)))
    .join('')
  const body = list.length
    ? `<ul class="rows" data-rows="fav">${rows}</ul>`
    : `<div class="empty fav-drop">No favorites here. Drag a row here, or pick ${esc(label)} from a star.</div>`
  return `<section class="fav-sec" data-cat="${esc(cat ?? '')}" aria-label="${esc(label)}">
    <div class="fav-h">${favHeadHtml(cat, label, list.length, open, index)}</div>
    <div id="favsec-${index}"${open ? '' : ' hidden'}>${body}</div>
  </section>`
}

function renderFav() {
  const cats = favCats()
  const entries = favoriteEntries()
  const shown = entries.filter((e) => (e.item ? visible(e.item) : matches({ name: e.fav.name, source: e.fav.source })))
  const groups = [
    ...cats.map((c) => [c, shown.filter((e) => e.fav.category === c)]),
    [null, shown.filter((e) => e.fav.category === null)]
  ]
  const top = `<div class="fav-top">
    <div class="warn">Favorites and categories live in <code>~/.claude/storehouse.json</code>. They do not change Claude Code. Drag a row to reorder it or to move it to another category.</div>
    <form class="fav-new" data-form="cat-new">
      <input type="text" id="fav-newcat" name="n" value="${esc(state.favNewName)}" maxlength="40" placeholder="New category" aria-label="New category name">
      <button type="submit" class="btn p">Add category</button>
    </form>
  </div>`
  let body
  if (!entries.length && !cats.length) body = empty('No favorites yet. Click the star on any row and pick a category.')
  else if (state.query) {
    const hits = groups.map((g, i) => [...g, i]).filter(([, list]) => list.length)
    body = hits.length ? hits.map(([c, list, i]) => favSectionHtml(c, list, i)).join('') : nothingMatches()
  } else body = groups.map(([c, list], i) => favSectionHtml(c, list, i)).join('')
  $('p-fav').innerHTML = top + body
}

function favPopListHtml() {
  const { options, active, current } = state.favPop
  return options
    .map((o, i) => {
      const cls = ['fp-opt', i === active ? 'active' : '', o.create ? 'create' : ''].filter(Boolean).join(' ')
      const text = o.create ? `+ Create "${o.create}"` : o.label
      const cur = !o.create && o.value === current ? '<span class="fp-cur" aria-label="current">✓</span>' : ''
      return `<li role="option" id="fp-opt-${i}" class="${cls}" data-i="${i}" aria-selected="${i === active}"><span>${esc(text)}</span>${cur}</li>`
    })
    .join('')
}

function favPopHtml(item, fav) {
  return `<form data-form="favpop">
    <h3 id="favpop-t">${fav ? 'Change category' : 'Add to favorites'}</h3>
    <p class="sub">${esc(itemLabel(item))}</p>
    <input type="text" name="newcat" maxlength="40" placeholder="Search or create a category" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="favpop-list" aria-label="Category">
    <ul class="fp-list" id="favpop-list" role="listbox" aria-label="Categories"></ul>
    <p class="err" role="alert" hidden></p>
    <div class="bar">${fav ? '<button type="button" class="btn danger ghost" data-pop="remove">Remove</button>' : '<button type="button" class="btn ghost" data-pop="cancel">Cancel</button>'}<button type="submit" class="btn p">Save</button></div>
  </form>`
}

function drawFavPopList() {
  const { el, options, active } = state.favPop
  el.querySelector('.fp-list').innerHTML = favPopListHtml()
  el.querySelector('input[name="newcat"]').setAttribute(
    'aria-activedescendant',
    options.length ? `fp-opt-${active}` : ''
  )
  el.querySelector(`#fp-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
}

function filterFavPop(query) {
  const options = favPopOptions(query)
  const q = query.trim().toLowerCase()
  const exact = options.findIndex((o) => !o.create && o.label.toLowerCase() === q)
  const current = q ? -1 : options.findIndex((o) => o.value === state.favPop.current)
  state.favPop.options = options
  state.favPop.active = Math.max(0, exact, current)
  state.favPop.el.querySelector('.err').hidden = true
  drawFavPopList()
}

function placeFavPop() {
  if (!state.favPop) return
  const { el, trigger } = state.favPop
  if (!trigger?.isConnected) return closeFavPop(false)
  const r = trigger.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight
  el.style.left = `${Math.max(16, Math.min(r.right - w, innerWidth - w - 16))}px`
  el.style.top = `${r.bottom + 6 + h > innerHeight - 16 ? Math.max(16, r.top - h - 6) : r.bottom + 6}px`
}

function openFavPop(item, trigger) {
  closeFavPop(false)
  const fav = favOf(item)
  const el = document.createElement('div')
  el.className = 'favpop'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-labelledby', 'favpop-t')
  el.innerHTML = favPopHtml(item, fav)
  document.body.append(el)
  state.favPop = {
    el,
    item,
    trigger,
    inDrawer: Boolean(trigger?.closest('#dr')),
    current: fav ? (fav.category ?? '') : '',
    options: [],
    active: 0
  }
  filterFavPop('')
  placeFavPop()
  const input = el.querySelector('input[name="newcat"]')
  input.focus()
  input.addEventListener('input', () => filterFavPop(input.value))
  input.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (!step || !state.favPop.options.length) return
    e.preventDefault()
    state.favPop.active = (state.favPop.active + step + state.favPop.options.length) % state.favPop.options.length
    drawFavPopList()
  })
  el.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-i]')
    if (opt) {
      state.favPop.active = Number(opt.dataset.i)
      return submitFavPop(el.querySelector('form'))
    }
    const act = e.target.closest('[data-pop]')?.dataset.pop
    if (act === 'cancel') closeFavPop()
    else if (act === 'remove') {
      closeFavPop()
      star(favBody(item, false), `Unstarred ${item.name}`)
    }
  })
  el.addEventListener('submit', (e) => {
    e.preventDefault()
    submitFavPop(e.target)
  })
}

function closeFavPop(refocus = true) {
  if (!state.favPop) return
  const { el, item, trigger, inDrawer } = state.favPop
  state.favPop = null
  el.remove()
  if (!refocus) return
  if (trigger?.isConnected) return trigger.focus({ preventScroll: true })
  const scope = inDrawer && drawerOpen() ? $('dr') : document.querySelector('.page:not([hidden])')
  const btn = inDrawer
    ? scope?.querySelector('[data-dact="star"]')
    : [...(scope?.querySelectorAll('[data-act="star"]') ?? [])].find((b) => holderKey(b.closest(HOLDER)) === item.key)
  btn?.focus({ preventScroll: true })
}

function submitFavPop(form) {
  const { item, options, active } = state.favPop
  const choice = options[active]
  const fav = favOf(item)
  const fail = (message) => {
    const p = form.querySelector('.err')
    p.textContent = message
    p.hidden = false
    form.elements.newcat.focus()
  }
  if (!choice) return fail('Type a category name.')
  if (choice.create) {
    const error = favNameError(choice.create)
    if (error) return fail(error)
  } else if (fav && (fav.category ?? '') === choice.value) return closeFavPop()
  const category = choice.create ?? (choice.value || null)
  const label = category ?? 'Uncategorized'
  closeFavPop()
  star(favBody(item, true, category), fav ? `Moved ${item.name} to ${label}` : `Starred ${item.name} in ${label}`)
}

async function editFavCategory(body, message) {
  if (pending.has('favcat')) return false
  pending.add('favcat')
  try {
    await send('POST', '/api/favorites/category', body)
    toast(`${message} · ~/.claude/storehouse.json`)
    await refresh()
    return true
  } catch (err) {
    toast(`Could not update categories: ${err.message}`, true)
    return false
  } finally {
    pending.delete('favcat')
    loadActivity()
  }
}

function focusFavTool(cat, tool) {
  document.querySelector(`#p-fav [data-fc="${tool}"][data-cat="${CSS.escape(cat)}"]`)?.focus({ preventScroll: true })
}

function startRename(cat) {
  state.favEditing = cat
  state.favRenameValue = cat
  render()
  const input = $('fav-rename')
  input?.focus()
  input?.select()
}

function cancelRename() {
  const cat = state.favEditing
  state.favEditing = null
  render()
  if (cat !== null) focusFavTool(cat, 'rename')
}

async function onFavCat(el) {
  const act = el.dataset.fc
  const cat = el.dataset.cat ?? ''
  if (act === 'collapse') {
    favOpen.set(cat, el.getAttribute('aria-expanded') !== 'true')
    render()
    return focusFavTool(cat, 'collapse')
  }
  if (act === 'rename') return startRename(cat)
  if (act === 'cancel') return cancelRename()
  if (act === 'delete') {
    const n = state.inventory.favorites.filter((f) => f.category === cat).length
    const yes = await ask({
      title: `Delete category ${cat}?`,
      message: n
        ? `Its ${plural(n, 'favorite')} move to Uncategorized. They stay favorites. You can undo this from the activity log.`
        : 'This category is empty.',
      ok: 'Delete',
      danger: true
    })
    if (yes) await editFavCategory({ op: 'delete', name: cat }, `Deleted category ${cat}`)
  }
}

async function submitNewCat() {
  const name = state.favNewName.trim()
  const error = favNameError(name)
  if (error) return toast(error, true)
  if (favCats().some((c) => c.toLowerCase() === name.toLowerCase()))
    return toast(`Category ${name} already exists.`, true)
  if (await editFavCategory({ op: 'create', name }, `Added category ${name}`)) {
    state.favNewName = ''
    render()
    $('fav-newcat')?.focus()
  }
}

async function submitRename(form) {
  const old = form.dataset.cat
  const name = state.favRenameValue.trim()
  if (name === old) return cancelRename()
  const error = favNameError(name)
  if (error) return toast(error, true)
  state.favEditing = null
  if (await editFavCategory({ op: 'rename', name: old, newName: name }, `Renamed ${old} to ${name}`))
    return focusFavTool(name, 'rename')
  state.favEditing = old
  render()
  $('fav-rename')?.focus()
}

const SECTIONS = {
  plugins: [
    ['global', 'Global · installed for your user', ''],
    ['project', 'Project · installed for this folder', '']
  ],
  mods: [
    ['global', 'Global · installed for your user', ''],
    ['project', 'Project · installed for this folder', ''],
    ['dev', 'Development · ~/.claude/dev-mods', 'Read-only. These mods have no switch.']
  ],
  skills: [
    ['global', 'Global · ~/.claude/skills', 'The switch writes skillOverrides in ~/.claude/settings.json'],
    ['project', 'Project · ./.claude/skills', 'The switch writes .claude/settings.local.json']
  ],
  agents: [
    ['global', 'Global · ~/.claude/agents', 'Off renames name.md to name.md.disabled'],
    ['project', 'Project · ./.claude/agents', 'Off renames name.md to name.md.disabled']
  ]
}

function useChips(item) {
  if (!USAGE_PAGES.has(state.page)) return ''
  const u = useOf(item)
  if (!u) return ''
  const unused = isUnused(item)
  const bits = []
  if (u.count30) bits.push(`<span class="mchip">Used ${u.count30}× in 30 d</span>`)
  if (u.last)
    bits.push(
      `<span class="mchip${unused ? ' warnc' : ''}" title="${esc(new Date(u.last).toLocaleString())}">last: ${esc(lastText(u.last))}</span>`
    )
  else if (unused) bits.push('<span class="mchip warnc">Never used</span>')
  const shared = u.last ? sharedWith(item) : 0
  if (shared) bits.push(`<span class="mchip">${esc(`Shared with ${plural(shared, 'item')} of this name`)}</span>`)
  return bits.join('')
}

function useFlag(item) {
  return USAGE_PAGES.has(state.page) && isUnused(item) ? '<span class="flag bad">Unused 30 d</span>' : ''
}

function sortHtml() {
  if (!useReady()) return ''
  const buttons = SORTS.map(
    ([k, text]) =>
      `<button type="button" data-usort="${k}" aria-pressed="${k === state.usageSort ? 'true' : 'false'}">${text}</button>`
  ).join('')
  return `<div class="usort"><span>Sort</span><div class="scope" role="group" aria-label="Sort by use">${buttons}</div></div>`
}

function unusedBanner(page, list) {
  const unused = list.filter((i) => visible(i) && isUnused(i))
  if (!unused.length) return ''
  const can = unused.filter((i) => i.canToggle && switchable(page, i))
  const cost = page === 'mcp' ? 0 : unused.reduce((sum, i) => sum + listingTokens(i), 0)
  const show =
    chipFilter[page] === 'unused' ? '' : '<button type="button" class="btn" data-unused="show">Show them</button>'
  const off = can.length
    ? `<button type="button" class="btn p" data-unused="off">Switch off ${can.length}</button>`
    : ''
  const typed = page === 'skills' ? ' Skills you start by typing /name do not count as use.' : ''
  return `<div class="ubanner" role="note"><p><b>${esc(`${plural(unused.length, USE_WORD[page])} had no use in 30 days.`)}</b>${cost ? ` Together they add ${esc(tok(cost))} to every session.` : ''}${typed}</p><div class="acts">${show}${off}</div></div>`
}

async function switchOffUnused() {
  const page = state.page
  const list = { skills: state.catalog.skill, agents: state.catalog.agent, mcp: state.catalog.mcp }[page]
  if (!list) return
  const targets = list.filter((i) => visible(i) && isUnused(i) && i.canToggle && switchable(page, i))
  if (!targets.length) return
  const yes = await ask({
    title: `Switch off ${plural(targets.length, USE_WORD[page])}?`,
    message: `${targets.map((i) => i.name).join(', ')}. Claude did not call these in 30 days.${page === 'skills' ? ' Skills you start by typing /name do not count as use.' : ''} Each switch gets its own Activity entry that you can undo.`,
    ok: `Switch off ${targets.length}`
  })
  if (!yes) return
  for (const t of targets) {
    const item = items.get(t.key)
    if (item?.enabled) await toggle(item)
  }
}

function pluginParts(id) {
  const p = pluginById(id)
  if (!p) return []
  const parts = [
    [p.skills.length, 'skill'],
    [p.agents.length, 'agent'],
    [p.hooks.length, 'hook']
  ]
    .filter(([n]) => n)
    .map(([n, w]) => plural(n, w))
  if (p.mcp.length) parts.push(`${p.mcp.length} MCP`)
  return parts
}

function cliScope(id) {
  const s = pluginById(id)?.installScope
  return ['user', 'project', 'local'].includes(s) ? s : 'user'
}

function rowSource(item) {
  if (item.kind === 'plugin') return item.source === 'plugin' ? '' : item.source
  if (item.plugin) return ''
  return item.source === 'local' || item.source === 'project' ? '' : item.source
}

function leadHtml(item) {
  const sw = switchInfo(item)
  if (item.kind === 'plugin' && item.missing) {
    return `<span class="lead-ic bad" role="img" aria-label="Plugin folder missing" title="${esc(sw.title)}">${ICON.warn}</span>`
  }
  if (!item.canToggle) {
    return `<span class="lead-ic" role="img" aria-label="${esc(sw.title)}" title="${esc(sw.title)}">${ICON.lock}</span>`
  }
  const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
  return `<button type="button" class="sw" role="switch" data-act="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" title="${esc(sw.title)}"></button>`
}

function menuEntries(item) {
  if (item.kind === 'plugin' && item.missing)
    return [
      ['m-open', 'Open details'],
      ['m-uninstall', 'Remove entry', true]
    ]
  const list = [['m-open', 'Open details']]
  if (item.canToggle) list.push(['m-toggle', item.enabled ? 'Switch off' : 'Switch on'])
  if (item.path) list.push(['m-finder', 'Reveal in Finder'])
  if (item.kind === 'plugin' && !item.dev) list.push(['m-uninstall', 'Uninstall plugin…', true])
  return list
}

function menuHtml(item) {
  const entries = menuEntries(item)
  const html = entries
    .map(
      ([act, text, danger]) =>
        `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-act="${act}">${esc(text)}</button>`
    )
    .join('')
  return `<div class="menu" role="menu" id="menu-${slug(item.key)}" aria-label="${esc(`More actions for ${item.name}`)}">${html}</div>`
}

function metaHtml(item) {
  if (item.kind === 'plugin' && item.modules?.length && (item.dev || state.page === 'mods')) {
    const bits = item.modules.map((m) => `<span class="mchip">${esc(m)}</span>`)
    if (item.dev) bits.push(`<span class="mchip">session ${esc(item.session.slice(0, 8))}</span>`)
    return `<p class="meta chips-s">${bits.join('')}</p>`
  }
  if (item.kind === 'plugin') {
    if (item.missing) return '<p class="meta muted">Use “Remove entry” to clean up installed_plugins.json.</p>'
    const parts = pluginParts(item.id)
    return `<p class="meta${parts.length ? '' : ' muted'}">${esc(parts.length ? parts.join(' · ') : 'No skills, agents, hooks, or MCP servers found')}</p>`
  }
  const bits = []
  if (item.kind === 'agent') {
    if (item.model) bits.push(`<span class="mchip">model: ${esc(item.model)}</span>`)
    if (item.tools?.length) bits.push(`<span class="mchip">${esc(item.tools.join(' · '))}</span>`)
  }
  const use = useChips(item)
  if (use) bits.push(use)
  return bits.length ? `<p class="meta chips-s">${bits.join('')}</p>` : ''
}

const FAV_KINDS = new Set(['skill', 'agent', 'plugin'])

function tokChip(item) {
  if (!['skills', 'agents'].includes(state.page) || (item.kind !== 'skill' && item.kind !== 'agent')) return ''
  const n = listingTokens(item)
  const title = `About ${tok(n)} in every session for the name and description. The full file, about ${tok(tokensOf(item.size ?? 0))}, loads on use.`
  return `<span class="tokc" title="${esc(title)}">${esc(tok(n))}</span>`
}

function rowHtml(item, ctx = '', { draggable = false, cat = null, keep = false, right = '', note = '' } = {}) {
  const open = state.menuKey === item.key && state.menuCtx === ctx
  const src =
    ctx === 'dups'
      ? dupSource(item)
      : ctx === 'fav' && item.plugin
        ? `via plugin ${pluginLabel(item.plugin)}`
        : rowSource(item)
  const off = item.canToggle && !item.enabled
  const desc = item.missing
    ? 'Listed in installed_plugins.json, but the plugin folder is gone.'
    : item.description || 'No description'
  const fullVer = item.kind === 'plugin' ? (pluginById(item.id)?.version ?? item.version ?? '') : ''
  const ver = shortVersion(fullVer)
  const cls = ['lrow', off ? 'off' : '', item.missing ? 'missing' : '', item.canToggle ? '' : 'locked']
    .filter(Boolean)
    .join(' ')
  return `<li class="${cls}" data-key="${esc(item.key)}"${draggable ? ' draggable="true"' : ''}>
    <div class="lead">${leadHtml(item)}</div>
    <div class="body">
      <div class="l1"><button type="button" class="name btn-plain" data-act="open">${esc(item.name)}</button>${src ? `<span class="src">${esc(src)}</span>` : ''}${cat ? `<span class="cat-tag">${esc(cat)}</span>` : ''}${item.isMod && state.page !== 'mods' ? '<span class="flag">Mod</span>' : ''}${item.missing ? '<span class="flag bad">Folder missing</span>' : ''}${off ? '<span class="flag">Off</span>' : ''}${useFlag(item)}${tokChip(item)}</div>
      <p class="desc">${esc(desc)}</p>
      ${metaHtml(item)}${note}
    </div>
    ${right}${ver ? `<span class="ver" title="${esc(fullVer)}">${esc(ver)}</span>` : ''}
    <div class="tail">
      ${item.missing ? '<button type="button" class="btn danger" data-act="uninstall">Remove entry</button>' : ''}
      ${keep ? '<button type="button" class="btn" data-act="keep">Keep only this</button>' : ''}
      ${item.dev || !FAV_KINDS.has(item.kind) ? '' : `<button type="button" class="star" data-act="star" aria-haspopup="dialog" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>`}
      <button type="button" class="icon-btn" data-act="menu" aria-haspopup="menu" aria-expanded="${open ? 'true' : 'false'}"${open ? ` aria-controls="menu-${slug(item.key)}"` : ''} aria-label="${esc(`More actions for ${item.name}`)}">${ICON.dots}</button>
    </div>
    ${open ? menuHtml(item) : ''}
  </li>`
}

function rowsHtml(list, ctx = '') {
  return `<ul class="rows" data-rows="${ctx}">${list.map((i) => rowHtml(i, ctx)).join('')}</ul>`
}

function chipsHtml(page, list, note) {
  const n = chipCounts(page, list)
  const buttons = CHIPS[page]
    .filter(([k]) => k !== 'unused' || useReady())
    .map(([k, label]) => {
      const on = chipFilter[page] === k
      const bad = (k === 'broken' || k === 'error' || k === 'unused') && n[k] ? ' bad' : ''
      return `<button type="button" class="chip${bad}" id="chip-${page}-${k}" data-chip="${k}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)} <span class="n">${n[k]}</span></button>`
    })
    .join('')
  const extra = USE_WORD[page] ? sortHtml() : ''
  const banner = USE_WORD[page] ? unusedBanner(page, list) : ''
  return `<div class="chipbar"><div class="chips" role="group" aria-label="${esc(`Filter ${PAGES[page].toLowerCase()}`)}">${buttons}</div>${extra}<p class="note">${note}</p></div>${banner}`
}

function pluginGroupsHtml(page, list) {
  const kind = page === 'skills' ? 'skill' : 'agent'
  const shown = list.filter((i) => i.scope === 'plugin' && visible(i) && keepChip(page, i))
  if (!shown.length) return ''
  const byPlugin = new Map()
  for (const i of shown) {
    const id = i.plugin ?? i.source
    if (!byPlugin.has(id)) byPlugin.set(id, [])
    byPlugin.get(id).push(i)
  }
  const body = [...byPlugin]
    .map(([id, rows]) => {
      const plugin = state.catalog.plugin.find((p) => p.id === id)
      const gk = `${kind}:${id}`
      const open = groupOpen.has(gk) ? groupOpen.get(gk) : Boolean(state.query.trim())
      const name = plugin?.name ?? id
      const panel = `gp-${kind}-${slug(id)}`
      const stateText = plugin?.enabled ? 'Plugin on' : 'Plugin off'
      const notice = plugin
        ? `<div class="pnote" role="note" data-key="${esc(plugin.key)}">${ICON.lock}<span class="pnote-t">These ${kind}s are part of the plugin <b>${esc(name)}</b>. You cannot delete or switch them one by one.</span><span class="pnote-a"><button type="button" class="btn" data-act="toggle">${plugin.enabled ? 'Switch off plugin' : 'Switch on plugin'}</button><button type="button" class="btn danger" data-act="uninstall">Uninstall plugin…</button></span></div>`
        : ''
      return `<div class="pgroup${plugin?.enabled ? '' : ' off'}">
        <h3 class="ghead"><button type="button" class="gbtn" id="gb-${kind}-${slug(id)}" data-group="${esc(gk)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panel}">${ICON.chev}<span class="gname">${esc(name)}</span><span class="gcount">${esc(plural(rows.length, kind))}</span><span class="gstate${plugin?.enabled ? ' on' : ''}">${stateText}</span></button></h3>
        <div class="gbody" id="${panel}"${open ? '' : ' hidden'}>${open ? notice + rowsHtml(sortRows(rows)) : ''}</div>
      </div>`
    })
    .join('')
  return `<h2>From plugins <span class="pill">${shown.length}</span><span class="hint">Grouped by plugin. These ${kind}s follow their plugin switch.</span></h2><div class="groups">${body}</div>`
}

function dupGroupHtml(g) {
  const word = new Map(DUP_KINDS).get(g.kind)
  const on = onCount(g)
  const bad = on > 1
  const gk = `dup:${g.key}`
  const open = groupOpen.has(gk) ? groupOpen.get(gk) : bad
  const panel = `gp-dup-${slug(g.key)}`
  const first = g.items[0].description
  const notes = []
  if (bad)
    notes.push(
      `Claude Code sees ${on} ${word}s named <code>${esc(g.name)}</code>. Switch off the ones you do not want.`
    )
  if (first && g.items.every((i) => i.description === first))
    notes.push(`<b>Same description.</b> One ${word} looks like a copy of the other.`)
  for (const i of g.items.filter((i) => bad && i.enabled && !i.canToggle && i.plugin))
    notes.push(
      `<code>${esc(i.name)}</code> follows the plugin <b>${esc(pluginLabel(i.plugin))}</b>. Switch the plugin off on the Plugins page, or keep it.`
    )
  const rows = g.items
    .map((i) => rowHtml(i, 'dups', { keep: i.enabled && g.items.some((o) => o !== i && o.enabled && o.canToggle) }))
    .join('')
  const pill = bad
    ? `<span class="gstate bad">Conflict · ${on} on</span>`
    : `<span class="gstate ok">OK · ${on} on</span>`
  return `<div class="pgroup">
    <h3 class="ghead"><button type="button" class="gbtn" id="gb-dup-${slug(g.key)}" data-group="${esc(gk)}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${panel}">${ICON.chev}<span class="gname">${esc(g.name)}</span><span class="gcount">${esc(plural(g.items.length, word))}</span>${pill}</button></h3>
    <div class="gbody" id="${panel}"${open ? '' : ' hidden'}>${open ? `<ul class="rows" data-rows="dups">${rows}</ul>${notes.map((n) => `<p class="dnote">${n}</p>`).join('')}` : ''}</div>
  </div>`
}

function renderDups() {
  const found = duplicateGroups()
  const all = found.filter((g) => g.items.some(visible))
  const shown = all.filter((g) => chipFilter.dups === 'all' || needsAction(g))
  const note =
    'Skills, agents, or MCP servers of one type that use the same name. Claude Code loads each one that is on. A group needs action when more than one item in it is on.'
  let body
  if (shown.length)
    body = `<h2>Same name <span class="pill">${shown.length}</span><span class="hint">Conflict groups open first.</span></h2><div class="groups">${shown.map(dupGroupHtml).join('')}</div>`
  else if (!found.length) body = empty('No duplicates. Each skill, agent, and MCP server has its own name.')
  else if (all.length) body = empty('No group needs action. In each group, only one item is on.')
  else body = nothingMatches()
  $('p-dups').innerHTML = chipsHtml('dups', all, note) + body
}

async function keepOnly(item) {
  const group = duplicateGroups().find((g) => g.items.includes(item))
  const keys = group ? group.items.filter((i) => i !== item && i.enabled && i.canToggle).map((i) => i.key) : []
  for (const key of keys) {
    const other = items.get(key)
    if (other?.enabled) await toggle(other)
  }
}

function doctorButton(issue) {
  if (issue.target?.page)
    return `<button type="button" class="btn" data-go="${esc(issue.target.page)}">Open ${esc(PAGES[issue.target.page])}</button>`
  if (doctorItem(issue.target)) return '<button type="button" class="btn" data-doc-act="item">Open item</button>'
  if (issue.file) return '<button type="button" class="btn" data-doc-act="file">Open file</button>'
  return ''
}

function doctorRowHtml(issue) {
  const where = [DOC_KIND[issue.kind] ?? issue.kind, issue.file ? tilde(issue.file) : ''].filter(Boolean).join(' · ')
  const label = DOC_SEVERITY.find(([k]) => k === issue.severity)?.[1] ?? issue.severity
  return `<li class="lrow drow" data-doc="${esc(issue.id)}">
    <div class="lead"><span class="lead-ic sev-${esc(issue.severity)}" role="img" aria-label="${esc(label)}">${ICON[issue.severity === 'warning' ? 'warn' : issue.severity]}</span></div>
    <div class="body">
      <div class="l1"><span class="name">${esc(issue.name)}</span><span class="src">${esc(where)}</span></div>
      <p class="desc">${esc(issue.message)}</p>
    </div>
    <div class="tail">${doctorButton(issue)}</div>
  </li>`
}

function renderDoctor() {
  const note = `Doctor reads your config and finds files and items that are broken or that do not do what they say. It never changes a file. <button type="button" class="btn" id="doc-again">Check again</button>`
  if (state.doctor?.error) {
    $('p-doctor').innerHTML = empty(`Doctor could not run: ${state.doctor.error}`)
    return
  }
  const all = doctorIssues().filter(doctorMatches)
  const f = chipFilter.doctor
  const groups = DOC_SEVERITY.filter(([k]) => f === 'all' || f === k)
    .map(([k, title, hint]) => [k, title, hint, all.filter((i) => i.severity === k)])
    .filter(([, , , list]) => list.length)
  let body
  if (groups.length)
    body = groups
      .map(
        ([k, title, hint, list]) =>
          `<h2>${esc(title)} <span class="pill">${list.length}</span><span class="hint">${esc(hint)}</span></h2><ul class="rows" data-rows="doctor-${k}">${list.map(doctorRowHtml).join('')}</ul>`
      )
      .join('')
  else if (!doctorIssues().length)
    body = empty(`No issues found. Doctor checked ${plural(state.doctor?.checked ?? 0, 'file')}.`)
  else if (all.length) body = empty('No issues of this type.')
  else body = nothingMatches()
  $('p-doctor').innerHTML = chipsHtml('doctor', all, note) + body
}

function onDoctor(row, e) {
  const issue = doctorIssues().find((i) => i.id === row.dataset.doc)
  const act = e.target.closest('[data-doc-act]')?.dataset.docAct
  if (!issue || !act) return
  if (act === 'item') {
    const item = doctorItem(issue.target)
    if (item) openDrawer(item)
    return
  }
  guarded(`doc-open-${issue.id}`, async () => {
    try {
      await send('POST', '/api/open', { path: issue.file, app: 'editor' })
      toast(`Opened ${tilde(issue.file)}`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

async function checkAgain() {
  try {
    await refresh()
    toast(`Doctor checked ${plural(state.doctor?.checked ?? 0, 'file')}`)
  } catch (err) {
    toast(`Could not check again: ${err.message}`, true)
  }
}

function tokHtml(n, max, label = tok(n)) {
  const width = max && n ? Math.max(4, (n / max) * 100) : 0
  return `<div class="tok"><span>${esc(label)}</span><span class="mini" aria-hidden="true"><span style="width:${width}%"></span></span></div>`
}

function ctxNote(e, dups) {
  const bits = []
  if (e.type === 'mcp') bits.push('<span class="mchip">Tool names load at start. Not measured.</span>')
  else if (e.item && !e.enabled) bits.push(`<span class="mchip okc">Saves ${tok(e.cost)} while off</span>`)
  else if (e.type === 'rules' && e.conditional) bits.push(`<span class="mchip">On use: ${tok(e.onUse)}</span>`)
  else if (e.item) bits.push(`<span class="mchip">Body on use: ${tok(e.onUse)}</span>`)
  if (dups.has(e.key))
    bits.push(
      `<button type="button" class="mchip btn-plain dupc" data-go="dups">Same name as another ${esc(e.kind === 'mcp' ? 'MCP server' : e.kind)}</button>`
    )
  return `<p class="meta chips-s">${bits.join('')}</p>`
}

function ctxFileRow(e, max, dups) {
  const where = e.scope === 'global' ? 'Global' : 'Project'
  const dir = state.inventory.project?.dir
  const file = dir && e.path.startsWith(dir) ? `.${e.path.slice(dir.length)}` : tilde(e.path)
  const name =
    e.type === 'claudemd'
      ? `<button type="button" class="name btn-plain" data-go="claudemd">${esc(e.name)}</button>`
      : `<span class="name">${esc(e.name)}</span>`
  return `<li class="lrow ctx-file">
    <div class="lead"><span class="lead-ic" role="img" aria-label="${esc(e.type === 'claudemd' ? 'CLAUDE.md file' : 'Rule file')}" title="${esc(tilde(e.path))}">${kindIcon('file', 18)}</span></div>
    <div class="body">
      <div class="l1">${name}<span class="src">${esc(`${where} · ${file}`)}</span></div>
      <p class="desc">${esc(e.description)}</p>
      ${e.conditional ? ctxNote(e, dups) : ''}
    </div>
    ${tokHtml(e.always, max)}
  </li>`
}

function ctxRow(e, max, dups) {
  if (!e.item) return ctxFileRow(e, max, dups)
  const right = e.type === 'mcp' ? tokHtml(0, max, 'not measured') : tokHtml(e.always, max)
  return rowHtml(e.item, 'context', { right, note: ctxNote(e, dups) })
}

function contextBandHtml(list) {
  const total = sumTokens(list)
  const types = CTX_TYPES.map(([type, label, cls]) => ({
    label,
    cls,
    n: sumTokens(list.filter((e) => e.type === type))
  })).filter((t) => t.n)
  const pct = (n) => `${total ? ((n / total) * 100).toFixed(0) : 0}%`
  const top = [...types].sort((a, b) => b.n - a.n)[0]
  const on = (type) => list.filter((e) => e.type === type && e.always).length
  const parts = [
    plural(on('claudemd'), 'CLAUDE.md file'),
    plural(on('rules'), 'rule'),
    plural(on('skills'), 'skill'),
    plural(on('agents'), 'agent')
  ]
  return `<section class="usage" aria-label="Context cost">
      <div>
        <div class="k">Loaded in every session</div>
        <div class="big" id="ctx-total">${total.toLocaleString('en-US')}<small> tokens</small></div>
        <p>Estimate: file bytes ÷ ${TOKEN_BYTES}. Run <code>/context</code> in Claude Code for exact numbers.<br>${esc(parts.join(' · '))} · MCP servers not measured · <code>@path</code> imports not followed</p>
      </div>
      <div class="right">
        <div class="k">By type</div>
        <div class="mon">${top ? esc(top.label) : 'Nothing'}<span>${top ? `${pct(top.n)} of the total` : 'loads at start'}</span></div>
        <div class="bar" role="img" aria-label="${esc(`Context by type: ${types.map((t) => `${t.label} ${pct(t.n)}`).join(', ')}`)}">${types
          .map((t) => `<span class="${t.cls}" style="width:${pct(t.n)}"></span>`)
          .join('')}</div>
        <div class="legend">${types.map((t) => `<span><i class="${t.cls}"></i>${esc(t.label)} ${pct(t.n)}</span>`).join('')}</div>
      </div>
    </section>`
}

function renderContext() {
  const all = contextItems().filter(visible)
  const off = chipFilter.context === 'off'
  const shown = all.filter((e) => keepCtx(e, chipFilter.context))
  const max = Math.max(1, ...all.map((e) => e.always))
  const dups = new Set(duplicateGroups().flatMap((g) => g.items.map((i) => i.key)))
  const note =
    'Sorted by tokens. Switch off a large item to give the context window back. Changes apply at the next session.'
  const body = shown.length
    ? `<h2>${off ? 'Switched off' : 'Biggest items'} <span class="pill">${shown.length}</span><span class="hint">${esc(off ? `${tok(shown.reduce((sum, e) => sum + (e.cost ?? 0), 0))} saved while off` : `${tok(sumTokens(shown))} at session start`)}</span></h2><ul class="rows" data-rows="context">${shown.map((e) => ctxRow(e, max, dups)).join('')}</ul>`
    : all.length
      ? empty('No items match this filter.')
      : nothingMatches()
  $('p-context').innerHTML = contextBandHtml(all) + chipsHtml('context', all, note) + body
}

function catalogBody(page, list) {
  if (!list.length) return empty(`No ${page} found in ~/.claude or ./.claude.`)
  const own = SECTIONS[page]
    .map(([scope, title, hint]) => {
      const shown = list.filter((i) => i.scope === scope && visible(i) && keepChip(page, i))
      if (!shown.length) return ''
      return `<h2>${esc(title)} <span class="pill">${shown.length}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</h2>${rowsHtml(sortRows(shown))}`
    })
    .join('')
  const html = own + (page === 'plugins' || page === 'mods' ? '' : pluginGroupsHtml(page, list))
  if (html) return html
  if (chipFilter[page] !== 'all' && list.some(visible)) return empty(`No ${page} match this filter.`)
  return nothingMatches()
}

function renderCatalog(page, list, note) {
  $(`p-${page}`).innerHTML = chipsHtml(page, list, note) + catalogBody(page, list)
}

function menuButtonFor(key) {
  const page = document.querySelector('.page:not([hidden])')
  return page
    ? ([...page.querySelectorAll('[data-act="menu"]')].find(
        (b) => holderKey(b.closest(HOLDER)) === key && (b.closest('[data-rows]')?.dataset.rows ?? '') === state.menuCtx
      ) ?? null)
    : null
}

function closeMenu(refocus = true) {
  if (!state.menuKey) return
  const btn = refocus ? menuButtonFor(state.menuKey) : null
  state.menuKey = null
  if (btn) btn.focus({ preventScroll: true })
  render()
}

function openMenu(key, ctx = '') {
  state.menuKey = state.menuKey === key && state.menuCtx === ctx ? null : key
  state.menuCtx = ctx
  render()
  if (state.menuKey)
    document.querySelector('.page:not([hidden]) .menu [role="menuitem"]')?.focus({ preventScroll: true })
}

function menuKeys(e) {
  const menu = document.activeElement?.closest?.('.menu')
  if (!menu) return false
  const list = [...menu.querySelectorAll('[role="menuitem"]')]
  const at = list.indexOf(document.activeElement)
  let next = null
  if (e.key === 'ArrowDown') next = list[(at + 1) % list.length]
  else if (e.key === 'ArrowUp') next = list[(at - 1 + list.length) % list.length]
  else if (e.key === 'Home') next = list[0]
  else if (e.key === 'End') next = list[list.length - 1]
  if (!next) return false
  e.preventDefault()
  next.focus()
  return true
}

function reveal(item) {
  const file = item.path
  return guarded(`reveal-${item.key}`, async () => {
    try {
      await send('POST', '/api/open', { path: file, app: 'finder' })
      toast(`Revealed ${tilde(file)} in Finder`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

async function uninstallPlugin(item) {
  const busy = `${item.key}:uninstall`
  if (pending.has(busy)) return
  const parts = pluginParts(item.id)
  const command = `claude plugin uninstall ${item.id} --scope ${cliScope(item.id)}`
  const yes = await ask({
    title: item.missing ? `Remove entry ${item.name}?` : `Uninstall ${item.name}?`,
    message: item.missing
      ? 'The plugin folder is gone. This removes its entry from installed_plugins.json.'
      : `Claude Code stops loading ${parts.length ? `its ${parts.join(', ')}` : 'this plugin'}. You can install it again with /plugin.`,
    ok: item.missing ? 'Remove entry' : 'Uninstall',
    danger: true,
    command
  })
  if (!yes) return
  pending.add(busy)
  try {
    await send('POST', '/api/plugin/uninstall', { id: item.id })
    toast(item.missing ? `Removed entry ${item.id}` : `Uninstalled ${item.id}`)
    await refresh()
  } catch (err) {
    toast(`Could not uninstall ${item.name}: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

function renderNav() {
  const inv = state.inventory
  $('n-skills').textContent = counts(state.catalog.skill).total
  $('n-agents').textContent = counts(state.catalog.agent).total
  $('n-plugins').textContent = counts(state.catalog.plugin).total
  $('n-mods').textContent = counts(state.catalog.mod).total
  $('n-hooks').textContent = otherCounts(inv.hooks).total
  $('n-mcp').textContent = otherCounts(inv.mcp).total
  $('n-dups').textContent = duplicateGroups().filter(needsAction).length
  const docIssues = doctorIssues()
  $('n-doctor').textContent = docIssues.filter((i) => i.severity !== 'info').length
  $('n-doctor').classList.toggle(
    'bad',
    docIssues.some((i) => i.severity === 'error')
  )
  $('n-context').textContent = compact(sumTokens(contextItems().filter(visible)))
  $('n-fav').textContent = favoriteEntries().filter((e) => !e.item || visible(e.item)).length
  for (const b of document.querySelectorAll('#nav button')) {
    if (b.dataset.p === state.page) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  for (const b of document.querySelectorAll('#scope button'))
    b.setAttribute('aria-pressed', String(b.dataset.s === state.scope))
  const project = inv.project.dir ? `<code>${esc(tilde(inv.project.dir))}</code>` : 'off'
  $('ctx').innerHTML = `Project: ${project} · Global: <code>${esc(tilde(inv.global.dir))}</code>`
}

function render() {
  if (!state.inventory) return
  const mark = focusMark()
  renderPage()
  focusRestore(mark)
  syncDrawerHead()
}

function renderPage() {
  renderNav()
  $('title').textContent = PAGES[state.page]
  for (const s of document.querySelectorAll('.page')) s.hidden = s.id !== `p-${state.page}`
  const page = state.page
  if (USAGE_PAGES.has(page)) needUsage()
  if (page === 'dash') renderDash()
  else if (page === 'fav') renderFav()
  else if (page === 'dups') renderDups()
  else if (page === 'doctor') renderDoctor()
  else if (page === 'context') renderContext()
  else if (page === 'skills')
    renderCatalog(
      'skills',
      state.catalog.skill,
      'Off writes <code>"skillOverrides": {"name": "off"}</code> to <code>~/.claude/settings.json</code> (global) or <code>.claude/settings.local.json</code> (project). Plugin skills follow their plugin.'
    )
  else if (page === 'agents')
    renderCatalog(
      'agents',
      state.catalog.agent,
      'Claude Code has no off switch for agents. Off renames <code>name.md</code> to <code>name.md.disabled</code>. Plugin agents follow their plugin.'
    )
  else if (page === 'plugins')
    renderCatalog(
      'plugins',
      state.catalog.plugin,
      'The switch writes <code>enabledPlugins["name@marketplace"]</code>, the same as the <code>/plugin</code> menu.'
    )
  else if (page === 'mods')
    renderCatalog(
      'mods',
      state.catalog.mod,
      'A mod is a plugin with <code>"modules"</code> in <code>hooks/hooks.json</code>. The switch writes <code>enabledPlugins["name@marketplace"]</code>. Mods load only when <code>CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1</code> is set in your shell or settings <code>env</code>.'
    )
  else if (page === 'hooks') renderHooks()
  else if (page === 'mcp') renderMcp()
  else if (page === 'settings') renderSettings()
  else if (page === 'claudemd') renderClaudeMd()
}

function go(page) {
  if (!Object.hasOwn(PAGES, page)) page = 'dash'
  const dirty = state.page === 'claudemd' && page !== 'claudemd' ? mdDirtyKey() : null
  if (dirty) {
    discardMd(dirty).then((yes) => {
      if (yes) show(page)
      else if (location.hash !== '#claudemd') history.replaceState(null, '', `${location.search}#claudemd`)
    })
    return
  }
  show(page)
}

function show(page) {
  state.page = page
  markStale()
  if (location.hash !== `#${page}`) history.replaceState(null, '', `${location.search}#${page}`)
  render()
  window.scrollTo(0, 0)
}

const PROJECT_OFF_NOTE = 'Started from your home folder — project scope is off. Run it inside a project folder.'

function projectOffHtml() {
  return `<div class="warn" role="note">${esc(PROJECT_OFF_NOTE)}</div>`
}

function askReload(file) {
  return ask({
    title: `${baseName(file)} changed on disk`,
    message: 'This file changed on disk. Reload it before you save. Reload discards your unsaved edits.',
    ok: 'Reload (discard mine)',
    danger: true
  })
}

async function loadProjectFiles() {
  if (!state.inventory?.project?.dir) {
    state.projectFiles = null
    return
  }
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(state.inventory.project.dir)}`)
    state.projectFiles = new Set((res.entries ?? []).map((e) => e.name))
  } catch {
    state.projectFiles = null
  }
}

async function refresh() {
  const [inv, doc] = await Promise.all([
    get('/api/inventory'),
    get('/api/doctor').catch((err) => ({ error: err.message }))
  ])
  state.inventory = inv
  state.doctor = doc
  state.catalog = normalize(inv)
  markStale()
  render()
}

function toggleBody(item, enabled) {
  if (item.kind === 'plugin') return { kind: 'plugin', name: item.id, scope: item.scope, enabled }
  if (item.kind === 'hook') {
    if (enabled) return { kind: 'hook', name: item.id, scope: item.scope, enabled }
    return {
      kind: 'hook',
      name: item.command,
      scope: item.scope,
      file: item.file,
      event: item.event,
      index: item.index,
      enabled
    }
  }
  if (item.kind === 'mcp') {
    const body = { kind: 'mcp', name: item.name, scope: item.scope, origin: item.origin, enabled }
    if (item.plugin) body.plugin = item.plugin
    return body
  }
  return { kind: item.kind, name: item.name, scope: item.scope, enabled, plugin: item.plugin }
}

async function toggle(item) {
  const busy = `${item.key}:toggle`
  if (!item.canToggle || pending.has(busy)) return
  pending.add(busy)
  const enabled = !item.enabled
  const body = toggleBody(item, enabled)
  item.enabled = enabled
  render()
  try {
    const res = await send('POST', '/api/toggle', body)
    toast(`Wrote ${tilde(res.file)}${res.backup ? ' · backup saved' : ''}`)
    showBanner()
    await refresh()
    if (item.kind === 'hook' && !drawerOpen()) {
      const moved = state.catalog.hook.find(
        (h) => h.event === item.event && h.command === item.command && h.file === item.file && h.enabled === enabled
      )
      const row = moved
        ? [...document.querySelectorAll('#p-hooks [data-key]')].find((r) => r.dataset.key === moved.key)
        : null
      row?.querySelector('[data-act="toggle"]')?.focus()
    }
  } catch (err) {
    item.enabled = !enabled
    render()
    toast(`Could not switch ${item.name}: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

async function star(body, message) {
  const busy = `${body.kind}:${body.source}:${body.name}:star`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    await send('POST', '/api/favorite', body)
    toast(`${message} · ~/.claude/storehouse.json`)
    await refresh()
  } catch (err) {
    toast(`Could not update favorites: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    loadActivity()
  }
}

function starItem(item, trigger) {
  if (state.favPop && state.favPop.item.key === item.key && state.favPop.trigger === trigger) return closeFavPop()
  openFavPop(item, trigger)
}

const TEXT_EXT = /\.(md|json|txt)$/i

export function drawerOpen() {
  return $('dr').classList.contains('open')
}

function drawerItem() {
  return dr.key ? (items.get(dr.key) ?? null) : null
}

function isDirty() {
  const txt = $('dr-txt')
  return Boolean(drawerOpen() && txt && dr.editable && txt.value !== dr.loaded)
}

const LOCK_WORD = { skill: 'skill', agent: 'agent', hook: 'hook', mcp: 'MCP server' }

function drawerMetaHtml(item) {
  const parts = [`<b class="k">${esc(item.isMod ? 'Mod' : (KIND_WORD[item.kind] ?? item.kind))}</b>`]
  const add = (text, title) => parts.push(`<span${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`)
  if (item.kind === 'plugin') {
    add(item.dev ? 'in development' : item.source === 'plugin' ? item.scope : item.source)
    const version = pluginById(item.id)?.version ?? item.version
    if (version) add(shortVersion(version), version)
    if (item.modules?.length) add(plural(item.modules.length, 'module'), item.modules.join(', '))
    if (item.dev) add(`session ${item.session.slice(0, 8)}`, item.session)
  } else if (isPluginOwned(item)) {
    add(`via plugin ${pluginLabel(ownerId(item))}`)
  } else if (item.scope) {
    add(item.scope)
  }
  if (item.kind === 'agent') {
    if (item.model) add(item.model)
    if (item.tools?.length) add(plural(item.tools.length, 'tool'), item.tools.join(', '))
  }
  if (item.mtime) add(`changed ${ago(item.mtime)}`)
  return parts.join('<i aria-hidden="true"> · </i>')
}

function stateHtml(item) {
  if (hasSwitch(item)) {
    const sw = switchInfo(item)
    const label = `${item.enabled ? 'Switch off' : 'Switch on'} ${item.kind} ${item.name}`
    return `<button type="button" class="sw-pill" role="switch" data-dact="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(label)}" aria-describedby="dr-st-file" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}><span class="sw" aria-hidden="true"></span>${item.enabled ? 'On' : 'Off'}</button><span class="sr-only" id="dr-st-file">${esc(sw.title)}</span>`
  }
  if (item.missing) return '<span class="st-chip bad">Missing</span>'
  if (item.dev) return `<span class="st-chip" title="${esc(switchInfo(item).title)}">Read-only</span>`
  const owner = ownerPlugin(item)
  const on = owner ? owner.enabled : item.enabled !== false
  const title = owner ? ` title="${esc(`Follows the plugin ${owner.name}`)}"` : ''
  return `<span class="st-chip ${on ? 'on' : 'off'}"${title}>${on ? 'On' : 'Off'}</span>`
}

function drawerName(item) {
  if (item.kind === 'hook') return `${item.event} · ${item.matcher}`
  return item.name
}

function drawerMenuEntries(item) {
  if (item.kind === 'hook' || item.kind === 'mcp' || isPluginOwned(item)) return []
  return menuEntries(item).filter(([act]) => act !== 'm-open')
}

function headTools(item) {
  const state = stateHtml(item)
  if (item.kind === 'hook' || item.kind === 'mcp') return state
  const starBtn = item.dev
    ? ''
    : `<button type="button" class="icon-btn star" data-dact="star" aria-haspopup="dialog" aria-pressed="${item.favorite ? 'true' : 'false'}" aria-label="Favorite ${esc(item.name)}">★</button>`
  const entries = drawerMenuEntries(item)
  if (!entries.length) return state + starBtn
  const menu = dr.menu
    ? `<div class="menu" role="menu" id="dr-menu" aria-label="${esc(`More actions for ${item.name}`)}">${entries
        .map(
          ([act, text, danger]) =>
            `${danger ? '<div class="menu-sep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="menu-item${danger ? ' danger' : ''}" data-dact="${act}">${esc(text)}</button>`
        )
        .join('')}</div>`
    : ''
  return `${state}${starBtn}<div class="dr-more"><button type="button" class="icon-btn" data-dact="menu" id="dr-menu-btn" aria-haspopup="menu" aria-expanded="${dr.menu ? 'true' : 'false'}"${dr.menu ? ' aria-controls="dr-menu"' : ''} aria-label="More actions">${ICON.dots}</button>${menu}</div>`
}

function lockHtml(item) {
  const p = ownerPlugin(item)
  const actions = p
    ? `<div class="lock-a">
        <button type="button" class="btn soft" data-dact="plugin-toggle"${p.canToggle ? '' : ' disabled'}>${p.enabled ? 'Switch off plugin' : 'Switch on plugin'}</button>
        <button type="button" class="btn danger" data-dact="plugin-uninstall">Uninstall plugin…</button>
        <button type="button" class="btn-link" data-dact="plugin-open">Open plugin <span aria-hidden="true">→</span></button>
      </div>`
    : ''
  return `<div class="dr-note" role="note">
      <div class="lock-t">${ICON.lock}<p><b>You cannot delete this ${LOCK_WORD[item.kind] ?? item.kind}.</b> It is part of the plugin <b>${esc(pluginLabel(ownerId(item)))}</b>. To remove it, switch off or uninstall the plugin.</p></div>
      ${actions}
    </div>`
}

function noteHtml(item) {
  if (item.kind === 'plugin' && item.missing) {
    return `<div class="dr-note bad" role="note"><div class="lock-t">${ICON.warn}<p><b>Plugin folder missing.</b> ${esc(item.id)} is listed in installed_plugins.json, but its folder is gone. Remove the entry to clean up.</p></div></div>`
  }
  if (item.dev) {
    return `<div class="dr-note" role="note"><div class="lock-t">${ICON.lock}<p><b>Development mod.</b> It is not in installed_plugins.json, so it has no switch here.</p></div></div>`
  }
  return isPluginOwned(item) ? lockHtml(item) : ''
}

function pathHtml() {
  return `<div class="f-path"><code class="path"><bdo dir="ltr" id="dr-path"></bdo></code><button type="button" class="icon-btn sm" data-dact="copy" id="dr-copy" aria-label="Copy path">${ICON.copy}</button></div>`
}

function barHtml(item) {
  const finder = '<button type="button" class="btn" data-dact="finder">Reveal in Finder</button>'
  const editor = '<button type="button" class="btn p" data-dact="editor">Open in editor</button>'
  let left = ''
  let right = finder + editor
  if (item.kind === 'plugin' && item.dev) {
    left = ''
  } else if (item.kind === 'plugin') {
    left = `<button type="button" class="btn danger ghost" data-dact="uninstall">${item.missing ? 'Remove entry…' : 'Uninstall plugin…'}</button>`
    if (item.missing) right = ''
  } else if (isPluginOwned(item)) {
    if (item.kind === 'skill') {
      left = '<span class="bar-hint">Want your own version?</span>'
      right = `${finder}<button type="button" class="btn p" data-dact="fork">Copy to my skills</button>`
    }
  } else if (!item.readOnly) {
    left = '<button type="button" class="btn danger ghost" data-dact="delete">Delete…</button>'
  }
  return `<div class="bar-l">${left}</div><div class="bar-r">${right}</div>`
}

function drawerFocusAct() {
  const el = document.activeElement
  if (!el || !$('dr').contains(el) || ($('dr-body').contains(el) && !$('dr-status')?.contains(el))) return null
  return el.dataset?.dact ?? null
}

function syncDrawerHead() {
  if (!drawerOpen()) return
  const item = drawerItem()
  if (!item) return forceClose()
  const focused = drawerFocusAct()
  $('dr').dataset.kind = item.kind
  $('dr-icon').innerHTML = kindIcon(item.kind)
  $('dr-name').textContent = drawerName(item)
  $('dr-meta').innerHTML = drawerMetaHtml(item)
  $('dr-tools').innerHTML = headTools(item)
  if ($('dr-desc')) $('dr-desc').textContent = item.description || 'No description.'
  if ($('dr-status')) $('dr-status').innerHTML = noteHtml(item)
  $('dr-facts').innerHTML = pathHtml()
  $('dr-bar').innerHTML = barHtml(item)
  if (focused)
    document
      .querySelector(
        `#dr .dr-top [data-dact="${focused}"], #dr-status [data-dact="${focused}"], #dr .dr-bar [data-dact="${focused}"]`
      )
      ?.focus()
  if (item.kind !== 'plugin' && item.path !== dr.mainFile) {
    const wasMain = dr.file === dr.mainFile
    dr.mainFile = item.path
    if (wasMain) dr.file = item.path
  }
  showPath()
}

function closeDrawerMenu(refocus) {
  if (!dr.menu) return
  dr.menu = false
  syncDrawerHead()
  if (refocus) $('dr-menu-btn')?.focus()
}

function showPath() {
  const box = $('dr-path')
  if (!box) return
  box.textContent = dr.file ? tilde(dr.file) : dr.root ? tilde(dr.root) : ''
  box.parentElement.title = box.textContent
}

function tabsHtml(tabs) {
  return `<div class="tabwrap"><div class="tabs" role="tablist" aria-label="Drawer views">${tabs
    .map(
      ([id, label]) =>
        `<button type="button" role="tab" id="tab-${id}" data-tab="${id}" aria-controls="pane-${id}" aria-selected="${dr.tab === id ? 'true' : 'false'}">${esc(label)}</button>`
    )
    .join('')}</div></div>`
}

const FMT = [
  ['bold', 'B', 'Bold (Cmd+B)'],
  ['italic', 'I', 'Italic (Cmd+I)'],
  ['heading', 'H', 'Heading'],
  null,
  ['ul', '•', 'Bulleted list'],
  ['ol', '1.', 'Numbered list'],
  ['quote', '❝', 'Quote'],
  null,
  ['code', '&lt;/&gt;', 'Code'],
  ['link', '[ ]( )', 'Link']
]

function drEditorHtml({ own, placeholder = '' }) {
  const fmt = FMT.map((f) =>
    f
      ? `<button type="button" class="fmt-${f[0]}" data-dact="fmt" data-fmt="${f[0]}" title="${f[2]}" aria-label="${f[2]}">${f[1]}</button>`
      : '<span class="sep" aria-hidden="true"></span>'
  ).join('')
  const bar = own
    ? `<div class="edbar" role="toolbar" aria-label="Format">
        <div class="fmt" id="dr-fmt">${fmt}</div>
        <span class="grow"></span>
        <span class="dirty" id="dr-dirty" aria-live="polite"></span>
        <button type="button" class="btn p" data-dact="save" id="dr-save" disabled>Save</button>
      </div>`
    : ''
  return `${bar}<div class="ed${own ? ' has-bar' : ''}">
      <pre class="ed-hl" id="dr-hl" aria-hidden="true"></pre>
      <textarea id="dr-txt" spellcheck="false" aria-label="File contents"${placeholder ? ` placeholder="${esc(placeholder)}" readonly` : ''}></textarea>
    </div>`
}

function fileBodyHtml(item, withFiles) {
  const own = !item.readOnly && !isPluginOwned(item)
  const tabs = [
    ['preview', 'Preview'],
    ['file', own ? 'Edit' : 'Source (read-only)']
  ]
  if (withFiles) tabs.push(['files', 'Files'])
  if (own) tabs.push(['backups', 'Backups'])
  return `${tabsHtml(tabs)}
    <div class="pane md" id="pane-preview" role="tabpanel" aria-labelledby="tab-preview">
      <p class="dr-desc" id="dr-desc"></p>
      <div class="dr-notes" id="dr-status"></div>
      <div id="dr-prev"></div>
    </div>
    <div class="pane" id="pane-file" role="tabpanel" aria-labelledby="tab-file" hidden>
      <div class="filebar">
        <code id="dr-file"></code>
        <button type="button" class="btn" data-dact="main" id="dr-main" hidden>Back to ${esc(baseName(dr.mainFile))}</button>
      </div>
      ${drEditorHtml({ own })}
      <p class="note" id="dr-note"></p>
    </div>
    ${withFiles ? '<div class="pane" id="pane-files" role="tabpanel" aria-labelledby="tab-files" hidden></div>' : ''}
    ${own ? '<div class="pane" id="pane-backups" role="tabpanel" aria-labelledby="tab-backups" hidden></div>' : ''}`
}

function ovOn(x) {
  const on = ownerPlugin(x)?.enabled ?? true
  return x.kind === 'mcp' ? on && x.enabled !== false : on
}

function ovState(x) {
  return ovOn(x) ? '<span class="badge on">On</span>' : '<span class="badge off">Off</span>'
}

function ovCard(item, desc) {
  return `<li><button type="button" class="ov-card${ovOn(item) ? '' : ' off'}" data-dact="sub" data-key="${esc(item.key)}">
      <span class="cb"><span class="cn">${esc(item.name)}</span>${desc ? `<span class="cd">${esc(desc)}</span>` : ''}</span>
      ${ovState(item)}${ICON.chev}
    </button></li>`
}

function ovSection(id, kind, label, count, body, none) {
  return `<section class="ov-sec" id="ov-${id}" aria-labelledby="ov-${id}-h">
      <h3 id="ov-${id}-h">${kindIcon(kind, 18)}${esc(label)} <span class="n">${count}</span></h3>
      ${count ? body : `<p class="ov-empty">${esc(none)}</p>`}
    </section>`
}

function ovHooksHtml(hooks) {
  const info = new Map(HOOK_INFO)
  const byEvent = new Map()
  for (const h of hooks) {
    if (!byEvent.has(h.event)) byEvent.set(h.event, [])
    byEvent.get(h.event).push(h)
  }
  return [...byEvent]
    .map(
      ([event, list]) => `<div class="ov-ev">
        <div class="ov-ev-h"><b>${esc(event)}</b><span>${esc(info.get(event) ?? 'Claude Code event.')}</span></div>
        <ul>${list
          .map((h) => {
            const runs = hookRunsFor(h)
            return `<li><button type="button" class="btn-plain ov-ev-r" data-dact="sub" data-key="${esc(h.key)}"><span class="what">${esc(hookLabel(h))}</span>${runs ? `<span class="mchip">${esc(runs)}</span>` : ''}${ovState(h)}</button></li>`
          })
          .join('')}</ul>
      </div>`
    )
    .join('')
}

function pluginBodyHtml(item) {
  const mine = (list) => list.filter((x) => x.plugin === item.id)
  const skills = mine(state.catalog.skill)
  const agents = mine(state.catalog.agent)
  const hooks = mine(state.catalog.hook)
  const mcp = mine(state.catalog.mcp)
  const tabs = item.missing
    ? [['overview', 'Overview']]
    : [
        ['overview', 'Overview'],
        ['files', 'Files'],
        ['file', 'File']
      ]
  const tile = (id, n, label) =>
    `<button type="button" class="ov-tile${n ? '' : ' zero'}" data-dact="jump" data-to="ov-${id}"><b>${n}</b><span>${esc(label)}</span></button>`
  const cards = (list, desc) => `<ul class="ov-cards">${list.map((x) => ovCard(x, desc(x))).join('')}</ul>`
  return `${tabsHtml(tabs)}
    <div class="pane ov" id="pane-overview" role="tabpanel" aria-labelledby="tab-overview">
      <p class="dr-desc" id="dr-desc"></p>
      <div class="dr-notes" id="dr-status"></div>
      ${
        item.modules?.length
          ? ovSection(
              'modules',
              'plugin',
              'Modules',
              item.modules.length,
              `<ul class="mini">${item.modules.map((m) => `<li><code>${esc(m)}</code></li>`).join('')}</ul><p class="ov-empty">Claude Code loads these modules only when <code>CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1</code>.</p>`,
              ''
            )
          : ''
      }
      <div class="ov-tiles">
        ${tile('skills', skills.length, 'Skills')}${tile('agents', agents.length, 'Agents')}${tile('hooks', hooks.length, 'Hooks')}${tile('mcp', mcp.length, 'MCP servers')}
      </div>
      ${item.dev ? '' : `<p class="ov-lock">${ICON.lock}<span>Everything in this plugin follows the plugin switch. Plugin files are read-only. To edit a skill, open it and use <b>Copy to my skills</b>.</span></p>`}
      ${ovSection(
        'skills',
        'skill',
        'Skills',
        skills.length,
        cards(skills, (s) => s.description),
        'This plugin adds no skills.'
      )}
      ${ovSection(
        'agents',
        'agent',
        'Agents',
        agents.length,
        cards(agents, (a) => a.description),
        'This plugin adds no agents.'
      )}
      ${ovSection('hooks', 'hook', 'Hooks', hooks.length, ovHooksHtml(hooks), 'This plugin adds no hooks.')}
      ${ovSection(
        'mcp',
        'mcp',
        'MCP servers',
        mcp.length,
        cards(mcp, (m) => `${mcpTransport(m)} · ${m.description}`),
        'This plugin adds no MCP servers.'
      )}
    </div>
    <div class="pane" id="pane-files" role="tabpanel" aria-labelledby="tab-files" hidden></div>
    <div class="pane" id="pane-file" role="tabpanel" aria-labelledby="tab-file" hidden>
      <div class="filebar"><code id="dr-file"></code></div>
      ${drEditorHtml({ own: false, placeholder: 'Pick a file in the Files tab.' })}
    </div>`
}

function setTab(tab) {
  dr.tab = tab
  for (const b of $('dr-body').querySelectorAll('[data-tab]'))
    b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  for (const pane of $('dr-body').querySelectorAll('.pane')) pane.hidden = pane.id !== `pane-${tab}`
  if (tab === 'preview') paintPreview()
  if (tab === 'files') loadDir(dr.dir ?? dr.root)
  if (tab === 'backups') loadBackups()
}

function paintPreview() {
  const hide = dr.file === dr.mainFile ? ['name', 'description'] : []
  $('dr-desc').hidden = dr.file !== dr.mainFile
  $('dr-prev').innerHTML = previewHtml($('dr-txt').value, dr.file, hide)
}

function paintEditor() {
  const hl = $('dr-hl')
  const txt = $('dr-txt')
  if (!hl || !txt) return
  hl.innerHTML = highlight(txt.value, dr.file)
  hl.scrollTop = txt.scrollTop
  const fmt = $('dr-fmt')
  if (fmt) fmt.hidden = !dr.editable || !isMd(dr.file)
}

function formatText(kind) {
  const txt = $('dr-txt')
  if (!txt || txt.readOnly || !isMd(dr.file)) return
  const wraps = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], link: ['[', '](https://)'] }
  const prefixes = { heading: '## ', ul: '- ', ol: '1. ', quote: '> ' }
  const { selectionStart: s, selectionEnd: e, value } = txt
  if (wraps[kind]) {
    const [a, b] = wraps[kind]
    const sel = value.slice(s, e) || (kind === 'link' ? 'link text' : 'text')
    insertText(txt, a + sel + b)
    txt.setSelectionRange(s + a.length, s + a.length + sel.length)
    return
  }
  const p = prefixes[kind]
  if (!p) return
  const start = value.lastIndexOf('\n', s - 1) + 1
  txt.setSelectionRange(start, start)
  insertText(txt, p)
  txt.setSelectionRange(s + p.length, e + p.length)
}

function onEditorInput() {
  updateDirty()
  if (dr.tab === 'preview') paintPreview()
}

function updateDirty() {
  paintEditor()
  const dirty = isDirty()
  const mark = $('dr-dirty')
  if (mark) mark.textContent = dirty ? '● unsaved' : ''
  const save = $('dr-save')
  if (save) save.disabled = !dirty || !dr.editable
}

function noteText(item) {
  if (item.kind === 'plugin') return ''
  if (item.readOnly) {
    return item.kind === 'skill'
      ? 'Plugin files are read-only. Use Copy to my skills to edit a copy in ~/.claude/skills.'
      : 'Plugin files are read-only.'
  }
  if (!dr.editable) return 'This file is shown read-only. Only .md, .json, and .txt files can be edited here.'
  return 'Save writes the file and a backup to ~/.claude/backups/storehouse/.'
}

async function loadFile(file, { main = false } = {}) {
  const item = drawerItem()
  if (!item) return
  const seq = ++dr.seq
  const txt = $('dr-txt')
  txt.value = 'Loading…'
  txt.readOnly = true
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(file)}`)
    if (seq !== dr.seq) return
    if (res.entries) throw new Error(`${file} is a folder`)
    dr.file = file
    dr.loaded = res.content ?? ''
    dr.stamp = res.stamp
    dr.editable = item.kind !== 'plugin' && !item.readOnly && !res.readOnly && (main || TEXT_EXT.test(file))
    txt.value = dr.loaded
    txt.readOnly = !dr.editable
  } catch (err) {
    if (seq !== dr.seq) return
    dr.file = file
    dr.loaded = ''
    dr.editable = false
    txt.value = `Could not read this file: ${err.message}`
  }
  $('dr-file').textContent = relTo(dr.root, dr.file)
  const back = $('dr-main')
  if (back) back.hidden = dr.file === dr.mainFile
  const note = $('dr-note')
  if (note) note.textContent = noteText(item)
  if (dr.tab === 'backups') loadBackups()
  showPath()
  updateDirty()
  if (dr.tab === 'preview') paintPreview()
}

async function loadDir(dir) {
  const pane = $('pane-files')
  if (!pane || !dir) return
  dr.dir = dir
  const seq = dr.seq
  pane.innerHTML = '<p class="note">Loading…</p>'
  try {
    const res = await get(`/api/file?path=${encodeURIComponent(dir)}`)
    if (seq !== dr.seq || dr.dir !== dir) return
    const up =
      dir !== dr.root
        ? `<li><button type="button" class="btn-plain name" data-dact="dir" data-path="${esc(parentDir(dir))}">../</button><span class="note">up one folder</span></li>`
        : ''
    const rows = (res.entries ?? [])
      .map((e) => {
        const full = `${dir}/${e.name}`
        const act = e.type === 'dir' ? 'dir' : 'open-file'
        return `<li><button type="button" class="btn-plain name" data-dact="${act}" data-path="${esc(full)}">${esc(e.name)}${e.type === 'dir' ? '/' : ''}</button><span class="note">${e.type === 'dir' ? 'folder' : esc(fmtSize(e.size))}</span></li>`
      })
      .join('')
    pane.innerHTML = `<p class="note"><code>${esc(tilde(dir))}</code></p><ul class="mini">${up}${rows || '<li class="note">Empty folder.</li>'}</ul>`
  } catch (err) {
    pane.innerHTML = `<p class="note">${esc(`Could not list this folder: ${err.message}`)}</p>`
  }
}

async function loadBackups() {
  const box = $('pane-backups')
  const file = dr.file
  if (!box || !file) return
  const seq = dr.seq
  box.innerHTML = '<p class="note">Loading backups…</p>'
  try {
    const res = await get(`/api/backups?path=${encodeURIComponent(file)}`)
    if (seq !== dr.seq || dr.file !== file || dr.tab !== 'backups') return
    box.innerHTML = `<p class="note">Backups of <code>${esc(relTo(dr.root, file))}</code></p>${backupsListHtml(res.backups ?? [], 'data-dact="restore"', dr.editable, 'dr')}`
  } catch (err) {
    box.innerHTML = `<p class="note">${esc(`Could not list backups: ${err.message}`)}</p>`
  }
}

function backupsListHtml(list, attrs, canRestore, prefix) {
  if (!list.length) return '<p class="note">No backups for this file yet. Each save writes one.</p>'
  return `<ul class="mini">${list
    .map(
      (b, i) =>
        `<li><span class="when">${esc(b.time ? new Date(b.time).toLocaleString() : baseName(b.path))}</span><button type="button" class="btn" id="${prefix}-rs-${i}" ${attrs} data-path="${esc(b.path)}"${canRestore ? '' : ' disabled'}>Restore</button></li>`
    )
    .join('')}</ul><p class="note">Newest first.</p>`
}

function openerKey(item) {
  const el = document.activeElement
  if (el && $('dr').contains(el) && dr.opener) return dr.opener
  const usable = el && el !== document.body && !$('dr').contains(el)
  return { key: (usable && cardKey(el)) || item.key, el: usable ? el : null }
}

function openDrawer(item) {
  dr.opener = openerKey(item)
  dr.key = item.key
  dr.kind = item.kind
  dr.seq++
  dr.menu = false
  dr.dir = null
  dr.loaded = ''
  dr.editable = false
  if (item.kind === 'plugin') {
    dr.mainFile = null
    dr.root = item.path
    dr.file = null
    dr.tab = 'overview'
    $('dr-body').innerHTML = pluginBodyHtml(item)
  } else if (item.kind === 'hook' || item.kind === 'mcp') {
    dr.mainFile = item.path
    dr.root = null
    dr.file = item.path
    dr.tab = 'json'
    $('dr-body').innerHTML = jsonBodyHtml(item)
  } else {
    dr.mainFile = item.path
    dr.root = isFolderSkill(item) ? parentDir(item.path) : null
    dr.file = item.path
    dr.tab = 'preview'
    $('dr-body').innerHTML = fileBodyHtml(item, isFolderSkill(item))
  }
  const txt = $('dr-txt')
  if (txt) {
    txt.addEventListener('input', onEditorInput)
    txt.addEventListener('scroll', () => {
      if ($('dr-hl')) $('dr-hl').scrollTop = txt.scrollTop
    })
  }
  const box = $('dr')
  box.classList.add('open')
  box.setAttribute('aria-hidden', 'false')
  box.inert = false
  document.querySelector('.app').inert = true
  $('dr-scrim').hidden = false
  syncDrawerHead()
  setTab(dr.tab)
  if (item.kind !== 'plugin' && item.kind !== 'hook' && item.kind !== 'mcp') loadFile(item.path, { main: true })
  $('dr-close').focus()
}

function forceClose() {
  const box = $('dr')
  if (!box.classList.contains('open')) return
  box.classList.remove('open')
  box.setAttribute('aria-hidden', 'true')
  box.inert = true
  document.querySelector('.app').inert = false
  $('dr-scrim').hidden = true
  dr.seq++
  dr.key = null
  dr.menu = false
  const opener = dr.opener
  dr.opener = null
  let target = null
  if (opener?.key) {
    const page = document.querySelector('.page:not([hidden])')
    const holder = [...(page?.querySelectorAll(HOLDER) ?? [])].find((h) => holderKey(h) === opener.key)
    target = holder?.querySelector('[data-act="open"]') ?? null
  }
  if (!target && opener?.el && document.contains(opener.el)) target = opener.el
  ;(target ?? $('title')).focus()
}

async function closeDrawer() {
  if (!drawerOpen()) return
  if (isDirty()) {
    const discard = await ask({
      title: 'Discard changes?',
      message: `You have unsaved edits in ${baseName(dr.file)}. Close and lose them?`,
      ok: 'Discard',
      danger: true
    })
    if (!discard) return
  }
  forceClose()
}

async function confirmLeaveFile() {
  if (!isDirty()) return true
  return ask({
    title: 'Discard changes?',
    message: `You have unsaved edits in ${baseName(dr.file)}. Open another file and lose them?`,
    ok: 'Discard',
    danger: true
  })
}

async function guarded(name, fn) {
  const busy = `${dr.key}:${name}`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    await fn()
  } finally {
    pending.delete(busy)
  }
}

function saveFile() {
  return guarded('save', async () => {
    if (!dr.editable || !isDirty()) return
    const file = dr.file
    const seq = dr.seq
    const sent = $('dr-txt').value
    try {
      const res = await send('PUT', '/api/file', { path: file, content: sent, stamp: dr.stamp ?? null })
      if (seq === dr.seq && dr.file === file) {
        dr.loaded = res.content
        dr.stamp = res.stamp
        if ($('dr-txt').value === sent) $('dr-txt').value = res.content
        updateDirty()
        if (dr.tab === 'backups') loadBackups()
      }
      toast('Saved · backup written')
      await refresh().catch(() => {})
    } catch (err) {
      if (err.status === 409) {
        toast(`Not saved: ${baseName(file)} changed on disk. Reload it before you save.`, true)
        if (await askReload(file)) {
          if (seq === dr.seq && dr.file === file) await loadFile(file, { main: file === dr.mainFile })
        }
        return
      }
      toast(`Could not save ${baseName(file)}: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

function openIn(app) {
  const file = dr.file ?? dr.root
  return guarded(`open-${app}`, async () => {
    try {
      await send('POST', '/api/open', { path: file, app })
      toast(app === 'editor' ? `Opened ${tilde(file)} in your editor` : `Revealed ${tilde(file)} in Finder`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

async function copyPath() {
  const text = dr.file ?? dr.root ?? ''
  try {
    await navigator.clipboard.writeText(text)
    toast('Path copied')
  } catch {
    const range = document.createRange()
    range.selectNodeContents($('dr-path'))
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    toast('Path selected · press Cmd+C to copy')
  }
}

function deleteItem() {
  const item = drawerItem()
  if (!item || item.readOnly || item.kind === 'plugin') return
  const target = isFolderSkill(item) ? parentDir(item.path) : item.path
  return guarded('delete', async () => {
    const yes = await ask({
      title: `Delete ${item.kind} ${item.name}?`,
      message: `${tilde(target)} moves to ~/.claude/backups/storehouse/trash. You can move it back from there.`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('DELETE', '/api/file', { path: target })
      forceClose()
      toast(`Moved to ${tilde(res.trashPath ?? 'trash')}`)
      await refresh().catch(() => {})
      if (!document.activeElement || document.activeElement === document.body) $('title').focus()
    } catch (err) {
      toast(`Could not delete ${item.name}: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

function forkItem() {
  const item = drawerItem()
  if (!item || item.kind !== 'skill' || item.scope !== 'plugin') return
  const name = baseName(parentDir(item.path))
  return guarded('fork', async () => {
    try {
      const res = await send('POST', '/api/fork', { name, plugin: item.plugin })
      toast(`Copied to ${tilde(res.path)}`)
      await refresh().catch(() => {})
    } catch (err) {
      if (err.status === 409) toast(`${name} already exists in ~/.claude/skills. Open it from the Skills page.`, true)
      else toast(`Could not copy ${name}: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

function restoreBackupFile(backup) {
  const file = dr.file
  return guarded('restore', async () => {
    const yes = await ask({
      title: 'Restore this backup?',
      message: `${tilde(file)} is replaced with the backup. The current file is backed up first.${isDirty() ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Restore',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('POST', '/api/restore', { backup, path: file })
      if (dr.file === file) {
        dr.loaded = res.content
        dr.stamp = res.stamp
        $('dr-txt').value = res.content
        updateDirty()
        setTab('file')
        $('dr-txt').focus()
      }
      toast(`Restored ${baseName(file)} from backup`)
      await refresh().catch(() => {})
    } catch (err) {
      toast(`Could not restore: ${err.message}`, true)
    } finally {
      loadActivity()
    }
  })
}

async function onDrawerClick(e) {
  if (dr.menu && !e.target.closest('#dr-menu, [data-dact="menu"]')) closeDrawerMenu(false)
  const tab = e.target.closest('[data-tab]')
  if (tab) return setTab(tab.dataset.tab)
  const b = e.target.closest('[data-dact]')
  if (!b || b.disabled) return
  const act = b.dataset.dact
  const item = drawerItem()
  if (!item) return
  if (act === 'menu') {
    dr.menu = !dr.menu
    syncDrawerHead()
    if (dr.menu) $('dr-menu')?.querySelector('[role="menuitem"]')?.focus()
    return
  }
  if (act.startsWith('m-')) {
    closeDrawerMenu(true)
    if (act === 'm-toggle') return void toggle(item)
    if (act === 'm-finder') return void reveal(item)
    if (act === 'm-uninstall') return void uninstallPlugin(item)
    return
  }
  const owner = ownerPlugin(item)
  if (act === 'toggle') return void toggle(item)
  if (act === 'star') return void starItem(item, b)
  if (act === 'copy') return void copyPath()
  if (act === 'uninstall') return void uninstallPlugin(item)
  if (act === 'plugin-toggle' && owner) return void toggle(owner)
  if (act === 'plugin-uninstall' && owner) return void uninstallPlugin(owner)
  if (act === 'plugin-open' && owner) return openDrawer(owner)
  if (act === 'save') return void saveFile()
  if (act === 'fmt') return formatText(b.dataset.fmt)
  if (act === 'jump') return $(b.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (act === 'editor' || act === 'finder') return void openIn(act)
  if (act === 'delete') return void (item.kind === 'hook' || item.kind === 'mcp' ? deleteRow(item) : deleteItem())
  if (act === 'fork') return void forkItem()
  if (act === 'restore') return void restoreBackupFile(b.dataset.path)
  if (act === 'dir') return void loadDir(b.dataset.path)
  if (act === 'sub') {
    const sub = items.get(b.dataset.key)
    if (sub) openDrawer(sub)
    return
  }
  if (act === 'main' || act === 'open-file') {
    if (!(await confirmLeaveFile())) return
    const file = act === 'main' ? dr.mainFile : b.dataset.path
    setTab('file')
    await loadFile(file, { main: file === dr.mainFile })
    $('dr-txt').focus()
  }
}

const SET_WHERE = { sg: 'every project', sp: 'this folder · in git', sl: 'this folder · only you' }

const SET_ABOUT = {
  sg: 'This file applies to every project on this computer.',
  sp: 'This file is for the team. It goes into git with the project.',
  sl: 'This file is only for you. Git ignores it. Storehouse writes your on/off switches for this folder here.'
}

async function busy(name, fn) {
  if (pending.has(name)) return
  pending.add(name)
  try {
    await fn()
  } finally {
    pending.delete(name)
  }
}

async function afterWrite() {
  await loadProjectFiles()
  try {
    await refresh()
  } catch {
    render()
  }
  loadActivity()
}

function invalidAttr(form, field) {
  return cfg[form].invalid === field ? ' aria-invalid="true"' : ''
}

function rowSwitch(item, label) {
  const sw = switchInfo(item)
  const text = item.enabled ? 'Switch off' : 'Switch on'
  return `<span class="sw-wrap">${sw.text ? `<span class="via" title="${esc(sw.title)}">${esc(sw.text)}</span>` : ''}<button type="button" class="sw" role="switch" data-act="toggle" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(`${text} ${label}`)}" title="${esc(sw.title)}"${sw.disabled ? ' disabled' : ''}></button></span>`
}

function cellSwitch(item, label) {
  if (item.plugin && !item.canToggle) {
    const sw = switchInfo(item)
    return `<span class="lead-ic" role="img" aria-label="${esc(sw.title)}" title="${esc(sw.title)}">${ICON.lock}</span>`
  }
  return rowSwitch(item, label)
}

function viaPlugin(item) {
  const name = pluginLabel(item.plugin)
  return `<span class="via-lock" title="${esc(`Follows the plugin ${name}. Switch or uninstall it on the Plugins page.`)}">${ICON.lock}<span>via plugin ${esc(name)}</span></span>`
}

function pageBar(note, actions) {
  return `<div class="pagebar"><p class="note">${note}</p><div class="pb-a">${actions}</div></div>`
}

function addButton(name, label) {
  const open = cfg[name].open
  const id = name === 'hook' ? 'hf' : 'mf'
  return `<button type="button" class="btn${open ? '' : ' p'}" id="${id}-open" data-c="${id}-open" aria-expanded="${open}" aria-controls="${name}-form">${open ? 'Close form' : label}</button>`
}

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

function renderHooks() {
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

function formFail(form, field, message, focusId) {
  cfg[form].error = message
  cfg[form].invalid = field
  render()
  $(focusId)?.focus()
}

function submitHook() {
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

function mcpRowHtml(m, counts) {
  const label = `MCP server ${m.name}`
  const target = m.command ?? m.url ?? ''
  const keys = [
    ...Object.keys(isPlain(m.config?.env) ? m.config.env : {}).map((k) => `env ${k}`),
    ...Object.keys(isPlain(m.config?.headers) ? m.config.headers : {}).map((k) => `header ${k}`)
  ]
  const off = m.canToggle && !m.enabled
  const canDelete = !m.plugin && ['user', 'local', 'mcpjson'].includes(m.origin)
  const del = canDelete
    ? `<button type="button" class="btn danger ghost" data-act="del" aria-label="${esc(`Delete ${label}`)}">Delete</button>`
    : ''
  const others = state.catalog.mcp.filter((o) => o.name === m.name && o.key !== m.key).map((o) => o.source)
  const dup =
    counts.get(m.name) > 1
      ? `<span class="flag" title="${esc(`Also from: ${others.join(', ')}`)}">${esc(`Name used ${counts.get(m.name)} times`)}</span>`
      : ''
  const source = m.plugin
    ? `${viaPlugin(m)}<span class="src">${esc(`Claude Code name: plugin:${pluginLabel(m.plugin)}:${m.name}`)}</span>`
    : `<span class="tags">${scopeTag(m.scope)}<span class="src">${esc(m.source)}</span></span>`
  const cls = ['lrow', 'mrow', off ? 'off' : '', m.plugin ? 'locked' : ''].filter(Boolean).join(' ')
  return `<li class="${cls}" data-key="${esc(m.key)}">
    <div class="lead">${cellSwitch(m, label)}</div>
    <div class="body">
      <div class="l1"><button type="button" class="name btn-plain" data-act="open" aria-label="${esc(`Show ${label}`)}">${esc(m.name)}</button><span class="mchip">${esc(mcpTransport(m))}</span>${off ? '<span class="flag">Off</span>' : ''}${useFlag(m)}${dup}</div>
      ${target ? `<code class="one-line" title="${esc(target)}">${esc(target)}</code>` : ''}
      <div class="meta-row">${source}${keys.map((k) => `<span class="mchip key">${esc(k)}</span>`).join('')}${useChips(m)}</div>
    </div>
    <div class="tail">${del}</div>
  </li>`
}

function renderMcp() {
  const list = state.catalog.mcp.filter((m) => visible(m) && keepChip('mcp', m))
  const counts = new Map()
  for (const m of state.catalog.mcp) counts.set(m.name, (counts.get(m.name) ?? 0) + 1)
  const sections = [
    ['global', 'Global', 'From ~/.claude.json. Claude Code loads them in every folder.'],
    ['project', 'Project', 'From ./.mcp.json or this folder in ~/.claude.json.'],
    ['plugin', 'From plugins', 'They follow their plugin. The switch turns a server off for this folder only.']
  ]
  const html = sections
    .map(([scope, title, hint]) => {
      const shown = list.filter((m) => (scope === 'plugin' ? m.scope === 'plugin' : m.scope === scope))
      if (!shown.length) return ''
      return `<h2>${esc(title)} <span class="pill">${shown.length}</span><span class="hint">${esc(hint)}</span></h2><ul class="rows">${sortRows(
        shown
      )
        .map((m) => mcpRowHtml(m, counts))
        .join('')}</ul>`
    })
    .join('')
  const body = !state.catalog.mcp.length
    ? empty('No MCP servers in ~/.claude.json, .mcp.json, or plugins.')
    : html ||
      (chipFilter.mcp !== 'all' && state.catalog.mcp.some(visible)
        ? empty('No MCP servers match this filter.')
        : nothingMatches())
  const bar = pageBar(
    'An MCP server gives Claude extra tools. A local server runs as a process on your computer. A remote server is a URL. Changes apply at the next Claude Code session.',
    addButton('mcp', 'Add MCP server')
  )
  $('p-mcp').innerHTML = `${bar}${mcpFormHtml()}${chipsHtml('mcp', state.catalog.mcp, '')}${body}`
}

function mcpFormHtml() {
  const f = cfg.mcp
  if (!f.open) return ''
  const stdio = f.transport === 'stdio'
  const target = stdio
    ? `<label for="mf-command">Command (required)</label>
    <input id="mf-command" data-f="mcp.command" value="${esc(f.command)}" placeholder="npx" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="mf-err"${invalidAttr('mcp', 'command')}>
    <label for="mf-args">Arguments</label>
    <input id="mf-args" data-f="mcp.args" value="${esc(f.args)}" placeholder="-y @modelcontextprotocol/server-github" autocomplete="off" spellcheck="false">
    <label for="mf-env">Env (KEY=VALUE per line)</label>
    <textarea id="mf-env" data-f="mcp.env" rows="3" spellcheck="false" placeholder="GITHUB_TOKEN=..." aria-describedby="mf-err"${invalidAttr('mcp', 'env')}>\n${esc(f.env)}</textarea>`
    : `<label for="mf-url">URL (required)</label>
    <input id="mf-url" data-f="mcp.url" value="${esc(f.url)}" placeholder="https://example.com/mcp" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="mf-err"${invalidAttr('mcp', 'url')}>`
  return `<form class="form" id="mcp-form" novalidate aria-labelledby="mf-title">
    <div class="form-head"><h3 id="mf-title">Add MCP server</h3><p class="note">Global writes <code>~/.claude.json</code>. Project writes <code>./.mcp.json</code>. A backup is made first.</p></div>
    <label for="mf-scope">Scope</label>
    <select id="mf-scope" data-f="mcp.scope">${opt('global', 'Global · ~/.claude.json', f.scope)}${projectOn() ? opt('project', 'Project · .mcp.json', f.scope) : ''}</select>
    <label for="mf-name">Name (required)</label>
    <input id="mf-name" data-f="mcp.name" value="${esc(f.name)}" placeholder="github" autocomplete="off" spellcheck="false" aria-required="true" aria-describedby="mf-err"${invalidAttr('mcp', 'name')}>
    <label for="mf-transport">Transport</label>
    <select id="mf-transport" data-f="mcp.transport">${['stdio', 'http', 'sse'].map((t) => opt(t, t, f.transport)).join('')}</select>
    ${target}
    <div class="form-actions"><button type="submit" class="btn p" id="mf-save">Save server</button><button type="button" class="btn" id="mf-cancel" data-c="mf-cancel">Cancel</button></div>
    <p class="form-err" id="mf-err" role="alert">${esc(f.error)}</p>
  </form>`
}

function submitMcp() {
  return busy('mcp-add', async () => {
    const f = cfg.mcp
    f.error = ''
    f.invalid = ''
    const name = f.name.trim()
    if (!name) return formFail('mcp', 'name', 'Enter a server name.', 'mf-name')
    if (!/^[A-Za-z0-9_.@-]+$/.test(name))
      return formFail('mcp', 'name', 'Use only letters, digits, dot, dash, at, or underscore in the name.', 'mf-name')
    let config
    if (f.transport === 'stdio') {
      const command = f.command.trim()
      if (!command) return formFail('mcp', 'command', 'Enter the command that starts the server.', 'mf-command')
      const parsed = parseEnv(f.env)
      if (parsed.error) return formFail('mcp', 'env', parsed.error, 'mf-env')
      config = { type: 'stdio', command }
      const args = f.args.trim() ? f.args.trim().split(/\s+/) : []
      if (args.length) config.args = args
      if (Object.keys(parsed.env).length) config.env = parsed.env
    } else {
      const url = f.url.trim()
      if (!/^https?:\/\/\S+$/.test(url))
        return formFail('mcp', 'url', 'Enter a URL that starts with http:// or https://.', 'mf-url')
      config = { type: f.transport, url }
    }
    try {
      const res = await send('POST', '/api/mcp', { scope: f.scope, name, config })
      cfg.mcp = freshMcpForm()
      toast(`Added MCP server ${name} · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
      $('mf-open')?.focus()
    } catch (err) {
      formFail(
        'mcp',
        err.status === 409 ? 'name' : '',
        `Could not add the server: ${err.message}`,
        err.status === 409 ? 'mf-name' : 'mf-save'
      )
    }
  })
}

function deleteRow(item) {
  if (item.kind !== 'hook' && item.kind !== 'mcp') return
  return busy(`del:${item.key}`, async () => {
    const hook = item.kind === 'hook'
    const where = hook && item.parked ? '~/.claude/storehouse.json' : tilde(item.path)
    const yes = await ask({
      title: hook ? `Delete ${item.event} hook?` : `Delete MCP server ${item.name}?`,
      message: `${hook ? item.command : item.name} is removed from ${where}. A backup of the file is written first.`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = hook
        ? await send('DELETE', '/api/hook', { id: item.id })
        : await send('DELETE', '/api/mcp', { scope: item.scope, name: item.name, origin: item.origin })
      toast(`Deleted ${hook ? `${item.event} hook` : `MCP server ${item.name}`} · wrote ${tilde(res.file)}`)
      showBanner()
      await afterWrite()
    } catch (err) {
      toast(`Could not delete: ${err.message}`, true)
    }
  })
}

function jsonBodyHtml(item) {
  let json
  let note
  if (item.kind === 'hook') {
    const hook = { type: item.type ?? 'command', command: item.command }
    if (item.timeout !== undefined) hook.timeout = item.timeout
    json = { [item.event]: [{ matcher: item.matcher, hooks: [hook] }] }
    note = item.plugin
      ? `Read-only. This hook comes from the plugin ${pluginLabel(item.plugin)} and follows its switch.`
      : item.parked
        ? `Read-only. This hook is parked in ~/.claude/storehouse.json. Switch it on to put it back in ${SETTINGS_FILE[item.file] ?? item.file}.`
        : `Read-only here. Switch it on the Hooks page, or edit ${SETTINGS_FILE[item.file] ?? item.file} on the Settings page.`
  } else {
    json = { [item.name]: item.config }
    note = 'Read-only. Env and header values are hidden. Open the file to see them.'
  }
  return `<div class="pane" id="pane-json" role="region" aria-label="JSON">
      <div class="dr-notes" id="dr-status"></div>
      <pre class="md json"><code>${esc(JSON.stringify(json, null, 2))}</code></pre>
      <p class="note">${esc(note)}</p>
    </div>`
}

function ensureEd(k, file) {
  let ed = eds[k]
  if (ed && ed.path !== file) {
    delete eds[k]
    ed = null
  }
  if (ed && (!ed.stale || ed.fetching)) return
  if (!ed) {
    ed = {
      path: file,
      status: 'loading',
      text: '',
      loaded: '',
      editing: false,
      preview: false,
      stale: false,
      fetching: false
    }
    eds[k] = ed
  }
  ed.fetching = true
  get(`/api/file?path=${encodeURIComponent(file)}`)
    .then((res) => {
      if (eds[k] !== ed) return
      ed.fetching = false
      ed.stale = false
      const content = res.content ?? ''
      if (edDirty(ed)) return
      ed.stamp = res.stamp
      if (ed.status === 'ready' && ed.loaded === content) return
      ed.loaded = ed.text = content
      ed.status = 'ready'
      if (isCfgPage()) render()
    })
    .catch((err) => {
      if (eds[k] !== ed) return
      ed.fetching = false
      ed.stale = false
      if (ed.status === 'ready') return
      ed.status = 'error'
      ed.error = err.message
      if (isCfgPage()) render()
    })
}

function msgHtml(k) {
  return `<p class="form-err" id="${k}-err" role="alert">${esc(msgs[k] ?? '')}</p>`
}

function backupsBtn(k) {
  const open = Boolean(bks[k]?.open)
  return `<button type="button" class="btn" id="${k}-bk" data-c="backups" data-k="${k}" aria-expanded="${open}" aria-controls="${k}-bkbox">Backups</button>`
}

function panelBackupsHtml(k) {
  const b = bks[k]
  if (!b?.open) return ''
  const inner = b.loading
    ? '<p class="note">Loading backups…</p>'
    : b.error
      ? `<p class="note">${esc(`Could not list backups: ${b.error}`)}</p>`
      : backupsListHtml(b.list, `data-c="restore" data-k="${k}"`, true, k)
  return `<div class="backups" id="${k}-bkbox">${inner}</div>`
}

function edChrome(k) {
  const ed = eds[k]
  const dirty = edDirty(ed)
  const md = MD_ORDER.includes(k)
  const mark = $(`${k}-dirty`)
  if (mark) {
    mark.textContent = dirty
      ? '● Unsaved changes'
      : md
        ? `${plural(lineCount(ed?.text ?? ''), 'line')} · Saved`
        : 'Saved'
    mark.classList.toggle('is-dirty', dirty)
  }
  const save = $(`${k}-save`)
  if (save) save.disabled = !dirty
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = dirty ? '● unsaved' : ''
  const cancel = $(`${k}-cancel`)
  if (cancel) cancel.hidden = !dirty
}

function sformState(k) {
  const dirty = sformDirtyKeys(k)
  return dirty.length
    ? `● ${plural(dirty.length, 'unsaved change')} · ${dirty.join(', ')}`
    : `${plural(Object.keys(setData(k)).length, 'key')} · Saved`
}

function sformChrome(k) {
  const dirty = sformDirtyKeys(k)
  const mark = $(`${k}-fdirty`)
  if (mark) {
    mark.textContent = sformState(k)
    mark.classList.toggle('is-dirty', dirty.length > 0)
  }
  for (const id of [`${k}-fsave`, `${k}-freset`]) {
    const b = $(id)
    if (b) b.disabled = !dirty.length
  }
  const dot = $(`cm-dot-${k}`)
  if (dot) dot.textContent = setDirty(k) ? '● unsaved' : ''
  for (const f of FORM_FIELDS) $(`sf-${f.key}`)?.closest('.srow')?.classList.toggle('changed', dirty.includes(f.key))
}

function fieldHtml(k, f, v, data, locked, changed) {
  const id = `sf-${f.key}`
  const name = `${esc(f.name)} <span class="key">${esc(f.key)}</span>`
  const head =
    f.type === 'switch' ? `<span class="t" id="${id}-l">${name}</span>` : `<label class="t" for="${id}">${name}</label>`
  const help =
    f.key === 'permissions.defaultMode' && k !== 'sg'
      ? `${f.help} <code>auto</code> and <code>bypassPermissions</code> do not work from this file.`
      : f.help
  let ctl
  if (locked) {
    const value = fieldGet(data, f) ?? data[fieldPath(f)[0]]
    ctl = `<span class="note">${esc(`${lockedText(value)} — edit in Raw JSON`)}</span>`
  } else if (f.type === 'switch') {
    ctl = `<button type="button" class="sw" role="switch" id="${id}" data-c="sfsw" data-v="${f.key}" aria-checked="${v[f.key] ? 'true' : 'false'}" aria-labelledby="${id}-l"></button>`
  } else if (f.type === 'select') {
    const opts = [['', '(not set)'], ...f.options.map((o) => [o, o])]
    for (const extra of [cfg.sforms[k]?.base[f.key], v[f.key]]) {
      if (extra && !opts.some(([o]) => o === extra)) opts.push([extra, `${extra} (current)`])
    }
    ctl = `<select id="${id}" data-sf="${f.key}">${opts.map(([o, label]) => opt(o, label, v[f.key])).join('')}</select>`
  } else {
    ctl = `<input id="${id}" data-sf="${f.key}" value="${esc(v[f.key])}" placeholder="not set" autocomplete="off" spellcheck="false">`
  }
  return `<div class="srow${changed ? ' changed' : ''}"><div class="lbl">${head}<p>${help}</p>${formHint(k, f)}</div><div class="ctl">${ctl}</div></div>`
}

function rulesHtml(data) {
  const perms = isPlain(data.permissions) ? data.permissions : {}
  const col = (key, label) => {
    const list = Array.isArray(perms[key]) ? perms[key] : []
    const items = list.length
      ? list.map((r) => `<span class="fm-chip">${esc(typeof r === 'string' ? r : JSON.stringify(r))}</span>`).join('')
      : '<span class="none">No rules</span>'
    return `<div><h4>${label} <b>${list.length}</b></h4>${items}</div>`
  }
  return `<div class="sgroup"><h3>Permission rules <span class="hint">Read-only here · edit in Raw JSON</span></h3><div class="rules">${col('allow', 'Allow')}${col('ask', 'Ask')}${col('deny', 'Deny')}</div></div>`
}

function elsewhereHtml(data) {
  const rows = ELSEWHERE.filter(([key]) => data[key] !== undefined).map(
    ([key, page, label]) =>
      `<li><code>${key}</code><span class="s">${esc(elsewhereText(key, data[key]))}</span><button type="button" class="btn" data-go="${page}">Open ${label}</button></li>`
  )
  if (!rows.length) return ''
  return `<div class="sgroup"><h3>Managed on other pages <span class="hint">${plural(rows.length, 'key')}</span></h3><ul class="lrows">${rows.join('')}</ul></div>`
}

function otherKeysHtml(data) {
  const known = new Set([...FORM_FIELDS.map((f) => fieldPath(f)[0]), ...ELSEWHERE.map(([key]) => key)])
  const rows = Object.keys(data)
    .filter((key) => !known.has(key))
    .map((key) => [key, data[key]])
  if (isPlain(data.permissions)) {
    for (const key of Object.keys(data.permissions)) {
      if (!['allow', 'ask', 'deny', 'defaultMode'].includes(key))
        rows.push([`permissions.${key}`, data.permissions[key]])
    }
  }
  if (!rows.length) return ''
  return `<div class="sgroup"><h3>Other keys <span class="hint">Edit in Raw JSON</span></h3><ul class="lrows">${rows
    .map(
      ([key, value]) =>
        `<li><code>${esc(key)}</code><span class="s">${esc(shortValue(value))}</span><button type="button" class="btn-link" data-c="stab" data-v="raw">Show in Raw JSON</button></li>`
    )
    .join('')}</ul></div>`
}

function settingsFormHtml(k) {
  const data = setData(k)
  const v = sformValues(k)
  const locked = lockedKeys(k)
  const dirty = sformDirtyKeys(k)
  const groups = FORM_GROUPS.map(([group, title]) => {
    const fields = FORM_FIELDS.filter((f) => f.group === group)
    const rows = fields.map((f) => fieldHtml(k, f, v, data, locked.includes(f.key), dirty.includes(f.key))).join('')
    return `<div class="sgroup"><h3>${title} <span class="hint">${plural(fields.length, 'key')}</span></h3>${rows}</div>`
  }).join('')
  return `${groups}${rulesHtml(data)}${elsewhereHtml(data)}${otherKeysHtml(data)}`
}

function missingHtml(k, p) {
  dropMissing(k)
  const buttons = p.md
    ? `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="default">Create from template</button><button type="button" class="btn" id="${k}-ce" data-c="create" data-k="${k}" data-v="empty">Create empty</button>`
    : `<button type="button" class="btn p" id="${k}-ct" data-c="create" data-k="${k}" data-v="empty">Create ${esc(p.file)}</button>`
  return `<div class="empty">No ${esc(p.file)} yet.<div class="row center">${buttons}</div></div>${msgHtml(k)}`
}

function setKeys() {
  return projectOn() ? SET_ORDER : ['sg']
}

function setSelected(panels) {
  const keys = setKeys()
  if (!cfg.ssel || !keys.includes(cfg.ssel)) cfg.ssel = keys.find((k) => panels[k].info?.exists) ?? keys[0]
  return cfg.ssel
}

function setMeta(k, p) {
  const info = p.info
  const pill = p.pill ? ` · ${p.pill}` : ''
  if (!info) return 'Could not be scanned'
  if (!info.exists) return `Not found${pill}`
  if (!info.ok) return `Invalid JSON${pill}`
  return `${plural(Object.keys(setData(k)).length, 'key')} · ${SET_WHERE[k]}${pill}`
}

function setListHtml(panels, sel) {
  return setKeys()
    .map((k, i) => {
      const p = panels[k]
      const exists = Boolean(p.info?.exists)
      const cur = k === sel
      const create =
        p.info && !exists
          ? `<button type="button" class="btn" id="cm-create-${k}" data-c="create" data-k="${k}" data-v="empty" aria-label="${esc(`Create ${p.file}`)}">Create</button>`
          : ''
      return `<li class="cm-file${cur ? ' cur' : ''}${exists ? '' : ' missing'}">
        <span class="cm-num" aria-hidden="true">${exists ? i + 1 : '–'}</span>
        <button type="button" class="cm-pick" id="cm-pick-${k}" data-c="spick" data-k="${k}"${cur ? ' aria-current="true"' : ''}>
          <span class="cm-label">${esc(p.label)}<span class="dirty" id="cm-dot-${k}">${setDirty(k) ? '● unsaved' : ''}</span></span>
          <span class="cm-path">${esc(p.file)}</span>
          <span class="cm-meta">${esc(setMeta(k, p))}</span>
        </button>
        ${create}
      </li>`
    })
    .join('')
}

function setBarHtml(k, p, form, dirty, stateText) {
  const del = p.del
    ? `<button type="button" class="btn danger ghost" id="${k}-del" data-c="delete" data-k="${k}">Delete…</button>`
    : ''
  const undo = form
    ? `<button type="button" class="btn ghost" id="${k}-freset" data-c="freset"${dirty ? '' : ' disabled'}>Reset</button>`
    : `<button type="button" class="btn ghost" id="${k}-cancel" data-c="cancel" data-k="${k}"${dirty ? '' : ' hidden'}>Discard</button>`
  const save = form
    ? `<button type="button" class="btn p" id="${k}-fsave" data-c="fsave"${dirty ? '' : ' disabled'}>Save</button>`
    : `<button type="button" class="btn p" id="${k}-save" data-c="save" data-k="${k}"${dirty ? '' : ' disabled'}>Save</button>`
  return `<div class="cm-bar">
      ${del}
      <span class="cm-state${dirty ? ' is-dirty' : ''}" id="${k}-${form ? 'fdirty' : 'dirty'}" aria-live="polite">${esc(stateText)}</span>
      ${undo}
      ${backupsBtn(k)}
      <button type="button" class="btn" id="${k}-open" data-c="editor" data-k="${k}">Open in editor</button>
      ${save}
    </div>`
}

function settingsPanelHtml(k, p) {
  const info = p.info
  const pill = p.pill ? `<span class="pill">${esc(p.pill)}</span>` : ''
  const broken = Boolean(info?.exists && !info.ok)
  const tab = broken ? 'raw' : cfg.stab
  const tabs = info?.exists
    ? `<div class="tabs" role="tablist" aria-label="View">${[
        ['form', 'Form'],
        ['raw', 'Raw JSON']
      ]
        .map(
          ([value, label]) =>
            `<button type="button" role="tab" id="${k}-tab-${value}" data-c="stab" data-v="${value}" aria-selected="${tab === value}" aria-controls="${k}-pane"${value === 'form' && broken ? ' disabled title="Fix the JSON first"' : ''}>${label}</button>`
        )
        .join('')}</div>`
    : ''
  const head = `<div class="cm-head"><div class="cm-title"><h2 id="${k}-h">${esc(p.label)}${pill}</h2><code class="cm-path">${esc(info ? tilde(info.path) : p.file)}</code></div>${tabs}</div>`
  let body
  let bar = ''
  if (!info) body = '<div class="warn">This file could not be scanned.</div>'
  else if (!info.exists) body = `<p class="note">${SET_ABOUT[k]}</p>${missingHtml(k, p)}`
  else if (tab === 'form') {
    const dirty = sformDirtyKeys(k).length > 0
    body = `<p class="form-err" id="${k}-ferr" role="alert">${esc(cfg.sformMsg)}</p><div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-tab-form">${settingsFormHtml(k)}</div>${panelBackupsHtml(k)}`
    bar = setBarHtml(k, p, true, dirty, sformState(k))
  } else {
    ensureEd(k, info.path)
    const ed = eds[k]
    const warn = broken
      ? `<div class="warn">${esc(`Cannot parse ${p.file}: ${info.error}. Fix it here. The form comes back once the file parses.`)}</div>`
      : ''
    if (!ed || ed.status === 'loading') body = '<p class="note">Loading…</p>'
    else if (ed.status === 'error')
      body = `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
    else {
      const dirty = edDirty(ed)
      body = `${warn}${msgHtml(k)}<div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-tab-raw"><textarea id="${k}-txt" class="ed" data-ed="${k}" spellcheck="false" aria-label="${esc(`${p.file} contents`)}">\n${esc(ed.text)}</textarea></div>${panelBackupsHtml(k)}`
      bar = setBarHtml(k, p, false, dirty, dirty ? '● Unsaved changes' : 'Saved')
    }
  }
  return `<section class="panel cm-panel" aria-labelledby="${k}-h">${head}<div class="cm-body">${body}</div>${bar}</section>`
}

function renderSettings() {
  const panels = cfgPanels()
  const sel = setSelected(panels)
  const arrow = projectOn() ? '<span class="arrow">1 Global <span class="bar"></span> 3 Project local</span>' : ''
  const view = cfg.sview === 'effective' ? 'effective' : 'files'
  const vtab = (value, label) =>
    `<button type="button" role="tab" id="sv-${value}" data-c="sview" data-v="${value}" aria-selected="${view === value}">${label}</button>`
  const top = `<div class="st-top"><p class="note">Claude Code reads these files at the start of a session in this folder. Each save writes a backup to <code>~/.claude/backups/storehouse/</code> first.</p><div class="vtabs" role="tablist" aria-label="Settings view">${vtab('files', 'Files')}${vtab('effective', `Effective <span class="n">${plural(effRows().length, 'key')}</span>`)}</div></div>`
  if (view === 'effective') {
    $('p-settings').innerHTML = `${top}${effectiveHtml()}`
    return
  }
  $('p-settings').innerHTML = `${top}
    <div class="cm">
      <nav class="cm-nav" aria-label="Settings files">
        <ul class="cm-list">${setListHtml(panels, sel)}</ul>
        <div class="prec"><b>Which file wins?</b><span>When two files set the same key, the higher number wins. Lists such as <code>permissions.allow</code> add up from all files. A deny rule in any file blocks the tool.</span>${arrow}</div>
        ${projectOn() ? '' : projectOffHtml()}
      </nav>
      ${settingsPanelHtml(sel, panels[sel])}
    </div>`
}

function effTag(scope) {
  const [label, cls] = SCOPE_TAG[scope] ?? [scope, '']
  const k = SCOPE_KEY[scope]
  return `<button type="button" class="tag ${cls}" data-c="efile" data-k="${k}" aria-label="${esc(`Open ${cfgPanels()[k]?.file ?? label}`)}">${label}</button>`
}

function effValue(value) {
  return `<code>${esc(value === undefined ? '' : JSON.stringify(value))}</code>`
}

function effLost(list) {
  return list
    .map((o) => {
      const note = o.wrongType
        ? ' <span class="note">wrong type · ignored</span>'
        : o.ignored
          ? ' <span class="note">ignored in this file</span>'
          : ''
      return `<li><span class="lost">${effValue(o.value)}</span> ${effTag(o.file)}${note}</li>`
    })
    .join('')
}

function effRowHtml(r) {
  const value = r.merged
    ? `<ul>${r.value.map((x) => `<li>${effValue(x.v)} ${effTag(x.from)}</li>`).join('')}</ul>`
    : r.from
      ? `${effValue(r.value)}${r.masked ? ' <span class="mchip key">masked</span>' : ''}`
      : '<span class="note">Not used</span>'
  const from = r.merged
    ? `<span class="mergedl">merged · ${plural(r.files.length, 'file')}</span>`
    : r.from
      ? effTag(r.from)
      : '—'
  const lost = effLost([...r.overridden, ...(r.ignored ?? []).map((o) => ({ ...o, ignored: true }))])
  return `<tr><td class="key"><code>${esc(r.key)}</code></td><td>${value}</td><td>${from}</td><td>${lost ? `<ul>${lost}</ul>` : '—'}</td></tr>`
}

function effectiveHtml() {
  const all = effRows()
  const over = all.filter((r) => r.overridden.length || r.ignored?.length)
  const merged = all.filter((r) => r.merged)
  const q = state.query.trim().toLowerCase()
  const pool = cfg.efilter === 'over' ? over : cfg.efilter === 'merged' ? merged : all
  const rows = q ? pool.filter((r) => r.key.toLowerCase().includes(q)) : pool
  const chip = (value, label, n) =>
    `<button type="button" class="chip" data-c="efilt" data-v="${value}" aria-pressed="${cfg.efilter === value}">${label} <span class="n">${n}</span></button>`
  const order = projectOn()
    ? `Highest first: ${effTag('projectLocal')} <code>.claude/settings.local.json</code> → ${effTag('project')} <code>.claude/settings.json</code> → ${effTag('global')} <code>~/.claude/settings.json</code>.`
    : `Only ${effTag('global')} <code>~/.claude/settings.json</code> applies. Project scope is off.`
  const skipped = state.inventory.settings?.effective?.skipped ?? []
  const invalid = state.inventory.settings?.effective?.invalid ?? []
  const notes = [
    state.inventory.settings?.managed
      ? '<div class="warn">Managed settings exist on this computer. They win over all files below. Storehouse does not read them. Run <code>/status</code> in Claude Code to see them.</div>'
      : '',
    skipped.length
      ? `<div class="warn">${esc(`Left out because the JSON is invalid: ${skipped.map((s) => cfgPanels()[SCOPE_KEY[s]].file).join(', ')}. Fix it in the Files view.`)}</div>`
      : '',
    invalid.length
      ? `<div class="warn">${esc(`Left out because the value is not an object: ${invalid.map((x) => `${x.key} in ${cfgPanels()[SCOPE_KEY[x.file]].file}`).join(', ')}.`)}</div>`
      : ''
  ].join('')
  const body = EFF_GROUPS.map(([group, title, hint]) => {
    const list = rows.filter((r) => r.group === group)
    if (!list.length) return ''
    return `<tr class="sec"><th colspan="4" scope="colgroup">${title}<span>${esc(hint || plural(list.length, 'key'))}</span></th></tr>${list.map(effRowHtml).join('')}`
  }).join('')
  const table = rows.length
    ? `<div class="eff-wrap"><table class="eff"><thead><tr><th scope="col">Key</th><th scope="col">Value Claude Code uses</th><th scope="col">From</th><th scope="col">Overridden</th></tr></thead><tbody>${body}</tbody></table></div>`
    : empty(q ? `No key matches "${state.query}".` : 'No settings in these files.')
  return `${notes}<div class="chipbar"><div class="chips" role="group" aria-label="Filter keys">${chip('all', 'All keys', all.length)}${chip('over', 'Overridden', over.length)}${chip('merged', 'Merged lists', merged.length)}</div><p class="note">${order}</p></div>
    ${table}
    <p class="note under">Not shown: hooks (hooks from all files run, see the Hooks page), command line flags, environment variables of your shell, and managed settings.</p>`
}

function formHint(k, f) {
  const r = effRow(f.key)
  if (!r || r.merged) return ''
  const scope = Object.keys(SCOPE_KEY).find((s) => SCOPE_KEY[s] === k)
  if (r.ignored?.some((o) => o.file === scope))
    return '<span class="ovr">Claude Code ignores this value in this file.</span>'
  if (!r.from || r.from === scope) return ''
  const order = ['global', 'project', 'projectLocal']
  if (order.indexOf(r.from) < order.indexOf(scope)) return ''
  return `<span class="ovr">↑ ${esc(cfgPanels()[SCOPE_KEY[r.from]].label)} sets ${effValue(r.value)}. That value wins in this folder.</span>`
}

async function pickSet(k) {
  if (!SET_ORDER.includes(k)) return false
  if (k === cfg.ssel) return true
  const cur = cfg.ssel
  if (cur && setDirty(cur)) {
    const yes = await ask({
      title: 'Discard changes?',
      message: `Your unsaved edits in ${cfgPanels()[cur].file} are lost.`,
      ok: 'Discard',
      danger: true
    })
    if (!yes) return false
    delete cfg.sforms[cur]
    if (eds[cur]) eds[cur].text = eds[cur].loaded
  }
  cfg.ssel = k
  cfg.sformMsg = ''
  render()
  return true
}

const MD_WHERE = {
  mg: 'every project',
  mp: 'this folder · in git',
  mc: 'this folder · in git',
  ml: 'this folder · only you'
}

function mdKeys() {
  return projectOn() ? MD_ORDER : ['mg']
}

function mdSelected(panels) {
  const keys = mdKeys()
  if (!cmd.sel || !keys.includes(cmd.sel)) cmd.sel = keys.find((k) => panels[k].info?.exists) ?? keys[0]
  return cmd.sel
}

function mdMeta(k, p) {
  const info = p.info
  if (!info) return 'Could not be scanned'
  if (!info.exists) return p.pill ? `Not found · ${p.pill}` : 'Not found'
  const ed = eds[k]
  const size = ed?.status === 'ready' ? plural(lineCount(ed.text), 'line') : fmtSize(info.size)
  return `${size} · ${MD_WHERE[k]}`
}

function mdListHtml(panels, sel) {
  let n = 0
  return mdKeys()
    .map((k) => {
      const p = panels[k]
      const exists = Boolean(p.info?.exists)
      if (exists) ensureEd(k, p.info.path)
      const num = exists ? ++n : 0
      const cur = k === sel
      const dirty = edDirty(eds[k])
      const create =
        p.info && !exists
          ? `<button type="button" class="btn" id="cm-create-${k}" data-c="create" data-k="${k}" data-v="default" aria-label="${esc(`Create ${p.file}`)}">Create</button>`
          : ''
      return `<li class="cm-file${cur ? ' cur' : ''}${exists ? '' : ' missing'}">
        <span class="cm-num" aria-hidden="true">${num || '–'}</span>
        <button type="button" class="cm-pick" id="cm-pick-${k}" data-c="pick" data-k="${k}"${cur ? ' aria-current="true"' : ''}>
          <span class="sr">${num ? `Read ${num}${['st', 'nd', 'rd'][num - 1] ?? 'th'}. ` : ''}</span>
          <span class="cm-label">${esc(p.label)}<span class="dirty" id="cm-dot-${k}">${dirty ? '● unsaved' : ''}</span></span>
          <span class="cm-path">${esc(p.file)}</span>
          <span class="cm-meta">${esc(mdMeta(k, p))}</span>
        </button>
        ${create}
      </li>`
    })
    .join('')
}

function mdPanelHtml(k, p) {
  const info = p.info
  const ed = info?.exists ? eds[k] : null
  const ready = ed?.status === 'ready'
  const editing = ready && ed.editing
  const pill = p.pill ? `<span class="pill">${esc(p.pill)}</span>` : ''
  const tabs = ready
    ? `<div class="tabs" role="tablist" aria-label="View">
        <button type="button" role="tab" id="${k}-pv" data-c="preview" data-k="${k}" aria-selected="${!editing}" aria-controls="${k}-pane">Preview</button>
        <button type="button" role="tab" id="${k}-edit" data-c="edit" data-k="${k}" aria-selected="${editing}" aria-controls="${k}-pane">Edit</button>
      </div>`
    : ''
  const head = `<div class="cm-head"><div class="cm-title"><h2 id="${k}-h">${esc(p.label)}${pill}</h2><code class="cm-path">${esc(info ? tilde(info.path) : p.file)}</code></div>${tabs}</div>`
  let body
  let bar = ''
  if (!info) body = '<div class="warn">This file could not be scanned.</div>'
  else if (!info.exists) body = missingHtml(k, p)
  else if (!ed || ed.status === 'loading') body = '<p class="note">Loading…</p>'
  else if (ed.status === 'error')
    body = `<p class="note">${esc(`Could not read ${p.file}: ${ed.error}`)}</p>${msgHtml(k)}`
  else {
    const dirty = edDirty(ed)
    const pane = editing
      ? `<div class="cm-pane" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-edit"><textarea id="${k}-txt" class="ed" data-ed="${k}" spellcheck="false" aria-label="${esc(`${p.file} contents`)}">\n${esc(ed.text)}</textarea></div>`
      : `<div class="cm-pane md" id="${k}-pane" role="tabpanel" aria-labelledby="${k}-pv" tabindex="0">${previewHtml(ed.text, info.path)}</div>`
    body = `${msgHtml(k)}${pane}${panelBackupsHtml(k)}`
    bar = `<div class="cm-bar">
        <button type="button" class="btn danger ghost" id="${k}-del" data-c="delete" data-k="${k}">Delete…</button>
        <span class="cm-state${dirty ? ' is-dirty' : ''}" id="${k}-dirty" aria-live="polite">${dirty ? '● Unsaved changes' : `${esc(plural(lineCount(ed.text), 'line'))} · Saved`}</span>
        <button type="button" class="btn ghost" id="${k}-cancel" data-c="cancel" data-k="${k}"${dirty ? '' : ' hidden'}>Discard</button>
        ${backupsBtn(k)}
        <button type="button" class="btn" id="${k}-open" data-c="editor" data-k="${k}">Open in editor</button>
        <button type="button" class="btn p" id="${k}-save" data-c="save" data-k="${k}"${dirty ? '' : ' disabled'}>Save</button>
      </div>`
  }
  return `<section class="panel cm-panel" aria-labelledby="${k}-h">${head}<div class="cm-body">${body}</div>${bar}</section>`
}

function renderClaudeMd() {
  const panels = cfgPanels()
  const sel = mdSelected(panels)
  $('p-claudemd').innerHTML =
    `<p class="note cm-intro">Claude Code reads every file that exists here at the start of a session in this folder. Each save writes a backup to <code>~/.claude/backups/storehouse/</code> first.</p>
    <div class="cm">
      <nav class="cm-nav" aria-label="CLAUDE.md files">
        <ul class="cm-list">${mdListHtml(panels, sel)}</ul>
        <p class="note">The numbers show the read order. A later file can add to an earlier one.</p>
        ${projectOn() ? '' : projectOffHtml()}
      </nav>
      ${mdPanelHtml(sel, panels[sel])}
    </div>`
}

async function discardMd(k) {
  const ed = eds[k]
  if (!edDirty(ed)) return true
  const yes = await ask({
    title: 'Discard changes?',
    message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`,
    ok: 'Discard',
    danger: true
  })
  if (!yes) return false
  ed.text = ed.loaded
  ed.editing = false
  delete msgs[k]
  return true
}

async function pickMd(k) {
  if (!MD_ORDER.includes(k)) return false
  if (k === cmd.sel) return true
  const dirty = mdDirtyKey()
  if (dirty && !(await discardMd(dirty))) return false
  cmd.sel = k
  render()
  return true
}

function openCfgFile(k) {
  const info = cfgPanels()[k]?.info
  if (!info?.exists) return
  return busy(`open:${k}`, async () => {
    try {
      await send('POST', '/api/open', { path: info.path, app: 'editor' })
      toast(`Opened ${tilde(info.path)} in your editor`)
    } catch (err) {
      toast(`Could not open: ${err.message}`, true)
    }
  })
}

function onCfgInput(e) {
  const t = e.target
  if (t.dataset.ed) {
    const ed = eds[t.dataset.ed]
    if (ed) {
      ed.text = t.value
      edChrome(t.dataset.ed)
    }
    return
  }
  if (t.dataset.sf) {
    sformEdit(cfg.ssel, t.dataset.sf, t.value)
    sformChrome(cfg.ssel)
    return
  }
  if (t.dataset.f) {
    const [form, field] = t.dataset.f.split('.')
    if (!cfg[form] || !Object.hasOwn(cfg[form], field)) return
    cfg[form][field] = t.value
    if (field === 'transport') render()
  }
}

async function setSettingsTab(tab) {
  const k = cfg.ssel
  if (tab === cfg.stab) {
    $(`${k}-tab-${tab}`)?.focus()
    return
  }
  if (tab === 'raw' && sformDirtyKeys(k).length) {
    const yes = await ask({
      title: 'Discard form changes?',
      message: 'Raw JSON shows the file on disk. Your unsaved form changes are lost.',
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
    delete cfg.sforms[k]
  }
  if (tab === 'form' && edDirty(eds[k])) {
    const yes = await ask({
      title: 'Discard JSON changes?',
      message: 'The form shows the file on disk. Your unsaved Raw JSON edits are lost.',
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
    eds[k].text = eds[k].loaded
  }
  cfg.stab = tab
  cfg.sformMsg = ''
  render()
  $(`${k}-tab-${tab}`)?.focus()
}

function saveSettingsForm() {
  return busy('sform', async () => {
    const k = cfg.ssel
    const info = cfgPanels()[k]?.info
    const keys = sformDirtyKeys(k)
    if (!keys.length || !info) return
    cfg.sformMsg = ''
    try {
      let data = {}
      let stamp = null
      try {
        const res = await get(`/api/file?path=${encodeURIComponent(info.path)}`)
        stamp = res.stamp
        try {
          data = JSON.parse(res.content ?? '')
        } catch (err) {
          throw new Error(`${tilde(info.path)} does not parse: ${err.message}. Fix it in Raw JSON.`, { cause: err })
        }
      } catch (err) {
        if (err.status !== 404) throw err
      }
      if (!isPlain(data)) throw new Error(`${tilde(info.path)} does not hold a JSON object.`)
      for (const key of keys) {
        const f = FORM_FIELDS.find((x) => x.key === key)
        const parent = f.path ? data[f.path[0]] : data
        if (parent !== undefined && !isPlain(parent))
          throw new Error(`${f.path[0]} in ${tilde(info.path)} is not an object. Fix it in Raw JSON.`)
        fieldSet(data, f, formValue(cfg.sforms[k].values[key]))
      }
      await send('PUT', '/api/file', { path: info.path, content: `${JSON.stringify(data, null, 2)}\n`, stamp })
      delete cfg.sforms[k]
      toast(`Saved ${keys.join(', ')} · wrote ${tilde(info.path)}`)
      showBanner()
      await afterWrite()
      $(`sf-${keys[0]}`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        cfg.sformMsg = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(info.path)) {
          delete cfg.sforms[k]
          cfg.sformMsg = ''
          await afterWrite()
        }
        return
      }
      cfg.sformMsg = `Could not save: ${err.message}`
      render()
    }
  })
}

function saveEd(k) {
  return busy(`save:${k}`, async () => {
    const ed = eds[k]
    const p = cfgPanels()[k]
    if (!ed || !p?.info || !edDirty(ed)) return
    const sent = ed.text
    delete msgs[k]
    try {
      const res = await send('PUT', '/api/file', { path: p.info.path, content: sent, stamp: ed.stamp ?? null })
      ed.loaded = res.content
      ed.stamp = res.stamp
      if (ed.text === sent) ed.text = res.content
      if (SET_ORDER.includes(k)) delete cfg.sforms[k]
      toast(`Saved ${tilde(p.info.path)} · backup written`)
      await afterWrite()
      $(p.md && !ed.editing ? `${k}-edit` : `${k}-txt`)?.focus()
    } catch (err) {
      if (err.status === 409) {
        msgs[k] = 'This file changed on disk. Reload it before you save.'
        render()
        if (await askReload(p.info.path)) {
          ed.text = ed.loaded
          ed.editing = false
          ed.stale = true
          delete msgs[k]
          if (SET_ORDER.includes(k)) delete cfg.sforms[k]
          await afterWrite()
        }
        return
      }
      msgs[k] = `Could not save ${p.file}: ${err.message}`
      render()
    }
  })
}

async function cancelEd(k) {
  const ed = eds[k]
  if (!ed) return
  if (edDirty(ed)) {
    const yes = await ask({
      title: 'Discard changes?',
      message: `Your unsaved edits in ${cfgPanels()[k].file} are lost.`,
      ok: 'Discard',
      danger: true
    })
    if (!yes) return
  }
  ed.text = ed.loaded
  ed.editing = false
  delete msgs[k]
  render()
  $(`${k}-edit`)?.focus()
}

function createPanel(k, template) {
  return busy(`create:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info || !p.create) return
    delete msgs[k]
    try {
      const { file } = await send('POST', '/api/create', { what: p.create, template })
      delete eds[k]
      delete bks[k]
      toast(`Created ${tilde(file)}`)
      await afterWrite()
      const target = p.md ? `${k}-edit` : SET_ORDER.includes(k) ? `${k}-tab-${cfg.stab}` : `${k}-txt`
      await waitFor(() => $(target))
      $(target)?.focus()
    } catch (err) {
      msgs[k] = `Could not create ${p.file}: ${err.message}`
      render()
    }
  })
}

function deletePanel(k) {
  return busy(`delete:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info?.exists) return
    const yes = await ask({
      title: `Delete ${p.file}?`,
      message: `${tilde(p.info.path)} moves to ~/.claude/backups/storehouse/trash. You can move it back from there.${edDirty(eds[k]) ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Delete',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('DELETE', '/api/file', { path: p.info.path })
      delete eds[k]
      delete bks[k]
      delete msgs[k]
      toast(`Deleted ${tilde(p.info.path)} · moved to ${tilde(res.trashPath ?? 'trash')}`)
      await afterWrite()
      $(`${k}-ct`)?.focus()
    } catch (err) {
      msgs[k] = `Could not delete ${p.file}: ${err.message}`
      render()
    }
  })
}

async function togglePanelBackups(k) {
  const p = cfgPanels()[k]
  if (!p?.info) return
  if (bks[k]?.open) {
    delete bks[k]
    render()
    return
  }
  const box = { open: true, loading: true, list: [], error: '' }
  bks[k] = box
  render()
  try {
    const res = await get(`/api/backups?path=${encodeURIComponent(p.info.path)}`)
    box.list = res.backups ?? []
  } catch (err) {
    box.error = err.message
  }
  box.loading = false
  if (bks[k] === box) render()
}

function restorePanel(k, backup) {
  return busy(`restore:${k}`, async () => {
    const p = cfgPanels()[k]
    if (!p?.info) return
    const dirty = edDirty(eds[k]) || sformDirtyKeys(k).length > 0
    const yes = await ask({
      title: 'Restore this backup?',
      message: `${tilde(p.info.path)} is replaced with the backup. The current file is backed up first.${dirty ? ' Your unsaved edits are lost.' : ''}`,
      ok: 'Restore',
      danger: true
    })
    if (!yes) return
    try {
      const res = await send('POST', '/api/restore', { backup, path: p.info.path })
      const ed = eds[k]
      if (ed) {
        ed.loaded = ed.text = res.content
        ed.stamp = res.stamp
        ed.status = 'ready'
      }
      if (SET_ORDER.includes(k)) delete cfg.sforms[k]
      delete bks[k]
      delete msgs[k]
      toast(`Restored ${tilde(p.info.path)} from backup`)
      await afterWrite()
      $(`${k}-bk`)?.focus()
    } catch (err) {
      msgs[k] = `Could not restore: ${err.message}`
      if (SET_ORDER.includes(k) && cfg.stab === 'form') cfg.sformMsg = msgs[k]
      render()
    }
  })
}

function closeForm(name) {
  cfg[name] = name === 'hook' ? freshHookForm() : freshMcpForm()
  render()
  $(name === 'hook' ? 'hf-open' : 'mf-open')?.focus()
}

function onCfg(el) {
  const act = el.dataset.c
  const k = el.dataset.k
  const v = el.dataset.v
  if (act === 'hf-open' || act === 'mf-open') {
    const name = act === 'hf-open' ? 'hook' : 'mcp'
    if (cfg[name].open) return closeForm(name)
    cfg[name].open = true
    render()
    $(name === 'hook' ? 'hf-scope' : 'mf-scope')?.focus()
    return
  }
  if (act === 'hf-cancel') return closeForm('hook')
  if (act === 'mf-cancel') return closeForm('mcp')
  if (act === 'stab') return void setSettingsTab(v)
  if (act === 'sfsw') {
    sformEdit(cfg.ssel, v, !sformValues(cfg.ssel)[v])
    render()
    return
  }
  if (act === 'fsave') return void saveSettingsForm()
  if (act === 'freset') {
    delete cfg.sforms[cfg.ssel]
    cfg.sformMsg = ''
    render()
    $(`${cfg.ssel}-tab-form`)?.focus()
    return
  }
  if (act === 'pick') {
    return void pickMd(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && MD_ORDER.includes(k) && k !== cmd.sel) {
    return void pickMd(k).then((ok) => ok && createPanel(k, v))
  }
  if (act === 'sview') {
    cfg.sview = v
    render()
    $(`sv-${v}`)?.focus()
    return
  }
  if (act === 'efilt') {
    cfg.efilter = v
    render()
    return
  }
  if (act === 'efile') {
    cfg.sview = 'files'
    return void pickSet(k).then((ok) => {
      render()
      if (ok) $(`cm-pick-${k}`)?.focus()
    })
  }
  if (act === 'spick') {
    return void pickSet(k).then((ok) => ok && $(`cm-pick-${k}`)?.focus())
  }
  if (act === 'create' && SET_ORDER.includes(k) && k !== cfg.ssel) {
    return void pickSet(k).then((ok) => ok && createPanel(k, v))
  }
  if (act === 'editor') return void openCfgFile(k)
  if (act === 'backups') return void togglePanelBackups(k)
  if (act === 'restore') return void restorePanel(k, el.dataset.path)
  if (act === 'save') return void saveEd(k)
  if (act === 'cancel') return void cancelEd(k)
  if (act === 'create') return void createPanel(k, v)
  if (act === 'delete') return void deletePanel(k)
  const ed = eds[k]
  if (!ed) return
  if (act === 'edit') {
    ed.editing = true
    ed.preview = false
    render()
    $(`${k}-txt`)?.focus()
  } else if (act === 'preview') {
    if (MD_ORDER.includes(k)) ed.editing = false
    else ed.preview = !ed.preview
    render()
  }
}

function placeFav(fromKey, cat, toKey, after) {
  const favs = state.inventory.favorites
  const from = favs.find((f) => f.id === fromKey)
  if (!from || toKey === fromKey) return null
  const ids = favs.map((f) => f.id).filter((id) => id !== fromKey)
  const target = toKey ? ids.indexOf(toKey) : -1
  let at = ids.length
  if (target >= 0) at = target + (after ? 1 : 0)
  else {
    const last = favs.filter((f) => f.id !== fromKey && f.category === cat).at(-1)
    if (last) at = ids.indexOf(last.id) + 1
  }
  ids.splice(at, 0, fromKey)
  const move = from.category === cat ? undefined : { id: fromKey, category: cat }
  if (!move && ids.every((id, i) => id === favs[i].id)) return null
  return { ids, move }
}

async function saveOrder({ ids, move }) {
  const byId = new Map(state.inventory.favorites.map((f) => [f.id, f]))
  state.inventory.favorites = ids
    .map((id) => byId.get(id))
    .map((f) => (move && f.id === move.id ? { ...f, category: move.category } : f))
  render()
  try {
    await send('PUT', '/api/favorites/order', move ? { ids, move } : { ids })
    toast(
      move
        ? `Moved ${byId.get(move.id).name} to ${move.category ?? 'Uncategorized'} · ~/.claude/storehouse.json`
        : 'Saved order · ~/.claude/storehouse.json'
    )
  } catch (err) {
    toast(`Could not save order: ${err.message}`, true)
  }
  await refresh().catch(() => {})
  loadActivity()
}

const ACT_PATH = {
  toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="2.5"/>',
  favorite: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  save: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'
}

function actIcon(name, size = 14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACT_PATH[name] ?? ''}</svg>`
}

function actRowHtml(e) {
  const isUndo = e.message.startsWith('Undid:')
  const kind = isUndo ? 'undo' : ACT_PATH[e.kind] ? e.kind : 'save'
  const full = tilde(e.file ?? '')
  const name = full.split('/').pop()
  const time = Date.parse(e.time)
  return `<li class="act-row k-${kind}" data-entry="${esc(e.id)}">
    <span class="act-dot">${actIcon(kind)}</span>
    <div class="act-body">
      <b>${esc(e.message)}</b>
      <div class="act-line"><span class="act-meta"><code title="${esc(full)}">${esc(name)}</code><time datetime="${esc(e.time ?? '')}" title="${esc(Number.isNaN(time) ? '' : new Date(time).toLocaleString())}">${Number.isNaN(time) ? '' : esc(ago(time))}</time></span></div>
    </div>
    ${e.canUndo ? `<button type="button" class="act-undo" data-undo="${esc(e.id)}" title="Undo" aria-label="Undo: ${esc(e.message)}">${actIcon('undo', 16)}</button>` : ''}
  </li>`
}

function renderActivity(entries) {
  $('n-activity').textContent = entries.length ? String(entries.length) : ''
  const list = $('act')
  if (!entries.length) {
    list.innerHTML = `<li class="act-empty"><span class="act-empty-ic">${actIcon('undo', 22)}</span><b>No changes yet</b><span>Switches, saves, and stars show here. You can undo them.</span></li>`
    return
  }
  list.innerHTML = entries.map(actRowHtml).join('')
}

async function loadActivity() {
  try {
    const res = await get('/api/activity')
    renderActivity(res.entries ?? [])
  } catch (err) {
    $('act').innerHTML = `<li class="sub">${esc(`Could not load activity: ${err.message}`)}</li>`
  }
}

async function undo(id) {
  const busy = `undo:${id}`
  if (pending.has(busy)) return
  pending.add(busy)
  try {
    const res = await send('POST', '/api/undo', { entryId: id })
    toast(`Undone · ${tilde(res.file ?? res.entry?.file ?? '')}`)
    if (res.entry?.kind === 'toggle') showBanner()
    await refresh()
  } catch (err) {
    toast(`Could not undo: ${err.message}`, true)
  } finally {
    pending.delete(busy)
    await loadActivity()
    $('title').focus()
  }
}

function wire() {
  $('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]')
    if (b) go(b.dataset.p)
  })
  $('scope').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]')
    if (!b) return
    state.scope = b.dataset.s
    render()
  })
  $('q').addEventListener('input', (e) => {
    clearTimeout(state.searchTimer)
    const value = e.target.value
    state.searchTimer = setTimeout(() => {
      state.query = value
      render()
    }, 120)
  })
  $('act').addEventListener('click', (e) => {
    const b = e.target.closest('[data-undo]')
    if (b) undo(b.dataset.undo)
  })
  setInterval(() => {
    for (const t of $('act').querySelectorAll('time[datetime]')) {
      const ms = Date.parse(t.dateTime)
      if (!Number.isNaN(ms)) t.textContent = ago(ms)
    }
  }, 30000)
  $('banner-x').addEventListener('click', () => {
    state.bannerDismissed = true
    $('banner').hidden = true
  })
  $('dr-close').addEventListener('click', () => closeDrawer())
  $('dr-scrim').addEventListener('click', () => closeDrawer())
  $('dr').addEventListener('click', onDrawerClick)
  $('cf-no').addEventListener('click', () => state.confirmState?.done(false))
  $('cf-yes').addEventListener('click', () => state.confirmState?.done(true))
  document.addEventListener('keydown', (e) => {
    if (state.confirmState) {
      if (e.key === 'Escape') {
        e.preventDefault()
        state.confirmState.done(false)
      } else if (e.key === 'Tab') trapTab(e, $('cf'))
      return
    }
    if (state.favPop) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFavPop()
      } else if (e.key === 'Tab') trapTab(e, state.favPop.el)
      return
    }
    if (state.favEditing !== null && e.key === 'Escape' && document.activeElement?.id === 'fav-rename') {
      e.preventDefault()
      cancelRename()
      return
    }
    if (drawerOpen()) {
      if (dr.menu && e.key === 'Escape') {
        e.preventDefault()
        closeDrawerMenu(true)
        return
      }
      if (dr.menu && menuKeys(e)) return
      if (dr.menu && e.key === 'Tab') closeDrawerMenu(true)
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
      } else if (e.key === 'Tab') trapTab(e, $('dr'))
      else if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveFile()
      } else if ((e.metaKey || e.ctrlKey) && e.target.id === 'dr-txt' && (e.key === 'b' || e.key === 'i')) {
        e.preventDefault()
        formatText(e.key === 'b' ? 'bold' : 'italic')
      }
      return
    }
    const panelKey = document.activeElement?.dataset?.ed
    if (panelKey && (e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      saveEd(panelKey)
      return
    }
    if (state.menuKey) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        return
      }
      if (menuKeys(e)) return
    }
    const tag = document.activeElement?.tagName
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      $('q').focus()
      $('q').select()
    }
  })
  window.addEventListener('hashchange', () => go(location.hash.slice(1)))
  document.addEventListener(
    'mousedown',
    (e) => {
      if (
        state.favPop &&
        !state.favPop.el.contains(e.target) &&
        !e.target.closest('[data-act="star"], [data-dact="star"]')
      )
        closeFavPop(false)
    },
    true
  )
  window.addEventListener('resize', () => closeFavPop(false))
  window.addEventListener('scroll', placeFavPop, true)
  window.addEventListener('beforeunload', (e) => {
    if (isDirty() || cfgDirty()) e.preventDefault()
  })

  const main = document.querySelector('.main')
  main.addEventListener('click', (e) => {
    const goEl = e.target.closest('[data-go]')
    if (goEl) return go(goEl.dataset.go)
    const periodEl = e.target.closest('[data-period]')
    if (periodEl) return setPeriod(periodEl.dataset.period)
    const sortEl = e.target.closest('[data-usort]')
    if (sortEl) return setSort(sortEl.dataset.usort)
    const unusedEl = e.target.closest('[data-unused]')
    if (unusedEl) {
      if (unusedEl.dataset.unused === 'off') return void switchOffUnused()
      chipFilter[state.page] = 'unused'
      state.menuKey = null
      return render()
    }
    const cfgEl = e.target.closest('[data-c]')
    if (cfgEl) {
      if (!cfgEl.disabled) onCfg(cfgEl)
      return
    }
    const chip = e.target.closest('[data-chip]')
    if (chip) {
      chipFilter[state.page] = chip.dataset.chip
      state.menuKey = null
      return render()
    }
    const fc = e.target.closest('[data-fc]')
    if (fc) return void onFavCat(fc)
    const grp = e.target.closest('[data-group]')
    if (grp) {
      groupOpen.set(grp.dataset.group, grp.getAttribute('aria-expanded') !== 'true')
      return render()
    }
    if (e.target.closest('#doc-again')) return void checkAgain()
    const docRow = e.target.closest('[data-doc]')
    if (docRow) return void onDoctor(docRow, e)
    const act = e.target.closest('[data-act]')
    const key = cardKey(e.target)
    if (!key) return
    const name = act?.dataset.act
    if (name === 'menu') return openMenu(key, act.closest('[data-rows]')?.dataset.rows ?? '')
    if (act?.dataset.act === 'unfav') {
      const fav = state.inventory.favorites.find((f) => f.id === key)
      if (fav) star({ kind: fav.kind, name: fav.name, source: fav.source, favorite: false }, `Unstarred ${fav.name}`)
      return
    }
    const item = items.get(key)
    if (!item) return
    if (act?.dataset.act === 'toggle') return void toggle(item)
    if (act?.dataset.act === 'star') return void starItem(item, act)
    if (act?.dataset.act === 'del') return void deleteRow(item)
    if (name === 'keep') return void keepOnly(item)
    if (name === 'uninstall') return void uninstallPlugin(item)
    if (name?.startsWith('m-')) {
      closeMenu()
      if (name === 'm-open') return openDrawer(item)
      if (name === 'm-toggle') return void toggle(item)
      if (name === 'm-finder') return void reveal(item)
      if (name === 'm-uninstall') return void uninstallPlugin(item)
      return
    }
    if (act?.dataset.act === 'open' || !e.target.closest('button, a, input, details, .menu, .pnote')) openDrawer(item)
  })
  document.addEventListener('click', (e) => {
    if (state.menuKey && !e.target.closest('.menu, [data-act="menu"]')) closeMenu(false)
  })
  main.addEventListener('focusout', (e) => {
    if (!state.menuKey || !e.relatedTarget) return
    const holder = e.relatedTarget.closest?.(HOLDER)
    if (holder && holderKey(holder) === state.menuKey && e.relatedTarget.closest('.menu, [data-act="menu"]')) return
    setTimeout(() => closeMenu(false), 0)
  })

  main.addEventListener('input', (e) => {
    if (e.target.id === 'fav-newcat') state.favNewName = e.target.value
    else if (e.target.id === 'fav-rename') state.favRenameValue = e.target.value
    else onCfgInput(e)
  })
  main.addEventListener('submit', (e) => {
    e.preventDefault()
    if (e.target.id === 'hook-form') submitHook()
    else if (e.target.id === 'mcp-form') submitMcp()
    else if (e.target.dataset.form === 'cat-new') submitNewCat()
    else if (e.target.dataset.form === 'cat-rename') submitRename(e.target)
  })

  const clearDrop = () => {
    for (const n of document.querySelectorAll('.drop-over, .drop-before, .drop-after'))
      n.classList.remove('drop-over', 'drop-before', 'drop-after')
  }
  const isAfter = (e, row) => {
    const r = row.getBoundingClientRect()
    return e.clientY > r.top + r.height / 2
  }
  main.addEventListener('dragstart', (e) => {
    const row = e.target.closest?.('.fav-sec .lrow[draggable="true"]')
    if (!row) return
    state.dragKey = holderKey(row)
    row.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', state.dragKey)
  })
  main.addEventListener('dragover', (e) => {
    if (!state.dragKey) return
    const sec = e.target.closest('.fav-sec')
    if (!sec) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    clearDrop()
    sec.classList.add('drop-over')
    const row = e.target.closest('.fav-sec .lrow')
    if (row && holderKey(row) !== state.dragKey) row.classList.add(isAfter(e, row) ? 'drop-after' : 'drop-before')
  })
  main.addEventListener('dragleave', (e) => {
    const sec = e.target.closest?.('.fav-sec')
    if (sec && !sec.contains(e.relatedTarget)) clearDrop()
  })
  main.addEventListener('drop', (e) => {
    if (!state.dragKey) return
    const sec = e.target.closest('.fav-sec')
    if (!sec) return
    e.preventDefault()
    const row = e.target.closest('.fav-sec .lrow')
    const plan = placeFav(
      state.dragKey,
      sec.dataset.cat || null,
      row ? holderKey(row) : null,
      row ? isAfter(e, row) : true
    )
    state.dragKey = null
    clearDrop()
    if (plan) saveOrder(plan)
  })
  main.addEventListener('dragend', () => {
    state.dragKey = null
    clearDrop()
    for (const c of document.querySelectorAll('.dragging')) c.classList.remove('dragging')
  })
}

async function start() {
  $('dr').inert = true
  wire()
  state.page = Object.hasOwn(PAGES, location.hash.slice(1)) ? location.hash.slice(1) : 'dash'
  try {
    await refresh()
    loadActivity()
    await loadProjectFiles()
    render()
  } catch (err) {
    const box = $('load-error')
    box.hidden = false
    box.textContent = `Could not load the inventory: ${err.message}. Open the link the CLI printed, which carries the token.`
  }
}

start()
