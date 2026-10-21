const test = require('node:test')
const assert = require('node:assert/strict')
const { createSettlementService } = require('../cloudfunctions/counterService/settlement')

function fakeDatabase() {
  const players = [{ openId: 'alice', score: 29 },
    ...Array.from({ length: 29 }, (_, index) => ({ openId: `player_${index + 1}`, score: -1 }))]
  const source = {
    rooms: new Map([['r1', {
      _id: 'r1', roomNumber: 1234, creatorOpenId: 'alice',
      status: 'active', transferCount: 1, memberOpenIds: players.map(player => player.openId),
      players
    }]]),
    users: new Map(),
    user_game_records: new Map()
  }
  const clone = value => value === undefined ? undefined : structuredClone(value)
  let failLastOnce = true
  const document = (name, id, staged) => ({
    async get() { return { data: clone(source[name].get(id)) || null } },
    async update({ data }) {
      staged.push(() => source[name].set(id, { ...source[name].get(id), ...clone(data) }))
    }
  })
  const collection = (name, staged) => ({
    doc(id) { return document(name, id, staged) },
    async add({ data }) {
      if (name === 'user_game_records' && data.openId === 'player_29' && failLastOnce) {
        failLastOnce = false
        throw new Error('injected write failure')
      }
      if (source[name].has(data._id)) throw new Error('duplicate key')
      staged.push(() => source[name].set(data._id, clone(data)))
    }
  })
  return {
    source,
    collection(name) { return collection(name, []) },
    async startTransaction() {
      const staged = []
      return { collection(name) { return collection(name, staged) },
        async commit() { for (const write of staged) write() }, async rollback() {} }
    }
  }
}

test('30-player settlement resumes after one failed player without double statistics', async () => {
  const db = fakeDatabase()
  const service = createSettlementService(db)
  await service.settleRoom({ roomId: 'r1', rate: '1.25' }, 'player_29')
  const first = await service.processRoom('r1')
  assert.equal(first.success, false)
  assert.equal(db.source.rooms.get('r1').status, 'settling')
  assert.equal(db.source.users.get('alice').statistics.totalGames, 1)
  assert.equal(db.source.user_game_records.size, 29)
  const second = await service.processRoom('r1')
  assert.equal(second.success, true)
  assert.equal(db.source.rooms.get('r1').status, 'inactive')
  assert.equal(db.source.user_game_records.size, 30)
  assert.equal(db.source.users.get('alice').statistics.totalGames, 1)
  assert.equal(db.source.users.get('player_29').statistics.totalGames, 1)
})
