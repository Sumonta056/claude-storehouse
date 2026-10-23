import fs from 'node:fs'
import { toggle } from './toggles.js'
import { setFavorite } from './favorites.js'
import { restoreBackup } from './json-file.js'

const KINDS = ['toggle', 'favorite', 'save']

function stampOf(file) {
  try {
    const stat = fs.statSync(file)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
}

export class Activity {
  #entries = []
  #nextId = 1

  record({ file, message, kind, undo = null, backup = null, isUndo = false }) {
    if (!KINDS.includes(kind)) throw new Error(`unknown activity kind ${kind}`)
    const entry = {
      id: String(this.#nextId++),
      time: new Date().toISOString(),
      file,
      message,
      kind,
      undo,
      backup,
      isUndo,
      undone: false,
      stamp: kind === 'save' ? stampOf(file) : null
    }
    this.#entries.push(entry)
    return this.#view(entry, this.#latestSaves())
  }

  list() {
    const latest = this.#latestSaves()
    return this.#entries.map((entry) => this.#view(entry, latest)).reverse()
  }

  undo(id, ctx) {
    const entry = this.#entries.find((e) => e.id === id)
    if (!entry) return { ok: false, error: `no activity entry ${id}` }
    const latest = this.#latestSaves()
    if (!this.#canUndo(entry, latest)) {
      const changed = entry.kind === 'save' && latest.get(entry.file) === entry.id && entry.backup
      const error = changed
        ? `${entry.file} changed since this save; undo refused`
        : 'this change can no longer be undone'
      return { ok: false, error }
    }
    let result
    try {
      result = this.#apply(entry, ctx)
    } catch (err) {
      return { ok: false, error: err.message }
    }
    if (!result.ok) return result
    entry.undone = true
    if (entry.kind === 'save') {
      const previous = this.#latestSaves().get(entry.file)
      const prior = this.#entries.find((e) => e.id === previous)
      if (prior) prior.stamp = stampOf(entry.file)
    }
    const recorded = this.record({
      file: result.file ?? entry.file,
      message: `Undid: ${entry.message}`,
      kind: entry.kind,
      isUndo: true
    })
    return { ...result, entry: recorded }
  }

  #apply(entry, ctx) {
    if (entry.kind === 'toggle') return toggle(entry.undo, ctx)
    if (entry.kind === 'favorite') {
      setFavorite({ ...entry.undo, favorite: !entry.undo.favorite }, ctx.home)
      return { ok: true, file: entry.file }
    }
    if (entry.kind === 'save') return { ...restoreBackup(entry.backup, entry.file, ctx.home, ctx), file: entry.file }
    return { ok: false, error: `unknown entry kind ${entry.kind}` }
  }

  #latestSaves() {
    const latest = new Map()
    for (const entry of this.#entries) {
      if (entry.kind === 'save' && !entry.isUndo && !entry.undone) latest.set(entry.file, entry.id)
    }
    return latest
  }

  #canUndo(entry, latest) {
    if (entry.isUndo || entry.undone) return false
    if (entry.kind === 'save')
      return Boolean(entry.backup) && latest.get(entry.file) === entry.id && stampOf(entry.file) === entry.stamp
    return entry.undo !== null && entry.undo !== undefined
  }

  #view(entry, latest) {
    return {
      id: entry.id,
      time: entry.time,
      file: entry.file,
      message: entry.message,
      kind: entry.kind,
      canUndo: this.#canUndo(entry, latest)
    }
  }
}
