export const CAPS = { items: 8, pages: 5, actions: 3 }

const RECENT_MAX = 5

const SCOPE_RANK = { global: 0, project: 1, plugin: 2 }

export function scoreMatch(text, query) {
  const t = String(text ?? '').toLowerCase()
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!q || !t) return 0
  if (t.startsWith(q)) return 3
  for (let i = t.indexOf(q); i > 0; i = t.indexOf(q, i + 1)) if (!/[a-z0-9]/.test(t[i - 1])) return 2
  let at = 0
  for (const ch of t) if (ch === q[at]) at++
  return at === q.length ? 1 : 0
}

function itemScore(item, query) {
  const name = scoreMatch(item.name, query)
  if (name) return 20 + name
  const plugin = scoreMatch(item.plugin, query)
  if (plugin) return 10 + plugin
  return scoreMatch(item.description, query)
}

function ranked(list, score, tie) {
  return list
    .map((value) => ({ value, score: score(value) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || tie(a.value, b.value))
    .map((r) => r.value)
}

function itemTie(a, b) {
  return (SCOPE_RANK[a.scope] ?? 3) - (SCOPE_RANK[b.scope] ?? 3) || String(a.name).localeCompare(String(b.name))
}

export function paletteResults(query, { items, pages, actions, recent }) {
  const q = String(query ?? '').trim()
  if (!q) {
    const byKey = new Map(items.map((i) => [i.key, i]))
    return {
      items: recent
        .map((k) => byKey.get(k))
        .filter(Boolean)
        .slice(0, CAPS.items),
      pages: pages.slice(0, CAPS.pages),
      actions: actions.slice(0, CAPS.actions)
    }
  }
  return {
    items: ranked(items, (i) => itemScore(i, q), itemTie).slice(0, CAPS.items),
    pages: ranked(
      pages,
      (p) => scoreMatch(p.title, q),
      () => 0
    ).slice(0, CAPS.pages),
    actions: ranked(
      actions,
      (a) => scoreMatch(a.label, q),
      () => 0
    ).slice(0, CAPS.actions)
  }
}

export function pushRecent(list, key) {
  return [key, ...list.filter((k) => k !== key)].slice(0, RECENT_MAX)
}
