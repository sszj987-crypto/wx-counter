const { fail, realPlayers, parseRateHundredths, validId } = require('./core')
const { emptyStats } = require('./rooms')
const { optionalDocument, isWriteConflict } = require('./score')

function freezeRoomData(room, actorOpenId, rateHundredths, now) {
  if (!room) fail('房间不存在')
  if (actorOpenId !== 'system_cleanup' && !room.memberOpenIds.includes(actorOpenId)) fail('您不在该房间中')
  if (room.status !== 'active') return room
  for (const player of realPlayers(room)) {
    if (!Number.isSafeInteger(player.score * rateHundredths)) fail('倍率分超出安全整数范围')
  }
  return { ...room, status: 'settling', updatedAt: now,
    settlement: { rateHundredths, settlementTime: now, initiatedBy: actorOpenId, completedAt: null } }
}

function buildGameRecord(room, openId) {
  if (!room.settlement || !room.memberOpenIds.includes(openId)) fail('结算记录无效')
  const players = realPlayers(room).map(player => ({
    openId: player.openId, nickName: player.nickName || '玩家',
    avatarUrl: player.avatarUrl || '', score: player.score,
    finalScoreHundredths: player.score * room.settlement.rateHundredths,
    result: player.score > 0 ? '胜利' : player.score < 0 ? '失败' : '平局'
  }))
  const me = players.find(player => player.openId === openId)
  return {
    _id: `${room._id}_${openId}`, roomId: room._id, openId,
    roomNumber: room.roomNumber, settlementTime: room.settlement.settlementTime,
    rateHundredths: room.settlement.rateHundredths,
    myScore: me.score, myFinalScoreHundredths: me.finalScoreHundredths,
    result: me.result, players
  }
}

function nextStatistics(previous, record) {
  const current = { ...emptyStats(), ...previous }
  const totalGames = current.totalGames + 1
  const wins = current.wins + (record.result === '胜利' ? 1 : 0)
  const losses = current.losses + (record.result === '失败' ? 1 : 0)
  const draws = current.draws + (record.result === '平局' ? 1 : 0)
  const totalScoreHundredths = current.totalScoreHundredths + record.myFinalScoreHundredths
  if (!Number.isSafeInteger(totalScoreHundredths)) fail('统计分数超出安全整数范围')
  return { totalGames, wins, losses, draws, totalScoreHundredths,
    netScoreHundredths: totalScoreHundredths, winRate: wins / totalGames }
}

function nextGamemates(previous, record) {
  const list = Array.isArray(previous) ? previous.map(item => ({ ...item })) : []
  for (const player of record.players) {
    if (player.openId === record.openId) continue
    const item = list.find(entry => entry.openId === player.openId)
    if (item) item.gameCount = (item.gameCount || 0) + 1
    else list.push({ openId: player.openId, gameCount: 1, nickName: player.nickName })
  }
  return list
}

function createSettlementService(db) {
  async function transact(work) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const tx = await db.startTransaction()
      try {
        const result = await work(tx)
        await tx.commit()
        return result
      } catch (error) {
        try { await tx.rollback() } catch (_) {}
        if (!isWriteConflict(error) || attempt === 2) throw error
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 100))
      }
    }
  }

  async function freeze(roomId, actorOpenId, rateHundredths) {
    validId(roomId, '房间ID')
    return transact(async tx => {
      const room = await optionalDocument(tx.collection('rooms'), roomId)
      if (!room) fail('房间不存在')
      if (actorOpenId !== 'system_cleanup' && !room.memberOpenIds.includes(actorOpenId)) fail('您不在该房间中')
      if (room.status !== 'active') return { success: true, room }
      const now = new Date()
      const frozen = freezeRoomData(room, actorOpenId, rateHundredths, now)
      const noGame = actorOpenId === 'system_cleanup' && room.transferCount === 0
      if (noGame) {
        frozen.status = 'inactive'
        frozen.settlement.completedAt = now
      }
      await tx.collection('rooms').doc(roomId).update({ data: {
        status: frozen.status, settlement: frozen.settlement, updatedAt: now
      } })
      const creator = await optionalDocument(tx.collection('users'), room.creatorOpenId)
      if (creator?.activeCreatedRoomIds?.includes(roomId)) {
        await tx.collection('users').doc(room.creatorOpenId).update({ data: {
          activeCreatedRoomIds: creator.activeCreatedRoomIds.filter(id => id !== roomId)
        } })
      }
      return { success: true, room: frozen }
    })
  }

  async function processPlayer(room, openId) {
    const recordId = `${room._id}_${openId}`
    return transact(async tx => {
      const existing = await optionalDocument(tx.collection('user_game_records'), recordId)
      if (existing) return { success: true, alreadyProcessed: true }
      const currentRoom = await optionalDocument(tx.collection('rooms'), room._id)
      if (!currentRoom || currentRoom.status !== 'settling') fail('房间不在结算中')
      const record = buildGameRecord(currentRoom, openId)
      const user = await optionalDocument(tx.collection('users'), openId)
      const player = realPlayers(currentRoom).find(item => item.openId === openId)
      const statistics = nextStatistics(user?.statistics, record)
      const gamemate = nextGamemates(user?.gamemate, record)
      if (user) await tx.collection('users').doc(openId).update({ data: { statistics, gamemate } })
      else await tx.collection('users').add({ data: {
        _id: openId, openId, nickName: player.nickName || '玩家', avatarUrl: player.avatarUrl || '',
        gamemate, statistics, activeCreatedRoomIds: [], createdAt: new Date()
      } })
      await tx.collection('user_game_records').add({ data: record })
      return { success: true, alreadyProcessed: false }
    })
  }

  async function processRoom(roomId) {
    const room = await optionalDocument(db.collection('rooms'), roomId)
    if (!room || room.status !== 'settling') return { success: true, skipped: true }
    const failures = []
    for (const player of realPlayers(room)) {
      try { await processPlayer(room, player.openId) }
      catch (error) { failures.push({ openId: player.openId, error: error.message }) }
    }
    if (failures.length) return { success: false, roomId, failures }
    for (const player of realPlayers(room)) {
      if (!await optionalDocument(db.collection('user_game_records'), `${roomId}_${player.openId}`)) {
        return { success: false, roomId, failures: [{ openId: player.openId, error: '历史记录尚未写入' }] }
      }
    }
    await transact(async tx => {
      const current = await optionalDocument(tx.collection('rooms'), roomId)
      if (!current || current.status !== 'settling') return
      await tx.collection('rooms').doc(roomId).update({ data: {
        status: 'inactive', updatedAt: new Date(),
        settlement: { ...current.settlement, completedAt: new Date() }
      } })
    })
    return { success: true, roomId }
  }

  return {
    settleRoom(event, openId) { return freeze(event.roomId, openId, parseRateHundredths(event.rate)) },
    freezeExpired(roomId) { return freeze(roomId, 'system_cleanup', 100) },
    processPlayer, processRoom
  }
}

module.exports = {
  freezeRoomData, buildGameRecord, nextStatistics, nextGamemates,
  createSettlementService
}
