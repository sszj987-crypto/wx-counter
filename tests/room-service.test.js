const test = require('node:test')
const assert = require('node:assert/strict')
const { createRoomService } = require('../cloudfunctions/counterService/rooms')

test('nonmember cannot use joinRoom to read a settled room snapshot', async () => {
  const room = { _id: 'r1', status: 'inactive', memberOpenIds: ['alice'], players: [{ openId: 'alice', score: 0 }] }
  const db = { async startTransaction() {
    return { collection() { return { doc() { return { async get() { return { data: room } } } } } },
      async commit() {}, async rollback() {} }
  } }
  const service = createRoomService(db)
  await assert.rejects(service.joinRoom({ roomId: 'r1' }, 'bob'), /无权|不在房间/)
  assert.equal((await service.joinRoom({ roomId: 'r1' }, 'alice')).room._id, 'r1')
})
