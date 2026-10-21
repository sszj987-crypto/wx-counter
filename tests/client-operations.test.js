const test = require('node:test')
const assert = require('node:assert/strict')
const { createOperationStore } = require('../utils/counter-service')

test('failed response keeps ID for same payload; success creates a new ID next time', () => {
  const values = new Map()
  const storage = { get: key => values.get(key), set: (key, value) => values.set(key, value),
    remove: key => values.delete(key) }
  const operations = createOperationStore(storage)
  const payload = { roomId: 'r1', transfers: [{ toPlayerOpenId: 'bob', score: 5 }] }
  const first = operations.get('transfer', payload)
  assert.equal(operations.get('transfer', payload), first)
  operations.complete('transfer', payload)
  assert.notEqual(operations.get('transfer', payload), first)
})
