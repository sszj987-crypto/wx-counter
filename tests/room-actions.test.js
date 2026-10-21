const test = require('node:test')
const assert = require('node:assert/strict')
const { buildJoinedRoom, buildFeeRoom, newRoom } = require('../cloudfunctions/counterService/rooms')

test('new room has bounded state without a ledger array', () => {
  const room = newRoom('r1', 'alice', { nickName: '甲', avatarUrl: '' }, new Date('2026-01-01'))
  assert.equal(room.players.length, 1)
  assert.deepEqual(room.memberOpenIds, ['alice'])
  assert.equal(room.transferCount, 0)
  assert.equal(room.version, 0)
  assert.equal(Object.hasOwn(room, 'records'), false)
})

test('join is idempotent and real-player cap ignores room fee member', () => {
  const room = newRoom('r1', 'alice', { nickName: '甲' }, new Date())
  room.players.push({ openId: 'room_fee_r1', nickName: '房费', score: 0 })
  assert.equal(buildJoinedRoom(room, 'alice', {}, new Date()).players.length, 2)
  for (let i = 1; i < 30; i++) {
    const next = buildJoinedRoom(room, `player_${i}`, {}, new Date())
    Object.assign(room, next)
  }
  assert.equal(room.memberOpenIds.length, 30)
  assert.throws(() => buildJoinedRoom(room, 'extra', {}, new Date()), /房间已满/)
})

test('disabling room fee keeps existing balance and member', () => {
  const room = newRoom('r1', 'alice', {}, new Date())
  const enabled = buildFeeRoom(room, 'alice', { enabled: true, total: 100, fullX: 10, drawY: 1 })
  enabled.players[1].score = 2
  enabled.players[0].score = -2
  const disabled = buildFeeRoom(enabled, 'alice', { enabled: false, total: 100, fullX: 10, drawY: 1 })
  assert.equal(disabled.players[1].score, 2)
  assert.equal(disabled.players.length, 2)
})
