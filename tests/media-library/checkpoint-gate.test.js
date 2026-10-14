const test = require('node:test')
const assert = require('node:assert/strict')

const { createCheckpointGate } = require('../../src/core/mediaLibrary/checkpointGate.js')

test('createCheckpointGate skips frequent saves until item or time threshold', () => {
  let now = 1000
  const gate = createCheckpointGate({
    minIntervalMs: 15_000,
    minItemDelta: 200,
    now: () => now,
  })

  assert.equal(gate.shouldSave(10), true)
  gate.markSaved(10)
  assert.equal(gate.shouldSave(20), false)
  assert.equal(gate.shouldSave(209), false)
  assert.equal(gate.shouldSave(210), true)

  gate.markSaved(210)
  assert.equal(gate.shouldSave(250), false)

  now = 1000 + 15_000
  assert.equal(gate.shouldSave(250), true)
})

test('createCheckpointGate force save ignores thresholds', () => {
  const gate = createCheckpointGate({
    minIntervalMs: 15_000,
    minItemDelta: 200,
    now: () => 0,
  })

  assert.equal(gate.shouldSave(1, { force: true }), true)
})
