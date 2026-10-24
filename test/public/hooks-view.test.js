import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hookLabel, hookRunsFor } from '../../public/logic/hooks.js'

test('hookLabel names the script file of a command', () => {
  assert.equal(hookLabel({ command: '$CLAUDE_PROJECT_DIR/.claude/hooks/check-format.sh' }), 'check-format.sh')
  assert.equal(hookLabel({ command: 'node ~/.claude/hooks/guard.mjs --strict' }), 'guard.mjs')
  assert.equal(hookLabel({ command: 'python3 "/opt/my hooks/lint.py"' }), 'lint.py')
})

test('hookLabel uses the last script when a command names several', () => {
  assert.equal(hookLabel({ command: 'bash setup.sh && node run.js' }), 'run.js')
})

test('hookLabel does not take a longer extension for a script extension', () => {
  assert.equal(hookLabel({ command: 'cat config.json' }), 'cat')
})

test('hookLabel names an inline interpreter script', () => {
  assert.equal(hookLabel({ command: 'node -e "process.exit(0)"' }), 'Inline Node script')
  assert.equal(hookLabel({ command: 'python3 -c "print(1)"' }), 'Inline Python script')
  assert.equal(hookLabel({ command: 'bun -e "1"' }), 'Inline Bun script')
})

test('hookLabel names an inline shell script', () => {
  assert.equal(hookLabel({ command: 'bash -c "echo hi"' }), 'Inline shell script')
  assert.equal(hookLabel({ command: 'if [ -f x ]; then echo y; fi' }), 'Inline shell script')
  assert.equal(hookLabel({ command: '[[ -n "$X" ]] && exit 2' }), 'Inline shell script')
  assert.equal(hookLabel({ command: 'FOO=1 echo hi' }), 'Inline shell script')
})

test('hookLabel uses the base name of the first word of a plain command', () => {
  assert.equal(hookLabel({ command: '/usr/local/bin/terminal-notifier -message done' }), 'terminal-notifier')
  assert.equal(hookLabel({ command: "'/opt/my tools/notify' now" }), 'notify')
  assert.equal(hookLabel({ command: '  jq .tool_input | prettier --write  ' }), 'jq')
})

test('hookLabel names a hook without a command by its type', () => {
  assert.equal(hookLabel({ type: 'prompt', prompt: 'Check it' }), 'Prompt hook')
  assert.equal(hookLabel({ type: 'agent' }), 'Agent hook')
  assert.equal(hookLabel({ type: 'command' }), '(no command)')
  assert.equal(hookLabel({ command: '   ' }), '(no command)')
  assert.equal(hookLabel({}), '(no command)')
})

test('hookRunsFor lists the tools of a tool event', () => {
  assert.equal(hookRunsFor({ event: 'PreToolUse', matcher: 'Edit|Write' }), 'Tools: Edit, Write')
  assert.equal(hookRunsFor({ event: 'PermissionRequest', matcher: 'Bash' }), 'Tools: Bash')
  assert.equal(hookRunsFor({ event: 'PostToolUseFailure', matcher: 'Read' }), 'Tools: Read')
})

test('hookRunsFor says All tools for an empty or wildcard matcher on a tool event', () => {
  for (const matcher of [undefined, '', '  ', '*', '.*']) {
    assert.equal(hookRunsFor({ event: 'PostToolUse', matcher }), 'All tools')
  }
})

test('hookRunsFor describes SessionStart sources', () => {
  assert.equal(hookRunsFor({ event: 'SessionStart', matcher: 'startup|resume' }), 'On: startup, resume')
  assert.equal(hookRunsFor({ event: 'SessionStart', matcher: '*' }), 'Every start')
  assert.equal(hookRunsFor({ event: 'SessionStart' }), 'Every start')
})

test('hookRunsFor shows the raw matcher for other events and nothing for a wildcard', () => {
  assert.equal(hookRunsFor({ event: 'PreCompact', matcher: 'manual|auto' }), 'Matcher: manual|auto')
  assert.equal(hookRunsFor({ event: 'Stop', matcher: '' }), '')
  assert.equal(hookRunsFor({ event: 'Notification', matcher: '*' }), '')
})
