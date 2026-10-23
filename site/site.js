;(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]

  const PAGE_NAMES = {
    dash: 'Dashboard',
    fav: 'Favorites',
    skills: 'Skills',
    agents: 'Agents',
    plugins: 'Plugins',
    hooks: 'Hooks',
    mcp: 'MCP servers',
    settings: 'Settings',
    claudemd: 'CLAUDE.md'
  }

  const frame = $('#demoFrame')
  const open = $('#demoOpen')
  const title = $('#demoTitle')
  const tabs = $$('.demo-bar [role=tab]')

  const showPage = (page) => {
    tabs.forEach((b) => {
      const on = b.dataset.page === page
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
    })
    title.textContent = `127.0.0.1 · ${PAGE_NAMES[page] ?? page}`
    open.href = `demo/index.html#${page}`
    const win = frame.contentWindow
    if (win && /\/demo\/(index\.html)?$/.test(win.location.pathname)) win.location.hash = page
    else frame.src = `demo/index.html#${page}`
  }

  tabs.forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)))
  $('.demo-tabs').addEventListener('keydown', (e) => {
    const at = tabs.findIndex((b) => b.getAttribute('aria-selected') === 'true')
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const next = tabs[(at + step + tabs.length) % tabs.length]
    showPage(next.dataset.page)
    next.focus()
  })
  $('#demoReset').addEventListener('click', () => {
    const page = tabs.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.page ?? 'dash'
    frame.src = `demo/index.html?reset=${Date.now()}#${page}`
  })
  $$('[data-demo]').forEach((a) => a.addEventListener('click', () => showPage(a.dataset.demo)))

  $$('[data-copy]').forEach((btn) => {
    const label = $('.copy-label', btn)
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy)
        label.textContent = 'Copied'
      } catch {
        label.textContent = 'Select and copy'
      }
      setTimeout(() => (label.textContent = 'Copy'), 1600)
    })
  })

  fetch('https://registry.npmjs.org/claude-storehouse/latest')
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((pkg) => {
      $('#npmMeta').textContent = `Version ${pkg.version} · Node ${pkg.engines?.node ?? '>=20'} · MIT`
    })
    .catch(() => {})

  const zoom = $('#zoom')
  const zoomImg = $('img', zoom)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('img[data-zoom]')
    if (!t) return
    zoomImg.src = t.currentSrc || t.src
    zoomImg.alt = t.alt
    zoom.showModal()
  })
  zoom.addEventListener('click', () => zoom.close())

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue
          en.target.classList.add('in')
          io.unobserve(en.target)
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    )
    $$('.feature, .tut > li, .dl-card, .panel, .rules').forEach((el) => {
      el.classList.add('reveal')
      io.observe(el)
    })
  }
})()
