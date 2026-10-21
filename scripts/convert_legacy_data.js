#!/usr/bin/env node
// Offline only: convert exported JSON arrays. This file never imports a cloud SDK.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { parseRateHundredths } = require('../cloudfunctions/counterService/core')
const { buildGameRecord, nextStatistics, nextGamemates } = require('../cloudfunctions/counterService/settlement')
const { emptyStats } = require('../cloudfunctions/counterService/rooms')

function asDate(value) {
  const raw = value && typeof value === 'object' && '$date' in value
    ? (typeof value.$date === 'object' ? Number(value.$date.$numberLong) : value.$date)
    : value
  const date = new Date(raw)
  return value && !Number.isNaN(date.getTime()) ? date : null
}

function toImportJSON(value) {
  if (value instanceof Date) return { $date: value.toISOString() }
  if (Array.isArray(value)) return value.map(toImportJSON)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toImportJSON(item)]))
  }
  return value
}

function readExport(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim()
  if (!content) return []
  if (content.startsWith('[')) {
    const documents = JSON.parse(content)
    if (!Array.isArray(documents)) throw new Error(`${filePath} 必须是 JSON 文档数组或 JSON Lines`)
    return documents
  }
  return content.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line) }
    catch (error) { throw new Error(`${filePath} 第 ${index + 1} 行不是有效 JSON：${error.message}`) }
  })
}

function userOpenId(source) {
  if (!source || typeof source !== 'object') return null
  if (source.openId) return source._id === source.openId ? source.openId : null
  if (source.openid) return source._openid === source.openid ? source.openid : null
  return !source._openid || source._id === source._openid ? source._id : null
}

function samePlayerScores(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  const scores = new Map(left.map(player => [player?.openId, player?.score]))
  return scores.size === left.length && right.every(player =>
    player && scores.has(player.openId) && scores.get(player.openId) === player.score)
}

function historyMatchesRoom(room, history, openId) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) return false
  if (history.roomId) return history.roomId === room._id
  const end = asDate(history.endTime)
  const settled = asDate(room.settlement?.settlementTime || room.settlementTime || room.closeTime)
  if (history.roomNumber !== room.roomNumber || !end || !settled ||
      end > settled || settled - end > 10000 ||
      !samePlayerScores(room.players, history.players)) return false
  return room.players.some(player => player.openId === openId && player.score === history.myScore)
}

function matchingRate(room, histories) {
  const matching = histories.filter(({ openId, history }) => historyMatchesRoom(room, history, openId))
  if (!matching.length) return { rate: null, reason: '缺少可核对的房间倍率历史' }
  const rates = new Set()
  for (const { history } of matching) {
    let rate
    try { rate = parseRateHundredths(history.rate) }
    catch (_) { return { rate: null, reason: '历史倍率无效' } }
    if (!Number.isFinite(history.myFinalScore) ||
        Math.round(history.myFinalScore * 100) !== history.myScore * rate) {
      return { rate: null, reason: '历史倍率分与原始分数不一致' }
    }
    rates.add(rate)
  }
  return rates.size === 1
    ? { rate: [...rates][0], reason: '' }
    : { rate: null, reason: '同一房间存在不同倍率' }
}

function buildUnlinkedHistory(history, openId) {
  const settled = asDate(history.endTime)
  if (!Number.isSafeInteger(history.roomNumber) || !settled ||
      !Number.isSafeInteger(history.myScore) || !Array.isArray(history.players) ||
      history.players.length < 1 || history.players.length > 31) {
    throw new Error('缺少有效房间号、结束时间、本人分数或玩家快照')
  }
  const rateHundredths = parseRateHundredths(history.rate)
  const myFinalScoreHundredths = history.myScore * rateHundredths
  const result = history.myScore > 0 ? '胜利' : history.myScore < 0 ? '失败' : '平局'
  if (!Number.isSafeInteger(myFinalScoreHundredths) ||
      !Number.isFinite(history.myFinalScore) ||
      Math.round(history.myFinalScore * 100) !== myFinalScoreHundredths ||
      history.myResult !== result) throw new Error('本人倍率分或胜负结果与原始分数不一致')
  const players = []
  for (const player of history.players) {
    if (!player || typeof player.openId !== 'string' || !player.openId ||
        !Number.isSafeInteger(player.score) ||
        !Number.isSafeInteger(player.score * rateHundredths) ||
        !Number.isFinite(player.finalScore) ||
        Math.round(player.finalScore * 100) !== player.score * rateHundredths) {
      throw new Error('玩家快照中的分数或倍率分异常')
    }
    if (player.openId.startsWith('room_fee_')) continue
    players.push({ openId: player.openId, nickName: player.nickName || '玩家',
      avatarUrl: '', score: player.score,
      finalScoreHundredths: player.score * rateHundredths,
      result: player.score > 0 ? '胜利' : player.score < 0 ? '失败' : '平局' })
  }
  if (players.filter(player => player.openId === openId && player.score === history.myScore).length !== 1) {
    throw new Error('本人身份或分数与玩家快照不一致')
  }
  const sourceKey = JSON.stringify([openId, history.roomNumber, settled.toISOString(),
    rateHundredths, history.myScore, history.players.map(player => [player.openId, player.score])])
  const _id = `legacy_user_${crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 40)}`
  return { _id, roomId: null, legacyUnlinked: true, openId,
    roomNumber: history.roomNumber, settlementTime: settled, rateHundredths,
    myScore: history.myScore, myFinalScoreHundredths, result, players }
}

function convertLegacyData(legacyRooms, legacyUsers) {
  if (!Array.isArray(legacyRooms) || !Array.isArray(legacyUsers)) throw new Error('输入必须是 JSON 文档数组')
  const output = { rooms: [], score_operations: [], user_game_records: [], users: [],
    report: { input: { rooms: legacyRooms.length, users: legacyUsers.length },
      converted: {}, skipped: {}, conflicts: 0, roomScoreSums: [], assumptions: [], warnings: [], issues: [] } }
  const issue = (kind, id, reason) => output.report.issues.push({ kind, id, reason })
  const roomsById = new Map()
  const roomIdCounts = new Map()
  for (const source of legacyRooms) {
    if (source && typeof source._id === 'string' && source._id) {
      roomIdCounts.set(source._id, (roomIdCounts.get(source._id) || 0) + 1)
    }
  }
  const userIdCounts = new Map()
  for (const source of legacyUsers) {
    const openId = userOpenId(source)
    if (typeof openId === 'string' && openId) userIdCounts.set(openId, (userIdCounts.get(openId) || 0) + 1)
  }
  const histories = legacyUsers.flatMap(source => {
    const openId = userOpenId(source)
    if (!openId || userIdCounts.get(openId) !== 1 || !Array.isArray(source.gamedata)) return []
    return source.gamedata.map(history => ({ openId, history }))
  })

  for (const source of legacyRooms) {
    const id = source && source._id
    if (source?.status !== 'inactive') {
      const reason = '房间尚未结算，必须先完成旧版结算'
      issue('room', String(typeof id === 'string' ? id : id?.$oid || ''), reason)
      if (Array.isArray(source?.records)) source.records.forEach((_, index) =>
        issue('score_operation', `${String(id?.$oid || id)}:${index}`, `所属房间未转换：${reason}`))
      continue
    }
    if (!id || typeof id !== 'string' || roomIdCounts.get(id) > 1) {
      const reason = roomIdCounts.get(id) > 1 ? '房间ID重复，所有副本均跳过' : '房间ID缺失或不是字符串'
      issue('room', String(id || ''), reason)
      if (Array.isArray(source?.records)) source.records.forEach((_, index) =>
        issue('score_operation', `${id}:${index}`, `所属房间未转换：${reason}`))
      output.report.conflicts++
      continue
    }
    const players = Array.isArray(source.players) ? source.players : []
    const sum = players.reduce((total, player) => total + Number(player && player.score || 0), 0)
    output.report.roomScoreSums.push({ roomId: id, scoreSum: sum })
    const memberIds = players.filter(player => player && player.openId !== `room_fee_${id}`).map(player => player.openId)
    const created = asDate(source.createTime)
    const settled = asDate(source.settlementTime || source.closeTime)
    let rateHundredths = null
    let rateReason = ''
    let assumedDefaultRate = false
    if (source.rate !== undefined) {
      try { rateHundredths = parseRateHundredths(source.rate) }
      catch (_) { rateReason = '房间倍率无效' }
    } else {
      const inferred = matchingRate(source, histories)
      rateHundredths = inferred.rate
      rateReason = inferred.reason
      if (!rateHundredths && rateReason === '缺少可核对的房间倍率历史') {
        rateHundredths = 100
        assumedDefaultRate = true
      }
    }
    let reason = ''
    if (!source._openid || !source.roomNumber || !created || !settled) reason = '房间创建者、编号或时间缺失'
    else if (!rateHundredths) reason = rateReason || '房间倍率缺失'
    else if (memberIds.length < 1 || memberIds.length > 30 || new Set(memberIds).size !== memberIds.length ||
      players.some(player => !player || !player.openId || !Number.isSafeInteger(player.score))) reason = '房间成员或分数异常'
    else if (sum !== 0) reason = '房间原始分数总和不为零'
    if (reason) {
      issue('room', id, reason)
      if (Array.isArray(source.records)) source.records.forEach((_, index) =>
        issue('score_operation', `${id}:${index}`, `所属房间未转换：${reason}`))
      continue
    }
    if (assumedDefaultRate) output.report.assumptions.push({
      kind: 'room_rate', roomId: id, rateHundredths: 100,
      reason: '缺少可核对的房间倍率历史，按默认1倍处理'
    })
    const room = {
      _id: id, creatorOpenId: source._openid, roomNumber: source.roomNumber,
      status: 'inactive', createTime: created, updatedAt: settled,
      memberOpenIds: memberIds,
      players: players.map(player => ({ openId: player.openId, nickName: player.nickName || '玩家',
        avatarUrl: player.avatarUrl || '', score: player.score, joinTime: asDate(player.joinTime) || created })),
      roomFeeConfig: source.roomFeeConfig || { enabled: false, total: 100, fullX: 10, drawY: 1 },
      transferCount: 0, version: 0,
      settlement: { rateHundredths, settlementTime: settled,
        initiatedBy: source.settlementCompletedBy || 'legacy_import', completedAt: settled }
    }
    const records = Array.isArray(source.records) ? source.records : []
    records.forEach((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        issue('score_operation', `${id}:${index}`, '流水记录格式异常')
        return
      }
      const fromOpenId = record.fromPlayerOpenId
      const toOpenId = record.toPlayerOpenId
      const time = asDate(record.createTime)
      if (!players.some(player => player.openId === fromOpenId) ||
          !players.some(player => player.openId === toOpenId) ||
          !Number.isSafeInteger(record.score) || record.score < 1 || !time) {
        issue('score_operation', `${id}:${index}`, '流水玩家、整数分数或时间异常')
        return
      }
      output.score_operations.push({
        _id: `legacy_${id}_${index}`, roomId: id, actorOpenId: fromOpenId,
        type: 'transfer', transfers: [{ fromOpenId, toOpenId, score: record.score,
          isRoomFee: !!record.isRoomFee,
          fromNickName: record.fromPlayerNickName || players.find(player => player.openId === fromOpenId).nickName,
          toNickName: record.toPlayerNickName || players.find(player => player.openId === toOpenId).nickName }],
        createdAt: time, roomVersion: index + 1, requestHash: `legacy_${id}_${index}`
      })
      room.transferCount++
    })
    room.version = room.transferCount
    output.rooms.push(room)
    roomsById.set(id, room)
  }

  const recordIds = new Set()
  for (const source of legacyUsers) {
    const openId = userOpenId(source)
    if (typeof openId !== 'string' || !openId || userIdCounts.get(openId) > 1) {
      const reason = userIdCounts.get(openId) > 1 ? '用户ID重复，所有副本均跳过' : '用户ID缺失'
      issue('user', String(openId || ''), reason)
      if (Array.isArray(source?.gamedata)) source.gamedata.forEach((_, index) =>
        issue('user_game_record', `${openId}:${index}`, `所属用户未转换：${reason}`))
      output.report.conflicts++
      continue
    }
    const user = { _id: openId, openId, nickName: source.nickName || '玩家',
      avatarUrl: source.avatarUrl || '', largeTextEnabled: !!source.largeTextEnabled,
      activeCreatedRoomIds: [], gamemate: [], statistics: emptyStats(),
      createdAt: asDate(source.createdAt || source.createTime) || new Date(0) }
    const gameData = Array.isArray(source.gamedata) ? source.gamedata : []
    for (let index = 0; index < gameData.length; index++) {
      const legacy = gameData[index]
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
        issue('user_game_record', `${openId}:${index}`, '历史记录格式异常')
        continue
      }
      const roomWasExported = legacyRooms.some(sourceRoom =>
        (legacy.roomId && sourceRoom?._id === legacy.roomId) ||
        sourceRoom?.roomNumber === legacy.roomNumber)
      if (!roomWasExported) {
        try {
          const record = buildUnlinkedHistory(legacy, openId)
          if (recordIds.has(record._id)) throw new Error('完全相同的个人历史重复')
          const teammates = [...new Map(record.players.map(player => [player.openId, player])).values()]
          const statistics = nextStatistics(user.statistics, record)
          const gamemate = nextGamemates(user.gamemate, { ...record, players: teammates })
          recordIds.add(record._id)
          output.user_game_records.push(record)
          user.statistics = statistics
          user.gamemate = gamemate
          if (teammates.length !== record.players.length) output.report.warnings.push({
            kind: 'user_game_record', id: `${openId}:${index}`,
            reason: '原玩家快照含重复玩家；历史保留原行，队友局数仅计一次'
          })
        } catch (error) {
          issue('user_game_record', `${openId}:${index}`, `无房间快照历史未转换：${error.message}`)
        }
        continue
      }
      const matches = legacy.roomId
        ? [roomsById.get(legacy.roomId)].filter(Boolean)
        : [...roomsById.values()].filter(room => historyMatchesRoom(room, legacy, openId))
      const room = matches.length === 1 ? matches[0] : null
      if (!room || !room.memberOpenIds.includes(openId)) {
        let reason = '无法唯一匹配房间或玩家'
        if (legacy.roomId) {
          if (!roomsById.has(legacy.roomId)) reason = '指定房间未转换或未在导出中'
        } else if (!output.rooms.some(convertedRoom => convertedRoom.roomNumber === legacy.roomNumber)) {
          reason = '房间未转换，历史无法匹配'
        } else if (matches.length === 0) {
          reason = '房间号存在，但结算时间或玩家分数快照不一致'
        }
        issue('user_game_record', `${openId}:${index}`, reason)
        continue
      }
      const recordId = `${room._id}_${openId}`
      if (recordIds.has(recordId) || Number(legacy.myScore) !== room.players.find(player => player.openId === openId).score ||
          Number(legacy.rate) !== room.settlement.rateHundredths / 100 ||
          (legacy.myFinalScore !== undefined &&
            Math.round(Number(legacy.myFinalScore) * 100) !== legacy.myScore * room.settlement.rateHundredths)) {
        issue('user_game_record', `${openId}:${index}`, '历史记录重复或分数、倍率与房间不一致')
        output.report.conflicts++
        continue
      }
      const record = buildGameRecord(room, openId)
      recordIds.add(recordId)
      output.user_game_records.push(record)
      user.statistics = nextStatistics(user.statistics, record)
      user.gamemate = nextGamemates(user.gamemate, record)
    }
    output.users.push(user)
  }

  for (const key of ['rooms', 'score_operations', 'user_game_records', 'users']) {
    output.report.converted[key] = output[key].length
  }
  output.report.skipped = {
    rooms: legacyRooms.length - output.rooms.length,
    score_operations: legacyRooms.reduce((count, room) => count + (Array.isArray(room?.records) ? room.records.length : 0), 0) - output.score_operations.length,
    user_game_records: legacyUsers.reduce((count, user) => count + (Array.isArray(user?.gamedata) ? user.gamedata.length : 0), 0) - output.user_game_records.length,
    users: legacyUsers.length - output.users.length
  }
  return output
}

function cli(args) {
  const option = name => args[args.indexOf(name) + 1]
  const roomsPath = option('--rooms')
  const usersPath = option('--users')
  const outputPath = option('--output')
  if (!roomsPath || !usersPath || !outputPath || !args.includes('--rooms') ||
      !args.includes('--users') || !args.includes('--output')) throw new Error('用法: node scripts/convert_legacy_data.js --rooms <JSON> --users <JSON> --output <目录>')
  const outputDirectory = path.resolve(outputPath)
  const inputPaths = [path.resolve(roomsPath), path.resolve(usersPath)]
  for (const name of ['rooms', 'score_operations', 'user_game_records', 'users', 'report']) {
    if (inputPaths.includes(path.join(outputDirectory, `${name}.json`))) throw new Error('输出目录不能覆盖输入文件')
  }
  const converted = convertLegacyData(readExport(inputPaths[0]), readExport(inputPaths[1]))
  fs.mkdirSync(outputDirectory, { recursive: true })
  for (const name of ['rooms', 'score_operations', 'user_game_records', 'users']) {
    fs.writeFileSync(path.join(outputDirectory, `${name}.json`),
      converted[name].map(item => JSON.stringify(toImportJSON(item))).join('\n') + (converted[name].length ? '\n' : ''))
  }
  fs.writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify(converted.report, null, 2) + '\n')
  return converted.report
}

if (require.main === module) {
  try { console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}

module.exports = { convertLegacyData, cli, readExport }
