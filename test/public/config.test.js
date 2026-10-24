import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORM_FIELDS,
  cfgPanels,
  fieldGet,
  fieldSet,
  lockedKeys,
  sformDirtyKeys,
  sformEdit,
  sformValues,
  mdDirtyKey
} from '../../public/logic/config.js'
import { cfg, eds, state } from '../../public/core/state.js'

const field = (key) => FORM_FIELDS.find((f) => f.key === key)
const MODE = field('permissions.defaultMode')
const MODEL = field('model')

function withSettings(settings, fn) {
  const before = state.inventory
  state.inventory = { settings, claudeMd: {} }
  try {
    return fn()
  } finally {
    state.inventory = before
    for (const k of Object.keys(cfg.sforms)) delete cfg.sforms[k]
  }
}

function withEds(entries, fn) {
  Object.assign(eds, entries)
  try {
    return fn()
  } finally {
    for (const k of Object.keys(entries)) delete eds[k]
  }
}

test('FORM_FIELDS holds the six form fields of the spec', () => {
  assert.deepEqual(
    FORM_FIELDS.map((f) => f.key),
    ['model', 'effortLevel', 'outputStyle', 'theme', 'permissions.defaultMode', 'skipDangerousModePermissionPrompt']
  )
})

test('fieldGet reads a top-level key and a dotted path', () => {
  const data = { model: 'opus', permissions: { defaultMode: 'plan', allow: ['Bash'] } }
  assert.equal(fieldGet(data, MODEL), 'opus')
  assert.equal(fieldGet(data, MODE), 'plan')
})

test('fieldGet returns undefined when the path is missing or crosses a non-object', () => {
  assert.equal(fieldGet({}, MODE), undefined)
  assert.equal(fieldGet({ permissions: 'x' }, MODE), undefined)
  assert.equal(fieldGet({ permissions: ['plan'] }, MODE), undefined)
  assert.equal(fieldGet({ permissions: null }, MODE), undefined)
})

test('fieldSet writes one top-level key and keeps every other key', () => {
  const data = { model: 'opus', theme: 'dark', hooks: { Stop: [] } }
  fieldSet(data, MODEL, 'sonnet')
  assert.deepEqual(data, { model: 'sonnet', theme: 'dark', hooks: { Stop: [] } })
})

test('fieldSet writes inside permissions and keeps the other permission keys', () => {
  const data = { permissions: { allow: ['Bash(npm test)'], deny: ['Read(.env)'] }, model: 'opus' }
  fieldSet(data, MODE, 'acceptEdits')
  assert.deepEqual(data, {
    permissions: { allow: ['Bash(npm test)'], deny: ['Read(.env)'], defaultMode: 'acceptEdits' },
    model: 'opus'
  })
})

test('fieldSet creates permissions when it is missing', () => {
  const data = {}
  fieldSet(data, MODE, 'plan')
  assert.deepEqual(data, { permissions: { defaultMode: 'plan' } })
})

test('fieldSet deletes the key for an empty value', () => {
  const data = { model: 'opus', theme: 'dark' }
  fieldSet(data, MODEL, '')
  assert.deepEqual(data, { theme: 'dark' })
})

test('fieldSet keeps an emptied permissions as an empty object', () => {
  const data = { permissions: { defaultMode: 'plan' } }
  fieldSet(data, MODE, '')
  assert.deepEqual(data, { permissions: {} })
})

test('fieldSet with an empty value does not create permissions', () => {
  const data = { model: 'opus' }
  fieldSet(data, MODE, '')
  assert.deepEqual(data, { model: 'opus' })
})

test('fieldSet writes a boolean switch value', () => {
  const data = {}
  fieldSet(data, field('skipDangerousModePermissionPrompt'), true)
  assert.deepEqual(data, { skipDangerousModePermissionPrompt: true })
})

test('lockedKeys is empty for settings with the right types', () => {
  const data = {
    model: 'opus',
    effortLevel: 'high',
    permissions: { defaultMode: 'plan' },
    skipDangerousModePermissionPrompt: false
  }
  withSettings({ global: { data } }, () => assert.deepEqual(lockedKeys('sg'), []))
})

test('lockedKeys locks a text field that holds a non-string value', () => {
  const data = { model: { id: 'opus' }, theme: 3, outputStyle: null }
  withSettings({ global: { data } }, () => assert.deepEqual(lockedKeys('sg'), ['model', 'outputStyle', 'theme']))
})

test('lockedKeys locks a switch that holds a non-boolean value', () => {
  const data = { skipDangerousModePermissionPrompt: 'true' }
  withSettings({ global: { data } }, () => assert.deepEqual(lockedKeys('sg'), ['skipDangerousModePermissionPrompt']))
})

test('lockedKeys locks permissions.defaultMode when permissions is not an object', () => {
  for (const permissions of ['plan', ['plan'], null, 1]) {
    withSettings({ global: { data: { permissions } } }, () =>
      assert.deepEqual(lockedKeys('sg'), ['permissions.defaultMode'])
    )
  }
})

test('lockedKeys locks permissions.defaultMode when it is not a string', () => {
  withSettings({ global: { data: { permissions: { defaultMode: true } } } }, () =>
    assert.deepEqual(lockedKeys('sg'), ['permissions.defaultMode'])
  )
})

test('lockedKeys reads the file of each panel and treats a missing file as empty', () => {
  const settings = { global: { data: { model: 1 } }, projectLocal: { data: { theme: 2 } } }
  withSettings(settings, () => {
    assert.deepEqual(lockedKeys('sg'), ['model'])
    assert.deepEqual(lockedKeys('sp'), [])
    assert.deepEqual(lockedKeys('sl'), ['theme'])
  })
})

test('sformValues gives the form values from the file before any edit', () => {
  const data = { model: 'opus', permissions: { defaultMode: 'plan' }, skipDangerousModePermissionPrompt: true }
  withSettings({ global: { data } }, () =>
    assert.deepEqual(sformValues('sg'), {
      model: 'opus',
      effortLevel: '',
      outputStyle: '',
      theme: '',
      'permissions.defaultMode': 'plan',
      skipDangerousModePermissionPrompt: true
    })
  )
})

test('sformDirtyKeys is empty before any edit', () => {
  withSettings({ global: { data: { model: 'opus' } } }, () => assert.deepEqual(sformDirtyKeys('sg'), []))
})

test('sformDirtyKeys lists each edited field', () => {
  withSettings({ global: { data: { model: 'opus' } } }, () => {
    sformEdit('sg', 'model', 'sonnet')
    sformEdit('sg', 'permissions.defaultMode', 'plan')
    sformEdit('sg', 'skipDangerousModePermissionPrompt', true)
    assert.deepEqual(sformDirtyKeys('sg'), ['model', 'permissions.defaultMode', 'skipDangerousModePermissionPrompt'])
  })
})

test('sformDirtyKeys ignores an edit back to the saved value and extra spaces', () => {
  withSettings({ global: { data: { model: 'opus', theme: 'dark' } } }, () => {
    sformEdit('sg', 'model', 'sonnet')
    sformEdit('sg', 'model', 'opus')
    sformEdit('sg', 'theme', '  dark ')
    assert.deepEqual(sformDirtyKeys('sg'), [])
  })
})

test('sformDirtyKeys counts clearing a value as a change', () => {
  withSettings({ global: { data: { model: 'opus' } } }, () => {
    sformEdit('sg', 'model', '')
    assert.deepEqual(sformDirtyKeys('sg'), ['model'])
  })
})

test('sformDirtyKeys never lists a locked field', () => {
  withSettings({ global: { data: { model: 42 } } }, () => {
    sformEdit('sg', 'model', 'opus')
    sformEdit('sg', 'theme', 'light')
    assert.deepEqual(sformDirtyKeys('sg'), ['theme'])
  })
})

test('sformDirtyKeys keeps the forms of each settings file apart', () => {
  withSettings({ global: { data: {} }, project: { data: {} } }, () => {
    sformEdit('sp', 'model', 'opus')
    assert.deepEqual(sformDirtyKeys('sg'), [])
    assert.deepEqual(sformDirtyKeys('sp'), ['model'])
  })
})

test('cfgPanels maps each panel key to its file, scope label, and inventory info', () => {
  const before = state.inventory
  const settings = { global: { data: { a: 1 } }, project: { data: {} }, projectLocal: null }
  const claudeMd = {
    global: { path: 'g' },
    project: { path: 'p' },
    projectLocal: { path: 'l' },
    projectClaudeDir: null
  }
  state.inventory = { settings, claudeMd }
  try {
    const p = cfgPanels()
    assert.deepEqual(Object.keys(p), ['sg', 'sp', 'sl', 'mg', 'mp', 'ml', 'mc'])
    assert.equal(p.sg.file, '~/.claude/settings.json')
    assert.equal(p.sp.file, '.claude/settings.json')
    assert.equal(p.sl.file, '.claude/settings.local.json')
    assert.equal(p.mg.file, '~/.claude/CLAUDE.md')
    assert.equal(p.mp.file, './CLAUDE.md')
    assert.equal(p.ml.file, './CLAUDE.local.md')
    assert.equal(p.mc.file, './.claude/CLAUDE.md')
    assert.equal(p.sg.info, settings.global)
    assert.equal(p.mp.info, claudeMd.project)
    assert.equal(p.mc.info, null)
    assert.equal(p.sl.pill, 'git-ignored')
    assert.equal(p.ml.pill, 'git-ignored')
    assert.equal(p.sg.del, undefined)
    assert.equal(p.sg.create, undefined)
    assert.equal(p.sp.create, 'projectSettings')
    assert.deepEqual(
      Object.entries(p)
        .filter(([, v]) => v.md)
        .map(([k]) => k),
      ['mg', 'mp', 'ml', 'mc']
    )
  } finally {
    state.inventory = before
  }
})

test('cfgPanels works when the inventory has no settings or CLAUDE.md', () => {
  const before = state.inventory
  state.inventory = {}
  try {
    const p = cfgPanels()
    assert.equal(p.sg.info, undefined)
    assert.equal(p.mg.info, undefined)
  } finally {
    state.inventory = before
  }
})

test('mdDirtyKey is null when no CLAUDE.md editor has unsaved text', () => {
  assert.equal(mdDirtyKey(), null)
  withEds(
    {
      mg: { status: 'ready', text: 'a', loaded: 'a' },
      mp: { status: 'loading', text: 'b', loaded: 'a' },
      sg: { status: 'ready', text: 'b', loaded: 'a' }
    },
    () => assert.equal(mdDirtyKey(), null)
  )
})

test('mdDirtyKey returns the first dirty CLAUDE.md editor in the order global, project, .claude, local', () => {
  withEds(
    {
      ml: { status: 'ready', text: 'b', loaded: 'a' },
      mc: { status: 'ready', text: 'b', loaded: 'a' }
    },
    () => assert.equal(mdDirtyKey(), 'mc')
  )
  withEds({ ml: { status: 'ready', text: '', loaded: 'a' } }, () => assert.equal(mdDirtyKey(), 'ml'))
})
