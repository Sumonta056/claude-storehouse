import { esc } from '../core/format.js'

export function isMd(file) {
  return /\.md(\.disabled)?$/i.test(file ?? '')
}

function hlInline(text) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<span class="hl-c">${part}</span>`
      return part
        .replace(/(\*\*[^*]+\*\*)/g, '<span class="hl-b">$1</span>')
        .replace(/(^|[^\w*])(\*[^*\s](?:[^*]*[^*\s])?\*)(?!\w)/g, '$1<span class="hl-i">$2</span>')
        .replace(/(\[[^\]]+\]\([^)\s]+\))/g, '<span class="hl-a">$1</span>')
    })
    .join('')
}

export function highlight(src, file) {
  if (!isMd(file)) return `${esc(src)}\n`
  const lines = src.split('\n')
  let front = lines[0] === '---'
  let fence = false
  return `${lines
    .map((line, n) => {
      const e = esc(line)
      if (front) {
        if (n > 0 && line === '---') front = false
        if (line === '---') return `<span class="hl-fm">${e}</span>`
        return e.replace(/^([\w-]+)(:)/, '<span class="hl-key">$1</span><span class="hl-fm">$2</span>')
      }
      if (/^\s*```/.test(line)) {
        fence = !fence
        return `<span class="hl-fence">${e}</span>`
      }
      if (fence) return `<span class="hl-c">${e}</span>`
      if (/^#{1,6}\s/.test(line)) return `<span class="hl-h">${e}</span>`
      if (/^>/.test(line)) return `<span class="hl-q">${e}</span>`
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return `<span class="hl-fm">${e}</span>`
      const li = /^(\s*)([-*+]|\d+[.)])(\s.*)$/.exec(e)
      if (li) return `${li[1]}<span class="hl-li">${li[2]}</span>${hlInline(li[3])}`
      return hlInline(e)
    })
    .join('\n')}\n`
}

function inline(text) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${part.slice(1, -1)}</code>`
      return part
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^\w*])\*([^*\s](?:[^*]*[^*\s])?)\*(?!\w)/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\(([^\s]+?)\)(?=\s|$|[.,;:!?])/g, '$1 <span class="link">($2)</span>')
    })
    .join('')
}

function tableCells(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => inline(esc(c.trim())))
}

function splitFront(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src)
  if (!m) return { meta: [], body: src }
  const meta = []
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line)
    if (kv) meta.push([kv[1], kv[2]])
    else if (meta.length && line.trim()) meta[meta.length - 1][1] += ` ${line.trim()}`
  }
  return { meta, body: src.slice(m[0].length) }
}

function markdown(body) {
  const lines = body.split(/\r?\n/)
  const out = []
  const blockStart = /^(\s*```|#{1,6}\s|>|\s*\||\s*[-*+]\s|\s*\d+[.)]\s)/
  const rule = /^\s*([-*_])(\s*\1){2,}\s*$/
  const tableSep = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*```\s*([\w+-]*)/.exec(line)
    if (fence) {
      const code = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
      i++
      const label = fence[1] ? `<figcaption>${esc(fence[1])}</figcaption>` : ''
      out.push(`<figure class="code">${label}<pre><code>${esc(code.join('\n'))}</code></pre></figure>`)
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const level = Math.min(h[1].length + 2, 6)
      out.push(`<h${level}>${inline(esc(h[2]))}</h${level}>`)
      i++
      continue
    }
    if (rule.test(line)) {
      out.push('<hr>')
      i++
      continue
    }
    if (/^>/.test(line)) {
      const quote = []
      while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${markdown(quote.join('\n'))}</blockquote>`)
      continue
    }
    if (/^\s*\|/.test(line) && tableSep.test(lines[i + 1] ?? '')) {
      const head = tableCells(line)
      i += 2
      const rows = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(tableCells(lines[i++]))
      out.push(
        `<div class="tbl-md"><table><thead><tr>${head.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      )
      continue
    }
    const listKind = /^\s*[-*+]\s+/.test(line) ? 'ul' : /^\s*\d+[.)]\s+/.test(line) ? 'ol' : null
    if (listKind) {
      const re = listKind === 'ul' ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/
      const lis = []
      while (i < lines.length && re.test(lines[i])) lis.push(`<li>${inline(esc(re.exec(lines[i++])[1]))}</li>`)
      out.push(`<${listKind}>${lis.join('')}</${listKind}>`)
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !blockStart.test(lines[i])) para.push(lines[i++])
    if (!para.length) para.push(lines[i++])
    out.push(`<p>${inline(esc(para.join(' ')))}</p>`)
  }
  return out.join('')
}

function fmValues(key, value) {
  const v = value.trim()
  const list = /^\[.*\]$/.test(v)
    ? v.slice(1, -1).split(',')
    : v.startsWith('- ')
      ? v.slice(2).split(/\s+-\s+/)
      : /tools$/i.test(key)
        ? v.split(/,\s*/)
        : [v]
  return list.map((x) => x.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean)
}

function fmCardHtml(meta) {
  if (!meta.length) return ''
  const rows = meta.map(([k, v]) => {
    const values = fmValues(k, v)
    const accent = k === 'model' ? ' k' : ''
    const dd =
      values.length > 1 || accent || /tools$/i.test(k)
        ? values.map((x) => `<span class="fm-chip${accent}">${esc(x)}</span>`).join('')
        : `<span>${esc(values[0] ?? '')}</span>`
    return `<div class="fm-row"><dt>${esc(k)}</dt><dd>${dd}</dd></div>`
  })
  return `<section class="fm-card" aria-label="Frontmatter"><h3 class="fm-h">Frontmatter</h3><dl>${rows.join('')}</dl></section>`
}

export function previewHtml(src, file, hide = []) {
  if (file && !isMd(file)) return `<pre><code>${esc(src)}</code></pre>`
  const { meta, body } = splitFront(src)
  const html = markdown(body)
  return fmCardHtml(meta.filter(([k]) => !hide.includes(k))) + (html || '<p class="note">Nothing to preview.</p>')
}
