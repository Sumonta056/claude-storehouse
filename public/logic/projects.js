import { state } from '../core/state.js'

export function projectRows() {
  const rows = state.usage?.byProject?.[state.usagePeriod]
  return Array.isArray(rows) ? rows : []
}

export function topProjects(rows, n = 3) {
  return [...rows].sort((a, b) => b.tokens - a.tokens).slice(0, n)
}

export function matchProjects(rows, query) {
  const q = query.trim().toLowerCase()
  return q ? rows.filter((r) => r.project.toLowerCase().includes(q)) : rows
}

export function findProject(rows, name) {
  return rows.find((r) => r.project === name) ?? null
}

export function lastActive(row) {
  return (row.list ?? []).reduce((max, s) => (s.end !== null && s.end > max ? s.end : max), 0) || null
}

export function projectTotals(row) {
  return (row.list ?? []).reduce(
    (t, s) => ({ responses: t.responses + s.responses, longest: Math.max(t.longest, sessionSpan(s)) }),
    { responses: 0, longest: 0 }
  )
}

export function sessionSpan(session) {
  return session.start !== null && session.end !== null ? session.end - session.start : 0
}
