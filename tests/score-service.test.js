const test = require('node:test')
const assert = require('node:assert/strict')
const { createScoreService } = require('../cloudfunctions/counterService/score')

function database() {
  const collections = {
    rooms: new Map([['r1', { _id: 'r1', status: 'active', version: 0, transferCount: 0,
      memberOpenIds: ['alice', 'bob'], players: [
        { openId: 'alice', score: 0 }, { openId: 'bob', score: 0 }
      ], roomFeeConfig: { enabled: false } }]]),
    score_operations: new Map()
  }
  const versions = new Map()
  let commits = 0
  const clone = value => value === undefined ? undefined : structuredClone(value)
  const keyOf = (name, id) => `${name}:${id}`
  const document = (name, id, reads, staged) => ({
    async get() {
      if (reads) reads.set(keyOf(name, id), versions.get(keyOf(name, id)) || 0)
      return { data: clone(collections[name].get(id)) || null }
    },
    async update({ data }) { staged.push([name, id, { ...collections[name].get(id), ...clone(data) }]) },
    async set({ data }) { staged.push([name, id, clone(data)]) }
  })
  return {
    collections,
    get commits() { return commits },
    collection(name) { return { doc(id) { return document(name, id, null, []) } } },
    async startTransaction() {
      const staged = []
      const reads = new Map()
      return {
        collection(name) {
          return {
            doc(id) { return document(name, id, reads, staged) },
            async add({ data }) {
              if (collections[name].has(data._id)) throw new Error('duplicate key')
              staged.push([name, data._id, clone(data)])
            }
          }
        },
        async commit() {
          for (const [key, version] of reads) {
            if ((versions.get(key) || 0) !== version) throw new Error('write conflict')
          }
          for (const [name, id, value] of staged) {
            if (name === 'score_operations' && collections[name].has(id)) throw new Error('duplicate key')
            collections[name].set(id, value)
            versions.set(keyOf(name, id), (versions.get(keyOf(name, id)) || 0) + 1)
          }
          commits++
        },
        async rollback() {}
      }
    }
  }
}

test('same operation ID returns original result, even after room settles', async () => {
  const db = database()
  const service = createScoreService(db)
  const request = { roomId: 'r1', operationId: 'op_12345678', transfers: [{ toPlayerOpenId: 'bob', score: 7 }] }
  const first = await service.transferScore(request, 'alice')
  db.collections.rooms.get('r1').status = 'settling'
  const second = await service.transferScore(request, 'alice')
  assert.deepEqual(second, first)
  assert.equal(db.commits, 1)
  assert.equal(db.collections.score_operations.size, 1)
  assert.equal(db.collections.rooms.get('r1').players[1].score, 7)
})

test('concurrent transfers serialize room balances and keep one ledger entry each', async () => {
  const db = database()
  const service = createScoreService(db)
  const outcomes = await Promise.all([
    service.transferScore({ roomId: 'r1', operationId: 'op_abcdefgh',
      transfers: [{ toPlayerOpenId: 'bob', score: 5 }] }, 'alice'),
    service.transferScore({ roomId: 'r1', operationId: 'op_ijklmnop',
      transfers: [{ toPlayerOpenId: 'alice', score: 3 }] }, 'bob')
  ])
  assert.equal(outcomes.length, 2)
  assert.deepEqual(db.collections.rooms.get('r1').players.map(player => player.score), [-2, 2])
  assert.equal(db.collections.score_operations.size, 2)
  assert.equal(db.collections.rooms.get('r1').transferCount, 2)
})

test('two simultaneous retries of the same ID commit only once', async () => {
  const db = database()
  const service = createScoreService(db)
  const request = { roomId: 'r1', operationId: 'op_abcdefgh',
    transfers: [{ toPlayerOpenId: 'bob', score: 5 }] }
  const [first, second] = await Promise.all([
    service.transferScore(request, 'alice'), service.transferScore(request, 'alice')
  ])
  assert.deepEqual(first, second)
  assert.equal(db.collections.rooms.get('r1').transferCount, 1)
  assert.equal(db.collections.score_operations.size, 1)
})

test('same operation ID with different request is rejected', async () => {
  const db = database()
  const service = createScoreService(db)
  await service.transferScore({ roomId: 'r1', operationId: 'op_12345678', transfers: [{ toPlayerOpenId: 'bob', score: 7 }] }, 'alice')
  await assert.rejects(service.transferScore({ roomId: 'r1', operationId: 'op_12345678', transfers: [{ toPlayerOpenId: 'bob', score: 8 }] }, 'alice'), /冲突/)
})
