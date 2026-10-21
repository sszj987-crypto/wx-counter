const test = require('node:test')
const assert = require('node:assert/strict')
const { buildGameRecord, nextStatistics, freezeRoomData } = require('../cloudfunctions/counterService/settlement')

const room = () => ({
  _id: 'r1', roomNumber: 1234, status: 'active', transferCount: 2,
  creatorOpenId: 'alice', memberOpenIds: ['alice', 'bob'],
  players: [
    { openId: 'alice', nickName: '甲', score: 5 },
    { openId: 'bob', nickName: '乙', score: -5 },
    { openId: 'room_fee_r1', nickName: '房费', score: 0 }
  ]
})

test('freeze preserves balances and exact rate for immediate display', () => {
  const frozen = freezeRoomData(room(), 'bob', 125, new Date('2026-01-01'))
  assert.equal(frozen.status, 'settling')
  assert.equal(frozen.settlement.rateHundredths, 125)
  assert.equal(frozen.players[0].score, 5)
})

test('game record and statistics use hundredths and exclude fee player', () => {
  const frozen = freezeRoomData(room(), 'bob', 125, new Date('2026-01-01'))
  const record = buildGameRecord(frozen, 'alice')
  assert.equal(record._id, 'r1_alice')
  assert.equal(record.myFinalScoreHundredths, 625)
  assert.equal(record.players.length, 2)
  const stats = nextStatistics({ totalGames: 1, wins: 0, losses: 0, draws: 1,
    totalScoreHundredths: 0, netScoreHundredths: 0 }, record)
  assert.equal(stats.totalGames, 2)
  assert.equal(stats.winRate, 0.5)
  assert.equal(stats.totalScoreHundredths, 625)
})

test('zero net score with operations still creates a game record', () => {
  const source = room()
  source.players[0].score = 0
  source.players[1].score = 0
  const record = buildGameRecord(freezeRoomData(source, 'system_cleanup', 100, new Date()), 'alice')
  assert.equal(record.result, '平局')
  assert.equal(record.myFinalScoreHundredths, 0)
})
