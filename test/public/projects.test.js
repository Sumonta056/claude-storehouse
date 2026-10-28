import { test } from 'node:test'
import assert from 'node:assert/strict'
import { state } from '../../public/core/state.js'
import {
  findProject,
  lastActive,
  matchProjects,
  projectRows,
  projectTotals,
  sessionSpan,
  topProjects
} from '../../public/logic/projects.js'

const rows = [
  {
    project: '~/a',
    tokens: 10,
    cost: 5,
    sessions: 2,
    list: [
      { id: 's2', start: 3000, end: 9000, responses: 4, tokens: 6, cost: 3, models: [] },
      { id: 's1', start: 1000, end: 2000, responses: 1, tokens: 4, cost: 2, models: [] }
    ]
  },
  { project: '~/B-api', tokens: 30, cost: 1, sessions: 1, list: [] },
  { project: '~/c', tokens: 20, cost: 2, sessions: 1, list: [] },
  { project: '~/d', tokens: 5, cost: 9, sessions: 1, list: [] }
]

test('projectRows reads the rows of the chosen period', () => {
  const before = { usage: state.usage, usagePeriod: state.usagePeriod }
  try {
    state.usage = { byProject: { month: rows, all: [] } }
    state.usagePeriod = 'month'
    assert.equal(projectRows(), rows)
    state.usagePeriod = 'all'
    assert.deepEqual(projectRows(), [])
    state.usage = null
    assert.deepEqual(projectRows(), [])
  } finally {
    Object.assign(state, before)
  }
})

test('topProjects ranks by tokens and keeps 3', () => {
  assert.deepEqual(
    topProjects(rows).map((r) => r.project),
    ['~/B-api', '~/c', '~/a']
  )
  assert.equal(rows[0].project, '~/a')
})

test('matchProjects matches the name without case', () => {
  assert.deepEqual(
    matchProjects(rows, ' b-API ').map((r) => r.project),
    ['~/B-api']
  )
  assert.equal(matchProjects(rows, '').length, 4)
})

test('findProject, lastActive, projectTotals, sessionSpan', () => {
  assert.equal(findProject(rows, '~/c'), rows[2])
  assert.equal(findProject(rows, '~/x'), null)
  assert.equal(lastActive(rows[0]), 9000)
  assert.equal(lastActive(rows[1]), null)
  assert.deepEqual(projectTotals(rows[0]), { responses: 5, longest: 6000 })
  assert.equal(sessionSpan({ start: null, end: 5 }), 0)
})
