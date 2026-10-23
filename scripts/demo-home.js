#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), 'storehouse-demo-'))
const home = path.join(root, 'home')
const project = path.join(home, 'acme-api')
const claude = path.join(home, '.claude')

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n')
}

function skill(dir, name, description) {
  write(
    path.join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${description}\n`
  )
}

function agent(dir, name, description) {
  write(
    path.join(dir, `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nYou are ${name}. ${description}\n`
  )
}

const userSkills = [
  ['api-design', 'Design REST endpoints with stable contracts and clear error shapes.'],
  ['git-message', 'Write Conventional Commit messages from the staged diff.'],
  ['db-migrations', 'Plan safe, reversible database migrations with a rollback step.'],
  ['release-notes', 'Turn a change range into user-facing release notes.'],
  ['security-review', 'Check a diff for injection, leaked keys, and unsafe input handling.'],
  ['sql-explain', 'Read an EXPLAIN plan and suggest indexes.'],
  ['test-first', 'Write a failing test before the fix, then make it pass.'],
  ['debugging', 'Reproduce, isolate, fix, and guard a bug.'],
  ['ui-polish', 'Tighten spacing, contrast, and type scale on a page.']
]
for (const [n, d] of userSkills) skill(path.join(claude, 'skills'), n, d)
agent(path.join(claude, 'agents'), 'code-reviewer', 'Review a diff for correctness, readability, and risk.')
agent(path.join(claude, 'agents'), 'doc-writer', 'Write and update README and API docs.')
write(
  path.join(claude, 'agents', 'perf-auditor.md.disabled'),
  '---\nname: perf-auditor\ndescription: Profile hot paths and suggest fixes.\n---\n'
)
write(path.join(claude, 'CLAUDE.md'), '# Global rules\n\n- Plan before code.\n- Ask before git push.\n')

const plugins = {
  'toolkit@demo-market': {
    skills: [
      ['brainstorm', 'Explore options before you pick a design.'],
      ['debugging', 'Reproduce, isolate, fix, and guard a bug.'],
      ['write-plan', 'Break a spec into small verifiable tasks.']
    ],
    agents: [['planner', 'Turn a goal into an ordered task list.']]
  },
  'docs-kit@demo-market': {
    skills: [
      ['diagram', 'Draw architecture and sequence diagrams.'],
      ['changelog', 'Keep CHANGELOG.md in Keep a Changelog format.']
    ],
    agents: []
  },
  'frontend@design-market': {
    skills: [
      ['a11y-check', 'Audit a page for keyboard, focus, and contrast issues.'],
      ['responsive', 'Make a layout work from phone to desktop.']
    ],
    agents: [['ui-critic', 'Critique a UI against a design system.']]
  }
}
const installed = { version: 2, plugins: {} }
for (const [id, def] of Object.entries(plugins)) {
  const [name, market] = id.split('@')
  const dir = path.join(claude, 'plugins', 'cache', market, name, '1.2.0')
  write(path.join(dir, '.claude-plugin', 'plugin.json'), { name, version: '1.2.0', description: `${name} plugin` })
  for (const [n, d] of def.skills) skill(path.join(dir, 'skills'), n, d)
  for (const [n, d] of def.agents) agent(path.join(dir, 'agents'), n, d)
  installed.plugins[id] = [
    {
      scope: 'user',
      installPath: dir,
      version: '1.2.0',
      installedAt: '2026-09-01T00:00:00.000Z',
      lastUpdated: '2026-10-01T00:00:00.000Z'
    }
  ]
}
write(path.join(claude, 'plugins', 'installed_plugins.json'), installed)

write(path.join(claude, 'settings.json'), {
  enabledPlugins: { 'toolkit@demo-market': true, 'docs-kit@demo-market': true, 'frontend@design-market': false },
  skillOverrides: { 'sql-explain': 'off' },
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '~/.claude/hooks/guard-bash.sh' }] }],
    Stop: [{ hooks: [{ type: 'command', command: '~/.claude/hooks/notify.sh' }] }]
  }
})
write(path.join(claude, 'storehouse.json'), {
  favoriteCategories: ['Plan', 'Build', 'Review'],
  favorites: [
    { kind: 'skill', name: 'brainstorm', source: 'toolkit@demo-market', order: 0, category: 'Plan' },
    { kind: 'skill', name: 'write-plan', source: 'toolkit@demo-market', order: 1, category: 'Plan' },
    { kind: 'skill', name: 'test-first', source: 'local', order: 2, category: 'Build' },
    { kind: 'skill', name: 'api-design', source: 'local', order: 3, category: 'Build' },
    { kind: 'skill', name: 'db-migrations', source: 'local', order: 4, category: 'Build' },
    { kind: 'agent', name: 'code-reviewer', source: 'local', order: 5, category: 'Review' },
    { kind: 'skill', name: 'security-review', source: 'local', order: 6, category: 'Review' }
  ],
  parkedHooks: []
})
write(path.join(home, '.claude.json'), {
  mcpServers: {
    github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { LOG_LEVEL: 'info' } },
    postgres: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgres://localhost/demo'] }
  },
  projects: { [project]: { disabledMcpServers: ['postgres'] } }
})

skill(path.join(project, '.claude', 'skills'), 'deploy-checklist', 'Run the pre-deploy checks for acme-api.')
skill(path.join(project, '.claude', 'skills'), 'seed-data', 'Load demo data into the local database.')
agent(path.join(project, '.claude', 'agents'), 'repo-guide', 'Answer questions about this repo layout.')
agent(path.join(project, '.claude', 'agents'), 'code-reviewer', 'Review acme-api diffs against the team checklist.')
write(path.join(project, '.claude', 'settings.json'), { permissions: { allow: ['Bash(npm test:*)'] } })
write(path.join(project, 'CLAUDE.md'), '# acme-api\n\nRun `npm test` before you push.\n')
write(path.join(project, '.mcp.json'), {
  mcpServers: { sentry: { type: 'http', url: 'https://mcp.sentry.example/mcp' } }
})

const sessions = [
  ['-home-acme-api', 'claude-opus-5-5', 42],
  ['-home-acme-api', 'claude-sonnet-5', 30],
  ['-home-acme-web', 'claude-opus-5-5', 26],
  ['-home-acme-web', 'claude-haiku-5', 18],
  ['-home-infra', 'claude-sonnet-5', 22]
]
const today = new Date()
sessions.forEach(([dir, model, turns], s) => {
  const lines = []
  for (let t = 0; t < turns; t++) {
    const day = new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - ((s + t) % 9)), 10, t)
    lines.push(
      JSON.stringify({
        type: 'assistant',
        sessionId: `demo-session-${s + 1}`,
        timestamp: day.toISOString(),
        requestId: `req_${s}_${t}`,
        message: {
          id: `msg_${s}_${t}`,
          model,
          usage: {
            input_tokens: 1200 + t * 40,
            output_tokens: 900 + ((t * 137) % 1600),
            cache_creation_input_tokens: t % 6 === 0 ? 18000 : 2400,
            cache_read_input_tokens: 42000 + t * 3100
          }
        }
      })
    )
  }
  write(path.join(claude, 'projects', dir, `session-${s + 1}.jsonl`), lines.join('\n') + '\n')
})

console.log(JSON.stringify({ home, project }))
