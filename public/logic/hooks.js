import { baseName, unquote } from '../core/format.js'

export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact'
]

export const HOOK_INFO = [
  ['SessionStart', 'When a session starts, resumes, or clears.'],
  ['InstructionsLoaded', 'When Claude Code loads a CLAUDE.md or rules file.'],
  ['UserPromptSubmit', 'When you send a prompt, before Claude reads it. It can block the prompt.'],
  ['PreToolUse', 'Before Claude runs a tool. It can block the tool.'],
  ['PermissionRequest', 'When Claude asks you for permission. It can allow or deny for you.'],
  ['PostToolUse', 'After a tool runs with success.'],
  ['PostToolUseFailure', 'After a tool fails.'],
  ['Notification', 'When Claude Code shows a notification, such as a permission prompt.'],
  ['SubagentStart', 'When a subagent starts.'],
  ['SubagentStop', 'When a subagent finishes.'],
  ['TaskCreated', 'When Claude creates a task.'],
  ['TaskCompleted', 'When a task is marked complete.'],
  ['TeammateIdle', 'When a team agent is about to go idle.'],
  ['Stop', 'When Claude finishes its reply. It can make Claude continue.'],
  ['StopFailure', 'When a reply stops because of an API error.'],
  ['PreCompact', 'Before Claude Code compacts the conversation.'],
  ['PostCompact', 'After Claude Code compacts the conversation.'],
  ['ConfigChange', 'When a settings file changes during the session.'],
  ['WorktreeCreate', 'When Claude Code creates a git worktree.'],
  ['WorktreeRemove', 'When Claude Code removes a git worktree.'],
  ['Elicitation', 'When an MCP server asks you for input.'],
  ['ElicitationResult', 'After you answer an MCP server request.'],
  ['SessionEnd', 'When the session ends.']
]

const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'])

const SCRIPT_RE = /[\w@.-]+\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|rb|cmd|ps1)\b/g

const INLINE = { node: 'Node', bun: 'Bun', deno: 'Deno', python: 'Python', python3: 'Python', ruby: 'Ruby' }

const SHELLS = new Set(['sh', 'bash', 'zsh'])

const SHELL_WORDS = new Set(['if', 'for', 'while', 'case', '[', '[[', '{', '(', 'test', 'until'])

export function hookLabel(h) {
  const command = String(h.command ?? '').trim()
  if (!command) return h.type === 'prompt' ? 'Prompt hook' : h.type === 'agent' ? 'Agent hook' : '(no command)'
  const scripts = command.match(SCRIPT_RE)
  if (scripts) return baseName(scripts[scripts.length - 1])
  const tokens = command.match(/'[^']*'|"[^"]*"|\S+/g) ?? []
  const first = unquote(tokens[0] ?? '')
  const flag = tokens[1]
  if (INLINE[first] && (flag === '-e' || flag === '-c')) return `Inline ${INLINE[first]} script`
  if (SHELLS.has(first) && flag === '-c') return 'Inline shell script'
  if (SHELL_WORDS.has(first) || /^[A-Z_]+=/.test(first)) return 'Inline shell script'
  return baseName(first) || command
}

export function hookRunsFor(h) {
  const m = String(h.matcher ?? '').trim()
  const any = !m || m === '*' || m === '.*'
  const names = m.split('|').join(', ')
  if (TOOL_EVENTS.has(h.event)) return any ? 'All tools' : `Tools: ${names}`
  if (h.event === 'SessionStart') return any ? 'Every start' : `On: ${names}`
  return any ? '' : `Matcher: ${m}`
}
