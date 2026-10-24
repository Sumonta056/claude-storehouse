import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_COMBO, comboFromKey, comboLabel, comboProblem, matchCombo } from '../../public/logic/shortcut.js'

function key(code, keyName, mods = {}) {
  return { code, key: keyName, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }
}

test('the default shortcut is mod+p', () => {
  assert.equal(DEFAULT_COMBO, 'mod+p')
})

test('comboFromKey maps Cmd on macOS and Ctrl elsewhere to mod', () => {
  assert.equal(comboFromKey(key('KeyP', 'p', { metaKey: true }), true), 'mod+p')
  assert.equal(comboFromKey(key('KeyP', 'p', { ctrlKey: true }), false), 'mod+p')
  assert.equal(comboFromKey(key('KeyP', 'p', { ctrlKey: true }), true), 'ctrl+p')
  assert.equal(comboFromKey(key('KeyP', 'p', { metaKey: true }), false), 'meta+p')
})

test('comboFromKey uses the physical letter so Shift and Option do not change it', () => {
  assert.equal(comboFromKey(key('KeyK', 'K', { metaKey: true, shiftKey: true }), true), 'mod+shift+k')
  assert.equal(comboFromKey(key('KeyK', '˚', { metaKey: true, altKey: true }), true), 'mod+alt+k')
  assert.equal(comboFromKey(key('Digit1', '!', { ctrlKey: true, shiftKey: true }), false), 'mod+shift+1')
  assert.equal(comboFromKey(key('Period', '.', { metaKey: true }), true), 'mod+.')
})

test('comboFromKey returns an empty string for a modifier key alone', () => {
  assert.equal(comboFromKey(key('MetaLeft', 'Meta', { metaKey: true }), true), '')
  assert.equal(comboFromKey(key('ShiftLeft', 'Shift', { shiftKey: true }), true), '')
})

test('matchCombo compares the pressed key with the saved combo', () => {
  assert.equal(matchCombo('mod+p', key('KeyP', 'p', { metaKey: true }), true), true)
  assert.equal(matchCombo('mod+p', key('KeyP', 'p', { metaKey: true, shiftKey: true }), true), false)
  assert.equal(matchCombo('mod+shift+k', key('KeyK', 'K', { ctrlKey: true, shiftKey: true }), false), true)
})

test('comboLabel shows symbols on macOS and words elsewhere', () => {
  assert.equal(comboLabel('mod+p', true), '⌘P')
  assert.equal(comboLabel('mod+shift+k', true), '⌘⇧K')
  assert.equal(comboLabel('mod+alt+k', true), '⌘⌥K')
  assert.equal(comboLabel('ctrl+k', true), '⌃K')
  assert.equal(comboLabel('mod+p', false), 'Ctrl+P')
  assert.equal(comboLabel('mod+shift+k', false), 'Ctrl+Shift+K')
  assert.equal(comboLabel('mod+alt+k', false), 'Ctrl+Alt+K')
})

test('comboProblem accepts a combo with Cmd, Ctrl, or Alt and a free key', () => {
  assert.equal(comboProblem('mod+p'), '')
  assert.equal(comboProblem('mod+shift+k'), '')
  assert.equal(comboProblem('alt+k'), '')
})

test('comboProblem rejects a key without Cmd, Ctrl, or Alt', () => {
  assert.match(comboProblem('k'), /Cmd, Ctrl, or Alt/)
  assert.match(comboProblem('shift+k'), /Cmd, Ctrl, or Alt/)
  assert.match(comboProblem(''), /Cmd, Ctrl, or Alt/)
})

test('comboProblem rejects keys that the browser or the dashboard already uses', () => {
  for (const combo of ['mod+w', 'mod+shift+w', 'mod+t', 'mod+n', 'mod+q', 'mod+l', 'mod+r', 'mod+s', 'mod+enter'])
    assert.match(comboProblem(combo), /already/, combo)
})

test('comboProblem rejects editing keys and tab numbers', () => {
  for (const combo of ['mod+c', 'mod+v', 'mod+x', 'mod+a', 'mod+z', 'mod+shift+z', 'mod+f', 'mod+b', 'mod+i', 'mod+1'])
    assert.match(comboProblem(combo), /already/, combo)
})

test('comboFromKey returns an empty string for AltGr, the OS key, and Caps Lock', () => {
  assert.equal(comboFromKey(key('AltRight', 'AltGraph', { altKey: true }), false), '')
  assert.equal(comboFromKey(key('OSLeft', 'OS'), false), '')
  assert.equal(comboFromKey(key('CapsLock', 'CapsLock', { metaKey: true }), true), '')
})

test('comboLabel of an empty combo is empty', () => {
  assert.equal(comboLabel('', true), '')
  assert.equal(comboLabel('', false), '')
})

test('comboProblem rejects text that is not a combo', () => {
  assert.notEqual(comboProblem('mod+'), '')
  assert.notEqual(comboProblem('super+p'), '')
  assert.notEqual(comboProblem(42), '')
})
