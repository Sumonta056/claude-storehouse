import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeFixture } from '../helpers/fixture.js'
import { toggle } from '../../src/write/toggles.js'
import { scanAll } from '../../src/scan/index.js'

const SP = 'superpowers@claude-plugins-official'

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function withFixture(fn) {
  const fx = makeFixture()
  const ctx = { home: fx.home, projectDir: fx.projectDir }
  const files = {
    global: path.join(fx.home, '.claude', 'settings.json'),
    project: path.join(fx.projectDir, '.claude', 'settings.json'),
    local: path.join(fx.projectDir, '.claude', 'settings.local.json'),
    claudeJson: path.join(fx.home, '.claude.json'),
    storehouse: path.join(fx.home, '.claude', 'storehouse.json')
  }
  try {
    fn({ fx, ctx, files })
  } finally {
    fx.cleanup()
  }
}

function assertBackup(result) {
  assert.equal(result.ok, true, result.error)
  assert.ok(result.backup, 'backup path returned')
  assert.ok(fs.existsSync(result.backup), 'backup file exists')
}

test('plugin off writes enabledPlugins false in global settings and keeps model', () => {
  withFixture(({ ctx, files }) => {
    const r = toggle({ kind: 'plugin', name: SP, scope: 'global', enabled: false }, ctx)
    assertBackup(r)
    assert.equal(r.file, files.global)
    const data = read(files.global)
    assert.equal(data.enabledPlugins[SP], false)
    assert.equal(data.enabledPlugins['ecc@ecc'], false)
    assert.equal(data.model, 'fable')
    assert.deepEqual(r.undo, { kind: 'plugin', name: SP, scope: 'global', enabled: true })
  })
})

test('plugin undo restores the original value', () => {
  withFixture(({ ctx, files }) => {
    const before = read(files.global)
    const r = toggle({ kind: 'plugin', name: SP, scope: 'global', enabled: false }, ctx)
    const u = toggle(r.undo, ctx)
    assertBackup(u)
    assert.deepEqual(read(files.global), before)
  })
})

test('plugin project on writes settings.local.json and creates .claude when missing', () => {
  withFixture(({ fx, ctx, files }) => {
    fs.rmSync(path.join(fx.projectDir, '.claude'), { recursive: true, force: true })
    const r = toggle({ kind: 'plugin', name: 'ecc@ecc', scope: 'project', enabled: true }, ctx)
    assert.equal(r.ok, true, r.error)
    assert.equal(r.file, files.local)
    assert.equal(r.backup, null)
    assert.deepEqual(read(files.local), { enabledPlugins: { 'ecc@ecc': true } })
    assert.equal(fs.existsSync(files.project), false)
  })
})

test('plugin project toggle keeps other keys in settings.local.json', () => {
  withFixture(({ ctx, files }) => {
    const r = toggle({ kind: 'plugin', name: SP, scope: 'project', enabled: false }, ctx)
    assertBackup(r)
    const data = read(files.local)
    assert.equal(data.enabledPlugins[SP], false)
    assert.equal(data.enabledPlugins['code-review@claude-plugins-official'], true)
    assert.deepEqual(data.skillOverrides, { 'deploy-checklist': 'off' })
  })
})

test('skill off writes skillOverrides off, on deletes the key', () => {
  withFixture(({ ctx, files }) => {
    const off = toggle({ kind: 'skill', name: 'html-report', scope: 'global', enabled: false }, ctx)
    assertBackup(off)
    assert.equal(off.file, files.global)
    let data = read(files.global)
    assert.equal(data.skillOverrides['html-report'], 'off')
    assert.equal(data.skillOverrides.old, 'off')
    assert.equal(data.model, 'fable')
    assert.deepEqual(off.undo, { kind: 'skill', name: 'html-report', scope: 'global', enabled: true })

    const on = toggle({ kind: 'skill', name: 'html-report', scope: 'global', enabled: true }, ctx)
    assertBackup(on)
    data = read(files.global)
    assert.equal(Object.hasOwn(data.skillOverrides, 'html-report'), false)
    assert.equal(data.skillOverrides['java-clean-code'], 'off')
    assert.equal(data.model, 'fable')
  })
})

test('skill on that empties skillOverrides leaves an empty object', () => {
  withFixture(({ ctx, files }) => {
    const r = toggle({ kind: 'skill', name: 'deploy-checklist', scope: 'project', enabled: true }, ctx)
    assertBackup(r)
    assert.equal(r.file, files.local)
    const data = read(files.local)
    assert.deepEqual(data.skillOverrides, {})
    assert.deepEqual(data.enabledMcpjsonServers, ['postgres'])
  })
})

test('project skill writes settings.local.json and creates it when missing', () => {
  withFixture(({ ctx, files }) => {
    const projectBefore = fs.readFileSync(files.project, 'utf8')
    fs.rmSync(files.local)
    const r = toggle({ kind: 'skill', name: 'deploy-checklist', scope: 'project', enabled: false }, ctx)
    assert.equal(r.ok, true, r.error)
    assert.equal(r.file, files.local)
    assert.deepEqual(read(files.local), { skillOverrides: { 'deploy-checklist': 'off' } })
    assert.equal(fs.readFileSync(files.project, 'utf8'), projectBefore)
  })
})

test('refuses plugin skill', () => {
  withFixture(({ ctx, files }) => {
    const before = fs.readFileSync(files.global, 'utf8')
    const a = toggle({ kind: 'skill', name: 'brainstorming', scope: 'plugin', plugin: SP, enabled: false }, ctx)
    assert.equal(a.ok, false)
    assert.ok(a.error)
    const b = toggle({ kind: 'skill', name: 'brainstorming', scope: 'global', plugin: SP, enabled: false }, ctx)
    assert.equal(b.ok, false)
    assert.equal(fs.readFileSync(files.global, 'utf8'), before)
  })
})

test('refuses plugin agent', () => {
  withFixture(({ ctx }) => {
    const r = toggle({ kind: 'agent', name: 'reviewer', scope: 'plugin', plugin: SP, enabled: false }, ctx)
    assert.equal(r.ok, false)
  })
})

test('mcp project off moves name from enabled to disabled list', () => {
  withFixture(({ ctx, files }) => {
    const off = toggle({ kind: 'mcp', name: 'postgres', scope: 'project', origin: 'mcpjson', enabled: false }, ctx)
    assertBackup(off)
    assert.equal(off.file, files.local)
    let data = read(files.local)
    assert.deepEqual(data.enabledMcpjsonServers, [])
    assert.deepEqual(data.disabledMcpjsonServers.sort(), ['postgres', 'redis'])
    assert.deepEqual(data.skillOverrides, { 'deploy-checklist': 'off' })

    const on = toggle({ kind: 'mcp', name: 'redis', scope: 'project', origin: 'mcpjson', enabled: true }, ctx)
    assertBackup(on)
    data = read(files.local)
    assert.deepEqual(data.enabledMcpjsonServers, ['redis'])
    assert.deepEqual(data.disabledMcpjsonServers, ['postgres'])
  })
})

test('mcp global off adds to disabledMcpServers in .claude.json for projectDir', () => {
  withFixture(({ fx, ctx, files }) => {
    const seed = read(files.claudeJson)
    seed.numStartups = 42
    seed.projects['/other/project'] = { disabledMcpServers: ['x'], allowedTools: ['Bash'] }
    fs.writeFileSync(files.claudeJson, JSON.stringify(seed, null, 2))

    const r = toggle({ kind: 'mcp', name: 'kubernetes', scope: 'global', origin: 'user', enabled: false }, ctx)
    assertBackup(r)
    assert.equal(r.file, files.claudeJson)
    const data = read(files.claudeJson)
    assert.deepEqual(data.projects[fx.projectDir].disabledMcpServers, ['aws', 'plugin:superpowers:demo', 'kubernetes'])
    assert.deepEqual(data.projects[fx.projectDir].mcpServers, seed.projects[fx.projectDir].mcpServers)
    assert.deepEqual(data.projects['/other/project'], seed.projects['/other/project'])
    assert.deepEqual(data.mcpServers, seed.mcpServers)
    assert.equal(data.numStartups, 42)
    assert.deepEqual(Object.keys(data), Object.keys(seed))
    assert.deepEqual(r.undo, { kind: 'mcp', name: 'kubernetes', scope: 'global', origin: 'user', enabled: true })

    const again = toggle({ kind: 'mcp', name: 'kubernetes', scope: 'global', origin: 'user', enabled: false }, ctx)
    assert.equal(again.ok, true)
    assert.equal(read(files.claudeJson).projects[fx.projectDir].disabledMcpServers.filter((k) => k === 'kubernetes').length, 1)
  })
})

test('mcp local on removes it from disabledMcpServers', () => {
  withFixture(({ fx, ctx, files }) => {
    const r = toggle({ kind: 'mcp', name: 'aws', scope: 'project', origin: 'local', enabled: true }, ctx)
    assertBackup(r)
    const data = read(files.claudeJson)
    assert.deepEqual(data.projects[fx.projectDir].disabledMcpServers, ['plugin:superpowers:demo'])
    assert.ok(data.mcpServers.kubernetes)
  })
})

test('mcp toggle creates projects entry when missing', () => {
  withFixture(({ fx, ctx, files }) => {
    const seed = read(files.claudeJson)
    delete seed.projects[fx.projectDir]
    seed.projects['/other/project'] = { foo: 1 }
    fs.writeFileSync(files.claudeJson, JSON.stringify(seed, null, 2))
    const r = toggle({ kind: 'mcp', name: 'kubernetes', scope: 'global', origin: 'user', enabled: false }, ctx)
    assertBackup(r)
    const data = read(files.claudeJson)
    assert.deepEqual(data.projects[fx.projectDir], { disabledMcpServers: ['kubernetes'] })
    assert.deepEqual(data.projects['/other/project'], { foo: 1 })
  })
})

test('mcp plugin off adds plugin:<plugin>:<name>', () => {
  withFixture(({ fx, ctx, files }) => {
    const r = toggle({ kind: 'mcp', name: 'context7', scope: 'plugin', origin: 'plugin', plugin: SP, enabled: false }, ctx)
    assertBackup(r)
    assert.equal(r.file, files.claudeJson)
    const data = read(files.claudeJson)
    assert.deepEqual(data.projects[fx.projectDir].disabledMcpServers, ['aws', 'plugin:superpowers:demo', 'plugin:superpowers:context7'])
    assert.ok(data.mcpServers.kubernetes)
    const inv = scanAll(ctx)
    assert.equal(inv.mcp.find((m) => m.name === 'context7').enabled, false)
  })
})

test('hook off parks entry and removes it from settings, on restores same index', () => {
  withFixture(({ ctx, files }) => {
    const before = read(files.global)
    const off = toggle(
      { kind: 'hook', name: '~/.claude/hooks/pre-bash.sh', scope: 'global', file: 'global', event: 'PreToolUse', index: { event: 'PreToolUse', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assertBackup(off)
    assert.equal(off.file, files.global)
    const after = read(files.global)
    assert.equal(Object.hasOwn(after.hooks, 'PreToolUse'), false)
    assert.deepEqual(after.hooks.Stop, before.hooks.Stop)
    assert.equal(after.model, 'fable')

    const store = read(files.storehouse)
    assert.deepEqual(store.favorites, [])
    assert.equal(store.parkedHooks.length, 1)
    const parked = store.parkedHooks[0]
    assert.equal(parked.event, 'PreToolUse')
    assert.equal(parked.matcher, 'Bash')
    assert.equal(parked.scope, 'global')
    assert.equal(parked.file, 'global')
    assert.equal(parked.group, 0)
    assert.equal(parked.position, 0)
    assert.deepEqual(parked.hook, { type: 'command', command: '~/.claude/hooks/pre-bash.sh', timeout: 60 })
    assert.equal(typeof parked.id, 'string')
    assert.deepEqual(off.undo, { kind: 'hook', name: parked.id, scope: 'global', enabled: true })

    const inv = scanAll(ctx)
    const shown = inv.hooks.find((h) => h.id === parked.id)
    assert.ok(shown)
    assert.equal(shown.enabled, false)
    assert.equal(shown.canToggle, true)
    assert.equal(shown.command, '~/.claude/hooks/pre-bash.sh')

    const on = toggle(off.undo, ctx)
    assertBackup(on)
    assert.deepEqual(read(files.global), before)
    assert.deepEqual(read(files.storehouse).parkedHooks, [])
    const back = scanAll(ctx).hooks.find((h) => h.command === '~/.claude/hooks/pre-bash.sh')
    assert.equal(scanAll(ctx).hooks.some((h) => h.id === parked.id), false)
    assert.equal(back.enabled, true)
    assert.deepEqual(back.index, { event: 'PreToolUse', group: 0, hook: 0 })
    assert.deepEqual(on.undo, {
      kind: 'hook',
      name: '~/.claude/hooks/pre-bash.sh',
      scope: 'global',
      file: 'global',
      event: 'PreToolUse',
      index: { event: 'PreToolUse', group: 0, hook: 0 },
      enabled: false
    })
  })
})

test('hook round trip inside a shared group restores the same position', () => {
  withFixture(({ ctx, files }) => {
    const seed = read(files.global)
    seed.hooks.Stop[0].hooks.push({ type: 'command', command: 'echo second' })
    seed.hooks.Stop.push({ matcher: 'x', hooks: [{ type: 'command', command: 'echo third' }] })
    fs.writeFileSync(files.global, JSON.stringify(seed, null, 2))
    const off = toggle(
      { kind: 'hook', name: '~/.claude/hooks/stop.sh', scope: 'global', file: 'global', event: 'Stop', index: { event: 'Stop', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assertBackup(off)
    assert.deepEqual(read(files.global).hooks.Stop[0].hooks, [{ type: 'command', command: 'echo second' }])
    const on = toggle(off.undo, ctx)
    assertBackup(on)
    assert.deepEqual(read(files.global), seed)
  })
})

test('hook round trip on project settings and keeps storehouse favorites', () => {
  withFixture(({ ctx, files }) => {
    fs.writeFileSync(files.storehouse, JSON.stringify({ favorites: [{ kind: 'skill', id: 'a' }], parkedHooks: [], extra: 1 }))
    const before = read(files.project)
    const off = toggle(
      { kind: 'hook', name: 'echo guard-rm', scope: 'project', file: 'project', event: 'PreToolUse', index: { event: 'PreToolUse', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assertBackup(off)
    assert.equal(off.file, files.project)
    assert.deepEqual(read(files.project).permissions, before.permissions)
    const store = read(files.storehouse)
    assert.deepEqual(store.favorites, [{ kind: 'skill', id: 'a' }])
    assert.equal(store.extra, 1)
    const on = toggle(off.undo, ctx)
    assertBackup(on)
    assert.deepEqual(read(files.project), before)
    assert.equal(read(files.storehouse).extra, 1)
  })
})

test('parked hooks get an id distinct from the active hook id', () => {
  withFixture(({ ctx, files }) => {
    const seed = read(files.global)
    seed.hooks.Stop[0].hooks.push({ type: 'command', command: '~/.claude/hooks/stop.sh' })
    fs.writeFileSync(files.global, JSON.stringify(seed, null, 2))
    const active = scanAll(ctx).hooks.find((h) => h.command === '~/.claude/hooks/stop.sh')
    assert.equal(active.enabled, true)
    assert.equal(active.canToggle, true)
    assert.equal(typeof active.id, 'string')
    const off = toggle(
      { kind: 'hook', name: active.command, scope: 'global', file: 'global', event: 'Stop', index: active.index, enabled: false },
      ctx
    )
    assert.equal(off.ok, true, off.error)
    assert.notEqual(off.undo.name, active.id)
    const hooks = scanAll(ctx).hooks.filter((h) => h.command === '~/.claude/hooks/stop.sh')
    assert.equal(hooks.length, 2)
    const parked = hooks.find((h) => !h.enabled)
    const still = hooks.find((h) => h.enabled)
    assert.equal(parked.id, off.undo.name)
    assert.notEqual(parked.id, still.id)
    const on = toggle(off.undo, ctx)
    assert.equal(on.ok, true, on.error)
    assert.deepEqual(read(files.global), seed)
    const plugin = scanAll(ctx).hooks.find((h) => h.scope === 'plugin')
    assert.equal(plugin.canToggle, false)
  })
})

test('hooks without a string command cannot be switched', () => {
  withFixture(({ ctx, files }) => {
    const seed = read(files.global)
    seed.hooks.Stop.push({ hooks: [{ type: 'prompt', prompt: 'check' }] })
    fs.writeFileSync(files.global, JSON.stringify(seed, null, 2))
    const hook = scanAll(ctx).hooks.find((h) => h.type === 'prompt')
    assert.ok(hook)
    assert.equal(hook.canToggle, false)
  })
})

test('parked project hooks stay with their project', () => {
  withFixture(({ fx, ctx, files }) => {
    const other = path.join(path.dirname(fx.projectDir), 'project-b')
    fs.mkdirSync(path.join(other, '.claude'), { recursive: true })
    const ctxB = { home: fx.home, projectDir: other }
    const off = toggle(
      { kind: 'hook', name: 'echo guard-rm', scope: 'project', file: 'project', event: 'PreToolUse', index: { event: 'PreToolUse', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assert.equal(off.ok, true, off.error)
    const entry = read(files.storehouse).parkedHooks[0]
    assert.equal(entry.projectDir, fx.projectDir)
    const global = toggle(
      { kind: 'hook', name: '~/.claude/hooks/stop.sh', scope: 'global', file: 'global', event: 'Stop', index: { event: 'Stop', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assert.equal(global.ok, true, global.error)
    assert.equal(Object.hasOwn(read(files.storehouse).parkedHooks[1], 'projectDir'), false)

    const seenB = scanAll(ctxB).hooks
    assert.equal(seenB.some((h) => h.id === off.undo.name), false)
    assert.equal(seenB.some((h) => h.id === global.undo.name), true)
    const refused = toggle(off.undo, ctxB)
    assert.equal(refused.ok, false)
    assert.equal(fs.existsSync(path.join(other, '.claude', 'settings.json')), false)
    assert.equal(read(files.storehouse).parkedHooks.length, 2)

    assert.ok(scanAll(ctx).hooks.some((h) => h.id === off.undo.name))
    assert.equal(toggle(off.undo, ctx).ok, true)
  })
})

test('mcpjson toggle only creates the list it adds to', () => {
  withFixture(({ ctx, files }) => {
    const seed = read(files.local)
    delete seed.enabledMcpjsonServers
    fs.writeFileSync(files.local, JSON.stringify(seed, null, 2))
    const r = toggle({ kind: 'mcp', name: 'postgres', scope: 'project', origin: 'mcpjson', enabled: false }, ctx)
    assertBackup(r)
    const data = read(files.local)
    assert.equal(Object.hasOwn(data, 'enabledMcpjsonServers'), false)
    assert.deepEqual(data.disabledMcpjsonServers, ['redis', 'postgres'])
  })
})

test('a toggle that changes nothing does not write and returns undo null', () => {
  withFixture(({ fx, ctx, files }) => {
    const cases = [
      [{ kind: 'plugin', name: 'ecc@ecc', scope: 'global', enabled: false }, files.global],
      [{ kind: 'skill', name: 'java-clean-code', scope: 'global', enabled: false }, files.global],
      [{ kind: 'mcp', name: 'aws', scope: 'project', origin: 'local', enabled: false }, files.claudeJson],
      [{ kind: 'mcp', name: 'redis', scope: 'project', origin: 'mcpjson', enabled: false }, files.local]
    ]
    for (const [req, file] of cases) {
      const before = fs.statSync(file).mtimeMs
      const text = fs.readFileSync(file, 'utf8')
      const r = toggle(req, ctx)
      assert.equal(r.ok, true, r.error)
      assert.equal(r.undo, null, `${req.kind} ${req.name}`)
      assert.equal(r.backup, null)
      assert.equal(fs.readFileSync(file, 'utf8'), text)
      assert.equal(fs.statSync(file).mtimeMs, before)
    }
    assert.equal(fs.existsSync(path.join(fx.home, '.claude', 'backups')), false)
    const agent = toggle({ kind: 'agent', name: 'parked', scope: 'global', enabled: false }, ctx)
    assert.equal(agent.ok, true, agent.error)
    assert.equal(agent.undo, null)
  })
})

test('a file changed on disk before save is reloaded and the change re-applied once', () => {
  withFixture(({ ctx, files }) => {
    let calls = 0
    const raceCtx = {
      ...ctx,
      beforeSave: (file) => {
        if (file !== files.global || calls++ > 0) return
        const data = read(files.global)
        data.theme = 'dark-from-claude-code'
        fs.writeFileSync(files.global, JSON.stringify(data, null, 2))
      }
    }
    const r = toggle({ kind: 'plugin', name: SP, scope: 'global', enabled: false }, raceCtx)
    assertBackup(r)
    const data = read(files.global)
    assert.equal(data.theme, 'dark-from-claude-code')
    assert.equal(data.enabledPlugins[SP], false)
    assert.equal(data.model, 'fable')
  })
})

test('a file that keeps changing on disk is refused', () => {
  withFixture(({ ctx, files }) => {
    let n = 0
    const raceCtx = {
      ...ctx,
      beforeSave: (file) => {
        if (file !== files.claudeJson) return
        const data = read(files.claudeJson)
        data.counter = 'x'.repeat(++n)
        fs.writeFileSync(files.claudeJson, JSON.stringify(data, null, 2))
      }
    }
    const r = toggle({ kind: 'mcp', name: 'kubernetes', scope: 'global', origin: 'user', enabled: false }, raceCtx)
    assert.equal(r.ok, false)
    assert.ok(r.error.includes(files.claudeJson))
    const data = read(files.claudeJson)
    assert.equal(data.counter, 'xx')
    assert.equal(data.projects[ctx.projectDir].disabledMcpServers.includes('kubernetes'), false)
  })
})

test('hook off rolls back the parked entry when the settings write fails', () => {
  withFixture(({ ctx, files }) => {
    const before = fs.readFileSync(files.project, 'utf8')
    const failCtx = {
      ...ctx,
      beforeSave: (file) => {
        if (file === files.project) throw new Error('settings boom')
      }
    }
    const req = { kind: 'hook', name: 'echo guard-rm', scope: 'project', file: 'project', event: 'PreToolUse', index: { event: 'PreToolUse', group: 0, hook: 0 }, enabled: false }
    const r = toggle(req, failCtx)
    assert.equal(r.ok, false)
    assert.ok(r.error.includes('settings boom'))
    assert.equal(fs.existsSync(files.storehouse), false)
    assert.equal(fs.readFileSync(files.project, 'utf8'), before)

    fs.writeFileSync(files.storehouse, JSON.stringify({ favorites: [], parkedHooks: [] }))
    let storeCalls = 0
    const doubleCtx = {
      ...ctx,
      beforeSave: (file) => {
        if (file === files.project) throw new Error('settings boom')
        if (file === files.storehouse && storeCalls++ > 0) throw new Error('store boom')
      }
    }
    const d = toggle(req, doubleCtx)
    assert.equal(d.ok, false)
    assert.ok(d.error.includes('settings boom'))
    assert.ok(d.error.includes('store boom'))
    assert.equal(fs.readFileSync(files.project, 'utf8'), before)
  })
})

test('refuses plugin hook', () => {
  withFixture(({ ctx }) => {
    const r = toggle(
      { kind: 'hook', name: 'echo hi', scope: 'plugin', plugin: SP, file: 'plugin', event: 'SessionStart', index: { event: 'SessionStart', group: 0, hook: 0 }, enabled: false },
      ctx
    )
    assert.equal(r.ok, false)
  })
})

test('agent off renames to .md.disabled and on renames back', () => {
  withFixture(({ fx, ctx }) => {
    const dir = path.join(fx.home, '.claude', 'agents')
    const off = toggle({ kind: 'agent', name: 'my-agent', scope: 'global', enabled: false }, ctx)
    assert.equal(off.ok, true, off.error)
    assert.equal(off.backup, null)
    assert.equal(off.file, path.join(dir, 'my-agent.md.disabled'))
    assert.equal(fs.existsSync(path.join(dir, 'my-agent.md')), false)
    assert.equal(fs.existsSync(path.join(dir, 'my-agent.md.disabled')), true)
    assert.equal(fs.existsSync(path.join(dir, 'parked.md.disabled')), true)
    const on = toggle(off.undo, ctx)
    assert.equal(on.ok, true, on.error)
    assert.equal(fs.existsSync(path.join(dir, 'my-agent.md')), true)
    assert.equal(fs.existsSync(path.join(dir, 'my-agent.md.disabled')), false)

    const project = toggle({ kind: 'agent', name: 'repo-explainer', scope: 'project', enabled: false }, ctx)
    assert.equal(project.ok, true, project.error)
    assert.ok(fs.existsSync(path.join(fx.projectDir, '.claude', 'agents', 'repo-explainer.md.disabled')))
  })
})

test('agent refuses when the destination exists', () => {
  withFixture(({ fx, ctx }) => {
    const dir = path.join(fx.home, '.claude', 'agents')
    fs.writeFileSync(path.join(dir, 'my-agent.md.disabled'), 'other')
    const r = toggle({ kind: 'agent', name: 'my-agent', scope: 'global', enabled: false }, ctx)
    assert.equal(r.ok, false)
    assert.equal(fs.readFileSync(path.join(dir, 'my-agent.md.disabled'), 'utf8'), 'other')
    assert.ok(fs.existsSync(path.join(dir, 'my-agent.md')))
  })
})

test('refuses when settings file is broken json', () => {
  withFixture(({ ctx, files }) => {
    fs.writeFileSync(files.global, '{ nope')
    const r = toggle({ kind: 'plugin', name: SP, scope: 'global', enabled: false }, ctx)
    assert.equal(r.ok, false)
    assert.ok(r.error.includes(files.global))
    assert.equal(fs.readFileSync(files.global, 'utf8'), '{ nope')

    fs.writeFileSync(files.claudeJson, '{ nope')
    const m = toggle({ kind: 'mcp', name: 'context7', scope: 'plugin', origin: 'plugin', plugin: SP, enabled: false }, ctx)
    assert.equal(m.ok, false)
    assert.ok(m.error.includes(files.claudeJson))
    assert.equal(fs.readFileSync(files.claudeJson, 'utf8'), '{ nope')
  })
})

test('refuses a toggle with an unknown name', () => {
  withFixture(({ ctx, files }) => {
    const before = fs.readFileSync(files.global, 'utf8')
    const requests = [
      { kind: 'plugin', name: 'nope@x', scope: 'global', enabled: false },
      { kind: 'skill', name: 'nope', scope: 'global', enabled: false },
      { kind: 'mcp', name: 'nope', scope: 'global', origin: 'user', enabled: false },
      { kind: 'hook', name: 'nope', scope: 'global', file: 'global', event: 'Stop', index: { event: 'Stop', group: 0, hook: 0 }, enabled: false },
      { kind: 'hook', name: 'nope', scope: 'global', enabled: true },
      { kind: 'agent', name: 'nope', scope: 'global', enabled: false },
      { kind: 'widget', name: 'x', scope: 'global', enabled: false }
    ]
    for (const req of requests) {
      const r = toggle(req, ctx)
      assert.equal(r.ok, false, `${req.kind} ${req.name}`)
      assert.ok(r.error)
    }
    assert.equal(fs.readFileSync(files.global, 'utf8'), before)
    assert.equal(fs.existsSync(files.storehouse), false)
  })
})

test('every successful toggle returns a backup path that exists', () => {
  withFixture(({ ctx }) => {
    const requests = [
      { kind: 'plugin', name: SP, scope: 'global', enabled: false },
      { kind: 'plugin', name: SP, scope: 'project', enabled: true },
      { kind: 'skill', name: 'html-report', scope: 'global', enabled: false },
      { kind: 'skill', name: 'deploy-checklist', scope: 'project', enabled: true },
      { kind: 'mcp', name: 'redis', scope: 'project', origin: 'mcpjson', enabled: true },
      { kind: 'mcp', name: 'kubernetes', scope: 'global', origin: 'user', enabled: false },
      { kind: 'mcp', name: 'demo', scope: 'plugin', origin: 'plugin', plugin: SP, enabled: true },
      { kind: 'hook', name: '~/.claude/hooks/stop.sh', scope: 'global', file: 'global', event: 'Stop', index: { event: 'Stop', group: 0, hook: 0 }, enabled: false }
    ]
    for (const req of requests) {
      const r = toggle(req, ctx)
      assertBackup(r)
    }
  })
})
