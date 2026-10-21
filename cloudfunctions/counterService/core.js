const crypto = require('crypto')

const MAX_SCORE = 100000
const MAX_PLAYERS = 30

function fail(message) {
  const error = new Error(message)
  error.businessError = true
  throw error
}

function validId(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) fail(`${name}无效`)
  return value
}

function realPlayers(room) {
  return (room.players || []).filter(player => player.openId !== `room_fee_${room._id}`)
}

function assertActiveMember(room, openId) {
  if (!room || !Array.isArray(room.players)) fail('房间不存在')
  if (room.status !== 'active') fail('房间结算中或已结算')
  if (!Array.isArray(room.memberOpenIds) || !room.memberOpenIds.includes(openId) ||
      !realPlayers(room).some(player => player.openId === openId)) fail('您不在该房间中')
}

function normalizeTransferRequest(event, openId) {
  const roomId = validId(event.roomId, '房间ID')
  const operationId = validId(event.operationId, '操作ID')
  validId(openId, '用户ID')
  const list = event.transfers || (event.toPlayerOpenId
    ? [{ toPlayerOpenId: event.toPlayerOpenId, score: event.score }] : null)
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_PLAYERS) fail('给分明细无效')
  const seen = new Set()
  const transfers = list.map(item => {
    const toPlayerOpenId = validId(item.toPlayerOpenId, '接收者ID')
    if (seen.has(toPlayerOpenId)) fail('接收者重复')
    seen.add(toPlayerOpenId)
    if (!Number.isInteger(item.score) || item.score < 1 || item.score > MAX_SCORE) fail('分数须为1到100000的整数')
    return { toPlayerOpenId, score: item.score }
  })
  return { roomId, operationId, actorOpenId: openId, type: 'transfer', transfers }
}

function normalizeWithdrawal(event, openId) {
  const roomId = validId(event.roomId, '房间ID')
  const operationId = validId(event.operationId, '操作ID')
  validId(openId, '用户ID')
  if (!Number.isSafeInteger(event.amount) || event.amount < 1) fail('取回金额须为正整数')
  return { roomId, operationId, actorOpenId: openId, type: 'fee_withdraw', amount: event.amount }
}

function requestHash(request) {
  const source = request.type === 'transfer'
    ? [request.roomId, request.actorOpenId, request.type, request.transfers]
    : [request.roomId, request.actorOpenId, request.type, request.amount]
  return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

function preparePlayers(room) {
  const players = room.players.map(player => ({ ...player }))
  if (players.length > MAX_PLAYERS + 1 || realPlayers(room).length > MAX_PLAYERS) fail('房间人数超限')
  const ids = new Set()
  for (const player of players) {
    if (ids.has(player.openId) || !Number.isSafeInteger(player.score)) fail('房间分数或成员数据异常')
    ids.add(player.openId)
  }
  if (players.reduce((sum, player) => sum + BigInt(player.score), 0n) !== 0n) fail('房间分数总和异常')
  return players
}

function checkedResult(room, players, transfers) {
  for (const player of players) if (!Number.isSafeInteger(player.score)) fail('分数超出安全整数范围')
  if (players.reduce((sum, player) => sum + BigInt(player.score), 0n) !== 0n) fail('给分未保持总分守恒')
  return { players, transfers, roomVersion: (room.version || 0) + 1,
    transferCount: (room.transferCount || 0) + 1 }
}

function applyTransfer(room, request) {
  assertActiveMember(room, request.actorOpenId)
  const players = preparePlayers(room)
  const sender = players.find(player => player.openId === request.actorOpenId)
  const fee = players.find(player => player.openId === `room_fee_${room._id}`)
  const config = room.roomFeeConfig || {}
  if (config.enabled && !fee) fail('房费成员缺失')
  const transfers = []
  for (const item of request.transfers) {
    if (item.toPlayerOpenId === request.actorOpenId) fail('不能给自己给分')
    const receiver = players.find(player => player.openId === item.toPlayerOpenId)
    if (!receiver || (receiver !== fee && !room.memberOpenIds.includes(receiver.openId))) fail('接收者不在房间中')
    if (receiver === fee) {
      sender.score -= item.score
      fee.score += item.score
      transfers.push({ fromOpenId: sender.openId, toOpenId: fee.openId, score: item.score,
        isRoomFee: true, fromNickName: sender.nickName, toNickName: fee.nickName })
      continue
    }
    let feeAmount = 0
    if (config.enabled && fee) {
      if (!Number.isSafeInteger(config.total) || config.total < 1 ||
          !Number.isSafeInteger(config.fullX) || config.fullX < 1 ||
          !Number.isSafeInteger(config.drawY) || config.drawY < 0 || config.drawY > config.fullX) fail('房费配置无效')
      feeAmount = Math.min(Math.floor(item.score / config.fullX) * config.drawY,
        Math.max(0, config.total - fee.score))
    }
    const received = item.score - feeAmount
    sender.score -= item.score
    receiver.score += received
    if (received > 0) transfers.push({ fromOpenId: sender.openId, toOpenId: receiver.openId,
      score: received, isRoomFee: false, fromNickName: sender.nickName, toNickName: receiver.nickName })
    if (feeAmount > 0) {
      fee.score += feeAmount
      transfers.push({ fromOpenId: sender.openId, toOpenId: fee.openId, score: feeAmount,
        isRoomFee: true, fromNickName: sender.nickName, toNickName: fee.nickName })
    }
  }
  return checkedResult(room, players, transfers)
}

function applyFeeWithdrawal(room, openId, amount) {
  assertActiveMember(room, openId)
  const players = preparePlayers(room)
  const fee = players.find(player => player.openId === `room_fee_${room._id}`)
  const receiver = players.find(player => player.openId === openId)
  if (!Number.isSafeInteger(amount) || amount < 1 || !fee || amount > fee.score) fail('房费余额不足')
  fee.score -= amount
  receiver.score += amount
  return checkedResult(room, players, [{ fromOpenId: fee.openId, toOpenId: openId, score: amount,
    isRoomFee: true, fromNickName: fee.nickName, toNickName: receiver.nickName }])
}

function parseRateHundredths(value) {
  const string = String(value)
  if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(string)) fail('倍率无效')
  const [whole, fraction = ''] = string.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (result < 1 || result > 1000000) fail('倍率须为0.01到10000.00')
  return result
}

module.exports = {
  MAX_PLAYERS, fail, validId, realPlayers, assertActiveMember,
  normalizeTransferRequest, normalizeWithdrawal, requestHash,
  applyTransfer, applyFeeWithdrawal, parseRateHundredths
}
