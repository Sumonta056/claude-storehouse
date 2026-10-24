import { send } from '../api.js'
import { afterWrite, busy } from '../core/actions.js'
import { $, showBanner, toast } from '../core/dom.js'
import { esc, isPlain, opt, tilde } from '../core/format.js'
import { cfg, chipFilter, freshMcpForm, state } from '../core/state.js'
import { pluginLabel, projectOn, visible } from '../logic/catalog.js'
import { keepChip } from '../logic/chips.js'
import { mcpTransport, parseEnv } from '../logic/mcp.js'
import { sortRows } from '../logic/usage.js'
import { formFail } from './hooks.js'
import { chipsHtml } from '../ui/chips.js'
import {
  addButton,
  cellSwitch,
  empty,
  invalidAttr,
  nothingMatches,
  pageBar,
  scopeTag,
  useChips,
  useFlag,
  viaPlugin
} from '../ui/rows.js'

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

export function renderMcp() {
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

export function submitMcp() {
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
