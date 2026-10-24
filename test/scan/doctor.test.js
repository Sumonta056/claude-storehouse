import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { scanAll } from '../../src/scan/index.js'
import { scanDoctor } from '../../src/scan/doctor.js'
import { readMcpRaw } from '../../src/scan/mcp.js'

function withFixture(fn) {
  const fx = makeFixture()
  try {
    fn(fx)
  } finally {
    fx.cleanup()
  }
}

function doctor(fx, { env = {}, pathDirs = [] } = {}) {
  const inventory = scanAll({ home: fx.home, projectDir: fx.projectDir })
  return scanDoctor({ home: fx.home, projectDir: fx.projectDir, inventory, env, pathDirs })
}

function issues(fx, check, opts) {
  return doctor(fx, opts).issues.filter((i) => i.check === check)
}

function editJson(file, fn) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  fn(data)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

function writeFile(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  if (mode) fs.chmodSync(file, mode)
}

function settingsFile(fx) {
  return path.join(fx.home, '.claude', 'settings.json')
}

function pluginRoot(fx) {
  return path.join(fx.home, '.claude', 'plugins', 'cache', 'claude-plugins-official', 'superpowers', '1.0.0')
}

function fullPath(fx) {
  const bin = path.join(fx.home, 'bin')
  for (const name of ['npx', 'psql-mcp', 'redis-mcp']) writeFile(path.join(bin, name), '#!/bin/sh\n', 0o755)
  return [bin]
}

test('every issue has the documented fields and a known severity', () => {
  withFixture((fx) => {
    const result = doctor(fx)
    assert.ok(result.issues.length > 0)
    assert.ok(result.checked > 0)
    for (const issue of result.issues) {
      assert.deepEqual(Object.keys(issue).sort(), [
        'check',
        'file',
        'id',
        'kind',
        'message',
        'name',
        'severity',
        'target'
      ])
      assert.ok(['error', 'warning', 'info'].includes(issue.severity))
    }
    assert.equal(new Set(result.issues.map((i) => i.id)).size, result.issues.length)
  })
})

test('check 1 reports a config file with invalid JSON', () => {
  withFixture((fx) => {
    assert.deepEqual(issues(fx, 1), [])
    const bad = path.join(fx.home, '.claude.json')
    fs.writeFileSync(bad, '{ nope')
    const found = issues(fx, 1)
    assert.equal(found.length, 1)
    assert.equal(found[0].severity, 'error')
    assert.equal(found[0].file, bad)
  })
})

test('check 2 reports a hook whose first word is a missing path', () => {
  withFixture((fx) => {
    const found = issues(fx, 2)
    assert.deepEqual(found.map((i) => i.name).sort(), ['~/.claude/hooks/pre-bash.sh', '~/.claude/hooks/stop.sh'])
    assert.ok(found.every((i) => i.severity === 'warning' && i.file === settingsFile(fx)))
    writeFile(path.join(fx.home, '.claude', 'hooks', 'stop.sh'), '#!/bin/sh\n')
    writeFile(path.join(fx.home, '.claude', 'hooks', 'pre-bash.sh'), '#!/bin/sh\n')
    assert.deepEqual(issues(fx, 2), [])
  })
})

test('check 2 expands CLAUDE_PROJECT_DIR and CLAUDE_PLUGIN_ROOT and skips plain commands', () => {
  withFixture((fx) => {
    writeFile(path.join(fx.home, '.claude', 'hooks', 'stop.sh'), '')
    writeFile(path.join(fx.home, '.claude', 'hooks', 'pre-bash.sh'), '')
    editJson(path.join(fx.projectDir, '.claude', 'settings.json'), (data) => {
      data.hooks.Stop = [{ hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/x.sh --fast' }] }]
    })
    editJson(path.join(pluginRoot(fx), 'hooks', 'hooks.json'), (data) => {
      data.hooks.Stop = [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/run.sh' }] }]
    })
    assert.deepEqual(
      issues(fx, 2)
        .map((i) => i.name)
        .sort(),
      ['"$CLAUDE_PROJECT_DIR"/.claude/hooks/x.sh', '${CLAUDE_PLUGIN_ROOT}/hooks/run.sh']
    )
    writeFile(path.join(fx.projectDir, '.claude', 'hooks', 'x.sh'), '')
    writeFile(path.join(pluginRoot(fx), 'hooks', 'run.sh'), '')
    assert.deepEqual(issues(fx, 2), [])
  })
})

test('check 2 ignores hooks that are off', () => {
  withFixture((fx) => {
    editJson(settingsFile(fx), (data) => {
      data.enabledPlugins['superpowers@claude-plugins-official'] = false
      delete data.hooks
    })
    editJson(path.join(pluginRoot(fx), 'hooks', 'hooks.json'), (data) => {
      data.hooks.Stop = [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/run.sh' }] }]
    })
    assert.deepEqual(issues(fx, 2), [])
  })
})

test('check 2 stops the path at shell operators and reads escaped spaces', () => {
  withFixture((fx) => {
    const dir = path.join(fx.home, 'My Scripts')
    const run = path.join(dir, 'run.sh')
    writeFile(run, '')
    const escaped = run.replace(/ /g, '\\ ')
    const commands = [
      `${escaped};echo done`,
      `${escaped}&&exit 0`,
      `${escaped}>/dev/null 2>&1`,
      `${escaped}|jq .`,
      `(${escaped})`,
      `"${run}"`
    ]
    editJson(settingsFile(fx), (data) => {
      data.hooks = { Stop: [{ hooks: commands.map((command) => ({ type: 'command', command })) }] }
    })
    assert.deepEqual(issues(fx, 2), [])
    fs.rmSync(run)
    assert.equal(issues(fx, 2).length, commands.length)
  })
})

test('check 3 reports a stdio MCP command that is not on PATH', () => {
  withFixture((fx) => {
    const names = issues(fx, 3)
      .map((i) => i.name)
      .sort()
    assert.deepEqual(names, ['context7', 'kubernetes', 'postgres'])
    assert.ok(issues(fx, 3).every((i) => i.severity === 'warning' && /PATH of this terminal/.test(i.message)))
    assert.deepEqual(issues(fx, 3, { pathDirs: fullPath(fx) }), [])
  })
})

test('check 3 needs an executable file and checks absolute and plugin-root commands', () => {
  withFixture((fx) => {
    const bin = path.join(fx.home, 'bin')
    writeFile(path.join(bin, 'npx'), '', 0o644)
    writeFile(path.join(bin, 'psql-mcp'), '', 0o755)
    editJson(path.join(fx.projectDir, '.mcp.json'), (data) => {
      data.mcpServers.postgres.command = path.join(fx.home, 'tools', 'pg')
    })
    editJson(path.join(pluginRoot(fx), '.mcp.json'), (data) => {
      data.mcpServers.context7.command = '${CLAUDE_PLUGIN_ROOT}/bin/ctx'
    })
    assert.deepEqual(
      issues(fx, 3, { pathDirs: [bin] })
        .map((i) => i.name)
        .sort(),
      ['context7', 'kubernetes', 'postgres']
    )
    writeFile(path.join(fx.home, 'tools', 'pg'), '', 0o755)
    writeFile(path.join(pluginRoot(fx), 'bin', 'ctx'), '', 0o755)
    fs.chmodSync(path.join(bin, 'npx'), 0o755)
    assert.deepEqual(issues(fx, 3, { pathDirs: [bin] }), [])
  })
})

test('check 3 skips MCP servers that are off', () => {
  withFixture((fx) => {
    const names = issues(fx, 3).map((i) => i.name)
    assert.ok(!names.includes('redis'))
  })
})

test('check 4 reports an MCP ${VAR} that is not set', () => {
  withFixture((fx) => {
    editJson(path.join(fx.home, '.claude.json'), (data) => {
      data.mcpServers.kubernetes.env.GH = '${GITHUB_TOKEN}'
      data.mcpServers.kubernetes.args.push('--dir=${WORK_DIR:-/tmp}')
    })
    const found = issues(fx, 4, { env: {} })
    assert.equal(found.length, 1)
    assert.equal(found[0].name, 'kubernetes')
    assert.match(found[0].message, /GITHUB_TOKEN/)
    assert.doesNotMatch(found[0].message, /WORK_DIR/)
    assert.deepEqual(issues(fx, 4, { env: { GITHUB_TOKEN: 'x' } }), [])
  })
})

test('check 4 accepts a variable from settings env and CLAUDE_PLUGIN_ROOT', () => {
  withFixture((fx) => {
    editJson(path.join(fx.home, '.claude.json'), (data) => {
      data.mcpServers.kubernetes.env.GH = '${GITHUB_TOKEN}'
    })
    editJson(path.join(pluginRoot(fx), '.mcp.json'), (data) => {
      data.mcpServers.context7.command = '${CLAUDE_PLUGIN_ROOT}/bin/ctx'
    })
    editJson(settingsFile(fx), (data) => {
      data.env = { GITHUB_TOKEN: 'yes' }
    })
    assert.deepEqual(issues(fx, 4, { env: {} }), [])
  })
})

test('check 5 reports enabledPlugins keys for plugins that are not installed', () => {
  withFixture((fx) => {
    assert.deepEqual(issues(fx, 5), [])
    editJson(settingsFile(fx), (data) => {
      data.enabledPlugins['gone@nowhere'] = true
    })
    const found = issues(fx, 5)
    assert.equal(found.length, 1)
    assert.equal(found[0].name, 'gone@nowhere')
    assert.equal(found[0].file, settingsFile(fx))
  })
})

test('check 5 skips builtin and synced plugins, which installed_plugins.json does not list', () => {
  withFixture((fx) => {
    editJson(settingsFile(fx), (data) => {
      data.enabledPlugins['tips@builtin'] = true
      data.enabledPlugins['data@synced'] = false
    })
    assert.deepEqual(issues(fx, 5), [])
  })
})

test('check 6 reports skillOverrides keys for skills that do not exist', () => {
  withFixture((fx) => {
    const found = issues(fx, 6)
    assert.deepEqual(
      found.map((i) => i.name),
      ['old']
    )
    assert.equal(found[0].file, settingsFile(fx))
    assert.equal(found[0].severity, 'info')
    assert.match(found[0].message, /Bundled skills/)
    editJson(settingsFile(fx), (data) => {
      delete data.skillOverrides.old
    })
    assert.deepEqual(issues(fx, 6), [])
  })
})

test('check 6 warns when a skillOverrides key names only a plugin skill', () => {
  withFixture((fx) => {
    editJson(settingsFile(fx), (data) => {
      delete data.skillOverrides.old
      data.skillOverrides.brainstorming = 'off'
    })
    const found = issues(fx, 6)
    assert.equal(found.length, 1)
    assert.equal(found[0].name, 'brainstorming')
    assert.equal(found[0].severity, 'warning')
    assert.match(found[0].message, /Plugin skills ignore skillOverrides/)
  })
})

test('check 7 reports a name with more than one item on', () => {
  withFixture((fx) => {
    assert.deepEqual(issues(fx, 7), [])
    writeFile(path.join(fx.projectDir, '.claude', 'skills', 'html-report', 'SKILL.md'), '---\ndescription: copy\n---\n')
    const found = issues(fx, 7)
    assert.equal(found.length, 1)
    assert.equal(found[0].name, 'html-report')
    assert.equal(found[0].kind, 'skill')
    assert.deepEqual(found[0].target, { page: 'dups' })
    assert.match(found[0].message, /hides the other/)
    editJson(path.join(fx.projectDir, '.claude', 'settings.local.json'), (data) => {
      data.skillOverrides['html-report'] = 'off'
    })
    assert.deepEqual(issues(fx, 7), [])
  })
})

test('check 7 ignores plugin items, which Claude Code namespaces', () => {
  withFixture((fx) => {
    writeFile(path.join(fx.home, '.claude', 'skills', 'brainstorming', 'SKILL.md'), '---\ndescription: mine\n---\n')
    writeFile(path.join(fx.home, '.claude', 'agents', 'reviewer.md'), '---\ndescription: mine\n---\n')
    editJson(path.join(fx.home, '.claude.json'), (data) => {
      data.mcpServers.context7 = { command: 'npx' }
    })
    assert.deepEqual(issues(fx, 7), [])
  })
})

test('check 8 reports a local skill or agent with no description', () => {
  withFixture((fx) => {
    assert.deepEqual(
      issues(fx, 8).map((i) => `${i.kind}:${i.name}`),
      ['skill:nofm']
    )
    writeFile(path.join(fx.home, '.claude', 'agents', 'bare.md'), 'Body only\n')
    assert.deepEqual(
      issues(fx, 8)
        .map((i) => `${i.kind}:${i.name}`)
        .sort(),
      ['agent:bare', 'skill:nofm']
    )
    assert.ok(issues(fx, 8).every((i) => i.severity === 'info'))
  })
})

test('check 9 reports broken links and links outside home', () => {
  withFixture((fx) => {
    assert.deepEqual(issues(fx, 9), [])
    const broken = path.join(fx.home, '.claude', 'skills', 'ghost')
    fs.symlinkSync(path.join(fx.home, 'gone'), broken)
    const outside = fs.mkdtempSync(path.join(path.dirname(fx.home), 'out-'))
    writeFile(path.join(outside, 'far.md'), '---\ndescription: far\n---\n')
    const link = path.join(fx.home, '.claude', 'agents', 'far.md')
    fs.symlinkSync(path.join(outside, 'far.md'), link)
    const found = issues(fx, 9)
    assert.deepEqual(found.map((i) => i.file).sort(), [link, broken].sort())
    assert.ok(found.every((i) => i.severity === 'info'))
  })
})

test('check 10 reports a CLAUDE.md longer than 200 lines', () => {
  withFixture((fx) => {
    const file = path.join(fx.projectDir, 'CLAUDE.md')
    fs.writeFileSync(file, 'line\n'.repeat(200))
    assert.deepEqual(issues(fx, 10), [])
    fs.writeFileSync(file, 'line\n'.repeat(201))
    const found = issues(fx, 10)
    assert.equal(found.length, 1)
    assert.equal(found[0].file, file)
    assert.match(found[0].message, /201 lines/)
  })
})

test('no doctor field holds an env or header value', () => {
  withFixture((fx) => {
    editJson(path.join(fx.home, '.claude.json'), (data) => {
      data.mcpServers.kubernetes.env.GH = '${GITHUB_TOKEN}'
    })
    const text = JSON.stringify(doctor(fx, { env: { OTHER: 'env-value-x' } }))
    assert.ok(!text.includes('secret-value'))
    assert.ok(!text.includes('secret-token'))
    assert.ok(!text.includes('env-value-x'))
  })
})

test('readMcpRaw returns command and variable names, never values', () => {
  withFixture((fx) => {
    const inventory = scanAll({ home: fx.home, projectDir: fx.projectDir })
    const raw = readMcpRaw({ home: fx.home, projectDir: fx.projectDir, plugins: inventory.plugins })
    const kube = raw.find((s) => s.name === 'kubernetes')
    assert.equal(kube.command, 'npx')
    assert.deepEqual(kube.vars, [])
    assert.ok(!JSON.stringify(raw).includes('secret-value'))
    assert.ok(!JSON.stringify(raw).includes('secret-token'))
  })
})
