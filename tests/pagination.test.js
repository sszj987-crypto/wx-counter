const test = require('node:test')
const assert = require('node:assert/strict')
const { pageByCursor, decodeCursor } = require('../cloudfunctions/counterService/queries')

test('same timestamp pages do not repeat or skip document IDs', () => {
  const items = Array.from({ length: 47 }, (_, index) => ({
    _id: `id_${String(index).padStart(3, '0')}`, createdAt: new Date('2026-01-01')
  })).reverse()
  const first = pageByCursor(items, null, 'createdAt', 20)
  const second = pageByCursor(items, first.nextCursor, 'createdAt', 20)
  const third = pageByCursor(items, second.nextCursor, 'createdAt', 20)
  assert.deepEqual([first, second, third].map(page => page.items.length), [20, 20, 7])
  assert.equal(third.nextCursor, null)
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map(item => item._id)).size, 47)
})

test('cursor rejects invalid ID or time', () => {
  assert.throws(() => decodeCursor({ time: 'bad', id: 'x' }), /游标/)
  assert.throws(() => decodeCursor({ time: '2026-01-01', id: '../x' }), /游标/)
})
