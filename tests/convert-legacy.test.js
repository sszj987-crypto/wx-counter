const test = require('node:test')
const assert = require('node:assert/strict')
const { convertLegacyData } = require('../scripts/convert_legacy_data')
const { cli } = require('../scripts/convert_legacy_data')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const room = () => ({
  _id: 'r1', _openid: 'alice', roomNumber: 1234, status: 'inactive',
  createTime: '2026-01-01T00:00:00.000Z', closeTime: '2026-01-01T01:00:00.000Z', rate: 1.25,
  players: [
    { openId: 'alice', nickName: '甲', score: 5 },
    { openId: 'bob', nickName: '乙', score: -5 }
  ],
  records: [{ fromPlayerOpenId: 'bob', toPlayerOpenId: 'alice', score: 5,
    createTime: '2026-01-01T00:30:00.000Z' }]
})

test('converts explicit room and user records without changing input', () => {
  const rooms = [room()]
  const users = [{ _id: 'alice', openId: 'alice', nickName: '甲', gamedata: [{
    roomId: 'r1', roomNumber: 1234, endTime: '2026-01-01T01:00:00.000Z',
    rate: 1.25, myScore: 5, players: room().players
  }] }]
  const original = JSON.stringify({ rooms, users })
  const result = convertLegacyData(rooms, users)
  assert.equal(result.rooms.length, 1)
  assert.equal(result.rooms[0].records, undefined)
  assert.equal(result.score_operations[0]._id, 'legacy_r1_0')
  assert.equal(result.user_game_records[0].myFinalScoreHundredths, 625)
  assert.equal(result.users[0].statistics.totalScoreHundredths, 625)
  assert.equal(JSON.stringify({ rooms, users }), original)
})

test('ambiguous history and unbalanced rooms are reported rather than guessed', () => {
  const bad = room()
  bad._id = 'bad'
  bad.players[1].score = 0
  const result = convertLegacyData([bad, room()], [{ _id: 'alice', gamedata: [{
    roomNumber: 1234, myScore: 5
  }] }])
  assert.equal(result.rooms.length, 1)
  assert.equal(result.user_game_records.length, 0)
  assert.ok(result.report.issues.some(issue => issue.reason.includes('总和')))
  assert.ok(result.report.issues.some(issue => issue.kind === 'score_operation' && issue.id === 'bad:0'))
  assert.ok(result.report.issues.some(issue => issue.reason.includes('结算时间或玩家分数快照')))
})

test('CLI writes importable JSON lines with CloudBase date values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'counter-convert-'))
  const roomsPath = path.join(root, 'old-rooms.json')
  const usersPath = path.join(root, 'old-users.json')
  const output = path.join(root, 'converted')
  fs.writeFileSync(roomsPath, JSON.stringify([room()]))
  fs.writeFileSync(usersPath, '[]')
  cli(['--rooms', roomsPath, '--users', usersPath, '--output', output])
  const lines = fs.readFileSync(path.join(output, 'rooms.json'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0]).createTime, { $date: '2026-01-01T00:00:00.000Z' })
  assert.equal(fs.readFileSync(roomsPath, 'utf8'), JSON.stringify([room()]))
})

test('CLI accepts CloudBase JSON Lines exports as input', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'counter-jsonl-'))
  const roomsPath = path.join(root, 'old-rooms.json')
  const usersPath = path.join(root, 'old-users.json')
  const output = path.join(root, 'converted')
  fs.writeFileSync(roomsPath, `${JSON.stringify(room())}\n`)
  fs.writeFileSync(usersPath, `${JSON.stringify({ _id: 'alice', gamedata: [{
    roomId: 'r1', rate: 1.25, myScore: 5
  }] })}\n`)
  const report = cli(['--rooms', roomsPath, '--users', usersPath, '--output', output])
  assert.equal(report.converted.rooms, 1)
  assert.equal(report.converted.user_game_records, 1)
})

test('duplicate room IDs quarantine every copy and their user history', () => {
  const first = room()
  const second = room()
  second.players[0].score = 9
  second.players[1].score = -9
  const result = convertLegacyData([first, second], [{ _id: 'alice', gamedata: [{
    roomId: 'r1', rate: 1.25, myScore: 5
  }] }])
  assert.equal(result.rooms.length, 0)
  assert.equal(result.user_game_records.length, 0)
  assert.ok(result.report.issues.some(issue => issue.reason.includes('重复')))
  assert.equal(result.score_operations.length, 0)
  assert.equal(result.report.skipped.score_operations, 2)
})

test('malformed entries are reported while valid records still convert', () => {
  const withBadEntries = room()
  withBadEntries.records.push(null)
  const result = convertLegacyData([withBadEntries], [{ _id: 'alice', gamedata: [null, {
    roomId: 'r1', rate: 1.25, myScore: 5
  }] }])
  assert.equal(result.rooms.length, 1)
  assert.equal(result.score_operations.length, 1)
  assert.equal(result.user_game_records.length, 1)
  assert.ok(result.report.issues.some(issue => issue.kind === 'score_operation' && issue.id === 'r1:1'))
  assert.ok(result.report.issues.some(issue => issue.kind === 'user_game_record' && issue.id === 'alice:0'))
})

test('duplicate user IDs quarantine all matching user histories', () => {
  const history = { roomId: 'r1', rate: 1.25, myScore: 5 }
  const result = convertLegacyData([room()], [
    { _id: 'alice', gamedata: [history] },
    { _id: 'alice', gamedata: [history] }
  ])
  assert.equal(result.users.length, 0)
  assert.equal(result.user_game_records.length, 0)
  assert.equal(result.report.skipped.users, 2)
  assert.equal(result.report.skipped.user_game_records, 2)
})

test('matches a legacy history by room number, nearby settlement time and exact scores', () => {
  const oldRoom = room()
  delete oldRoom.rate
  const result = convertLegacyData([oldRoom], [{ _id: 'legacy-document', openid: 'alice', _openid: 'alice',
    gamedata: [{ roomNumber: 1234, endTime: '2026-01-01T00:59:58.000Z',
      players: oldRoom.players, rate: 1.25, myScore: 5, myFinalScore: 6.25 }] }])
  assert.equal(result.rooms.length, 1)
  assert.equal(result.rooms[0].settlement.rateHundredths, 125)
  assert.equal(result.user_game_records.length, 1)
  assert.equal(result.users[0]._id, 'alice')
})

test('does not infer a missing room rate from inconsistent final scores', () => {
  const oldRoom = room()
  delete oldRoom.rate
  const result = convertLegacyData([oldRoom], [{ _id: 'alice', gamedata: [{
    roomNumber: 1234, endTime: '2026-01-01T00:59:58.000Z',
    players: oldRoom.players, rate: 1.25, myScore: 5, myFinalScore: 5
  }] }])
  assert.equal(result.rooms.length, 0)
  assert.equal(result.user_game_records.length, 0)
  assert.ok(result.report.issues.some(issue => issue.kind === 'room' && issue.reason.includes('倍率')))
})

test('defaults to 1x when no matching history can establish a room rate', () => {
  const oldRoom = room()
  delete oldRoom.rate
  const result = convertLegacyData([oldRoom], [])
  assert.equal(result.rooms.length, 1)
  assert.equal(result.rooms[0].settlement.rateHundredths, 100)
  assert.deepEqual(result.report.assumptions, [{
    kind: 'room_rate', roomId: 'r1', rateHundredths: 100,
    reason: '缺少可核对的房间倍率历史，按默认1倍处理'
  }])
})

test('preserves validated personal history when its room was not exported', () => {
  const result = convertLegacyData([], [{ _id: 'alice', gamedata: [{
    roomNumber: 4321, endTime: '2026-01-02T01:00:00.000Z', rate: 1.25,
    myScore: 5, myFinalScore: 6.25, myResult: '胜利',
    players: [
      { openId: 'alice', nickName: '甲', score: 5, finalScore: 6.25 },
      { openId: 'bob', nickName: '乙', score: -5, finalScore: -6.25 }
    ]
  }] }])
  assert.equal(result.user_game_records.length, 1)
  assert.equal(result.user_game_records[0].roomId, null)
  assert.equal(result.user_game_records[0].legacyUnlinked, true)
  assert.equal(result.user_game_records[0].myFinalScoreHundredths, 625)
  assert.equal(result.users[0].statistics.totalGames, 1)
  assert.equal(result.report.skipped.user_game_records, 0)
})

test('unlinked history keeps duplicate player rows but counts a teammate once', () => {
  const result = convertLegacyData([], [{ _id: 'alice', gamedata: [{
    roomNumber: 4321, endTime: '2026-01-02T01:00:00.000Z', rate: 1,
    myScore: 5, myFinalScore: 5, myResult: '胜利',
    players: [
      { openId: 'alice', score: 5, finalScore: 5 },
      { openId: 'bob', score: -3, finalScore: -3 },
      { openId: 'bob', score: -2, finalScore: -2 },
      { openId: 'room_fee_old', score: 0, finalScore: 0 }
    ]
  }] }])
  assert.equal(result.user_game_records.length, 1)
  assert.equal(result.user_game_records[0].players.length, 3)
  assert.equal(result.users[0].gamemate.length, 1)
  assert.equal(result.users[0].gamemate[0].gameCount, 1)
  assert.equal(result.report.warnings.length, 1)
})

test('unlinked history with inconsistent final score stays in the report', () => {
  const result = convertLegacyData([], [{ _id: 'alice', gamedata: [{
    roomNumber: 4321, endTime: '2026-01-02T01:00:00.000Z', rate: 2,
    myScore: 5, myFinalScore: 5, myResult: '胜利',
    players: [{ openId: 'alice', score: 5, finalScore: 5 }]
  }] }])
  assert.equal(result.user_game_records.length, 0)
  assert.ok(result.report.issues.some(issue => issue.kind === 'user_game_record'))
})
