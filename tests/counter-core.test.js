const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeTransferRequest,
  applyTransfer,
  applyFeeWithdrawal,
  parseRateHundredths
} = require('../cloudfunctions/counterService/core')

const room = () => ({
  _id: 'r1', status: 'active', version: 0, transferCount: 0,
  memberOpenIds: ['alice', 'bob', 'carol'],
  players: [
    { openId: 'alice', score: 0 },
    { openId: 'bob', score: 0 },
    { openId: 'carol', score: 0 },
    { openId: 'room_fee_r1', score: 0 }
  ],
  roomFeeConfig: { enabled: true, total: 100, fullX: 10, drawY: 1 }
})

test('batch transfer preserves zero sum and collects capped room fee', () => {
  const request = normalizeTransferRequest({ roomId: 'r1', operationId: 'op_12345678', transfers: [
    { toPlayerOpenId: 'bob', score: 20 },
    { toPlayerOpenId: 'carol', score: 10 }
  ] }, 'alice')
  const result = applyTransfer(room(), request)
  assert.deepEqual(result.players.map(p => p.score), [-30, 18, 9, 3])
  assert.equal(result.transfers.length, 4)
  assert.equal(result.players.reduce((sum, p) => sum + p.score, 0), 0)
  assert.equal(result.roomVersion, 1)
})

test('duplicate recipients and invalid integer scores reject the entire request', () => {
  assert.throws(() => normalizeTransferRequest({ roomId: 'r1', operationId: 'op_12345678', transfers: [
    { toPlayerOpenId: 'bob', score: 1 }, { toPlayerOpenId: 'bob', score: 2 }
  ] }, 'alice'), /重复/)
  assert.throws(() => normalizeTransferRequest({ roomId: 'r1', operationId: 'op_12345678', transfers: [
    { toPlayerOpenId: 'bob', score: 1.5 }
  ] }, 'alice'), /整数/)
})

test('settling room cannot transfer or withdraw room fee', () => {
  const frozen = room()
  frozen.status = 'settling'
  const request = normalizeTransferRequest({ roomId: 'r1', operationId: 'op_12345678', transfers: [
    { toPlayerOpenId: 'bob', score: 1 }
  ] }, 'alice')
  assert.throws(() => applyTransfer(frozen, request), /已结算|结算中/)
  assert.throws(() => applyFeeWithdrawal(frozen, 'alice', 1), /已结算|结算中/)
})

test('room fee withdrawal moves balances without changing total', () => {
  const source = room()
  source.players[3].score = 5
  source.players[0].score = -5
  const result = applyFeeWithdrawal(source, 'bob', 3)
  assert.deepEqual(result.players.map(p => p.score), [-5, 3, 0, 2])
  assert.equal(result.players.reduce((sum, p) => sum + p.score, 0), 0)
})

test('enabled fee without fee member rejects transfer instead of silently omitting fee', () => {
  const broken = room()
  broken.players.pop()
  const request = normalizeTransferRequest({ roomId: 'r1', operationId: 'op_12345678',
    transfers: [{ toPlayerOpenId: 'bob', score: 10 }] }, 'alice')
  assert.throws(() => applyTransfer(broken, request), /房费成员/)
})

test('rate uses exact hundredths and rejects excess precision', () => {
  assert.equal(parseRateHundredths('1.25'), 125)
  assert.equal(parseRateHundredths('0.01'), 1)
  assert.throws(() => parseRateHundredths('1.234'), /倍率/)
})

test('room document size stays bounded as operation count grows', () => {
  let current = room()
  current.roomFeeConfig.enabled = false
  const initialBytes = Buffer.byteLength(JSON.stringify(current))
  for (let index = 0; index < 1000; index++) {
    const request = normalizeTransferRequest({ roomId: 'r1', operationId: `op_${String(index).padStart(8, '0')}`,
      transfers: [{ toPlayerOpenId: 'bob', score: 1 }] }, 'alice')
    const result = applyTransfer(current, request)
    current = { ...current, players: result.players, version: result.roomVersion,
      transferCount: result.transferCount }
  }
  assert.ok(Buffer.byteLength(JSON.stringify(current)) - initialBytes < 40)
  assert.equal(Object.hasOwn(current, 'records'), false)
})
