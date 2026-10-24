import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mcpTransport, parseEnv } from '../../public/logic/mcp.js'

test('mcpTransport calls stdio local and every other transport remote', () => {
  assert.equal(mcpTransport({ transport: 'stdio' }), 'Local · stdio')
  assert.equal(mcpTransport({ transport: 'http' }), 'Remote · http')
  assert.equal(mcpTransport({ transport: 'sse' }), 'Remote · sse')
})

test('parseEnv reads one KEY=VALUE per line', () => {
  assert.deepEqual(parseEnv('API_KEY=abc\nDEBUG=1'), { env: { API_KEY: 'abc', DEBUG: '1' } })
})

test('parseEnv skips blank lines, trims lines, and accepts CRLF', () => {
  assert.deepEqual(parseEnv('\n  A=1  \r\n\r\nB=2\n'), { env: { A: '1', B: '2' } })
})

test('parseEnv keeps everything after the first equals sign, also an empty value', () => {
  assert.deepEqual(parseEnv('URL=http://x?a=b\nEMPTY='), { env: { URL: 'http://x?a=b', EMPTY: '' } })
})

test('parseEnv keeps the last value of a repeated key', () => {
  assert.deepEqual(parseEnv('A=1\nA=2'), { env: { A: '2' } })
})

test('parseEnv returns an empty env for empty text', () => {
  assert.deepEqual(parseEnv(''), { env: {} })
})

test('parseEnv rejects a line that is not KEY=VALUE and names it', () => {
  assert.deepEqual(parseEnv('A=1\nnot a pair'), { error: '"not a pair" is not KEY=VALUE.' })
  assert.deepEqual(parseEnv('1A=x'), { error: '"1A=x" is not KEY=VALUE.' })
  assert.deepEqual(parseEnv('A B=x'), { error: '"A B=x" is not KEY=VALUE.' })
  assert.deepEqual(parseEnv('=x'), { error: '"=x" is not KEY=VALUE.' })
  assert.deepEqual(parseEnv('export A=1'), { error: '"export A=1" is not KEY=VALUE.' })
})
