import { deleteRow, loadProjectFiles, refresh, reveal, star, toggle, uninstallPlugin } from './core/actions.js'
import { $, HOLDER, cardKey, holderKey, trapTab } from './core/dom.js'
import { ago } from './core/format.js'
import { chipFilter, dr, groupOpen, items, state } from './core/state.js'
import { PAGES } from './logic/catalog.js'
import { cfgDirty } from './logic/config.js'
import { loadActivity, undo } from './pages/activity.js'
import { needUsage, setPeriod } from './pages/dash.js'
import { checkAgain, onDoctor } from './pages/doctor.js'
import { keepOnly } from './pages/dups.js'
import { cancelRename, onFavCat, placeFav, saveOrder, submitNewCat, submitRename } from './pages/fav.js'
import { submitHook } from './pages/hooks.js'
import { submitMcp } from './pages/mcp.js'
import { setSort, switchOffUnused } from './ui/chips.js'
import { onCfg, onCfgInput, saveEd } from './ui/config-panels.js'
import { formatText } from './ui/drawer-body.js'
import { closeDrawer, closeDrawerMenu, drawerOpen, isDirty, onDrawerClick, openDrawer, saveFile } from './ui/drawer.js'
import { closeFavPop, placeFavPop, starItem } from './ui/fav-popover.js'
import { closeMenu, menuKeys, openMenu } from './ui/menu.js'
import { go, render } from './ui/nav.js'
import { onPaletteKey, wirePalette } from './ui/palette.js'
import { showBoot } from './ui/skeleton.js'

function wire() {
  wirePalette()
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
    if (onPaletteKey(e)) return
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
  showBoot(state.page)
  needUsage(state.page)
  try {
    await refresh()
    loadActivity()
    await loadProjectFiles()
    render()
  } catch (err) {
    $('p-boot').hidden = true
    const box = $('load-error')
    box.hidden = false
    box.textContent = `Could not load the inventory: ${err.message}. Open the link the CLI printed, which carries the token.`
  }
}

start()
