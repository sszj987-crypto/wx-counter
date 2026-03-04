// 云函数入口
const cloud = require('wx-server-sdk')

cloud.init()

exports.main = async (event, context) => {
  const db = cloud.database()
  const now = new Date()
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000)
  const _ = db.command

  const shouldAutoSettle = room => {
    const records = Array.isArray(room.records) ? room.records : []
    if (records.length > 0) {
      return true
    }
    const players = Array.isArray(room.players) ? room.players : []
    return players.some(p => Number(p.score || 0) !== 0)
  }

  const isTeaServicePlayer = player => {
    return player && (player.nickName === '台位/茶水' || String(player.openId || '').startsWith('tea_service_'))
  }

  const computePlayerResults = (players, rate) => {
    return players.map(player => {
      const rawScore = player.score || 0
      const finalScore = rawScore * rate
      let result = '平局'
      if (finalScore > 0) {
        result = '胜利'
      } else if (finalScore < 0) {
        result = '失败'
      }
      return {
        openId: player.openId,
        nickName: player.nickName || '玩家',
        score: rawScore,
        finalScore,
        result
      }
    })
  }

  const getCurrentStats = currentUserData => {
    if (currentUserData.statistics) {
      return currentUserData.statistics
    }
    if (currentUserData.gamedata && !Array.isArray(currentUserData.gamedata) && currentUserData.gamedata.statistics) {
      return currentUserData.gamedata.statistics
    }
    const latestGameData = currentUserData.gamedata && currentUserData.gamedata.length > 0
      ? currentUserData.gamedata[currentUserData.gamedata.length - 1]
      : {}
    return latestGameData.statistics || {
      totalGames: 0,
      totalScore: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      netScore: 0
    }
  }

  const buildNewGameData = (currentGamedata, gameDataRecord) => {
    if (!currentGamedata) {
      return [gameDataRecord]
    }
    if (Array.isArray(currentGamedata)) {
      return [...currentGamedata, gameDataRecord]
    }
    let existingRecords = []
    if (typeof currentGamedata === 'object') {
      if (Array.isArray(currentGamedata.records)) {
        existingRecords = currentGamedata.records
      } else {
        existingRecords = [currentGamedata]
      }
    }
    return [...existingRecords, gameDataRecord]
  }

  const ensureUser = async playerResult => {
    try {
      const userDoc = await db.collection('users').doc(playerResult.openId).get()
      return userDoc.data || {}
    } catch (error) {
      const newUserData = {
        _id: playerResult.openId,
        openId: playerResult.openId,
        nickName: playerResult.nickName || '玩家',
        avatarUrl: '',
        gamemate: [],
        gamedata: [],
        statistics: {
          totalGames: 0,
          totalScore: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          netScore: 0
        },
        lastActiveTime: new Date(),
        createdAt: new Date(),
        fromDatabase: true,
        largeTextEnabled: false
      }
      await db.collection('users').add({ data: newUserData })
      return newUserData
    }
  }

  const updateUserStats = async (playerResult, playerResults, settlementData) => {
    const currentUserData = await ensureUser(playerResult)
    const currentStats = getCurrentStats(currentUserData)
    const totalGames = currentStats.totalGames + 1
    const totalScore = currentStats.totalScore + playerResult.finalScore
    const wins = currentStats.wins + (playerResult.result === '胜利' ? 1 : 0)
    const losses = currentStats.losses + (playerResult.result === '失败' ? 1 : 0)
    const draws = currentStats.draws + (playerResult.result === '平局' ? 1 : 0)
    const winRate = totalGames > 0 ? wins / totalGames : 0
    const netScore = totalScore

    const gamemates = playerResults
      .filter(p => p.openId !== playerResult.openId && !isTeaServicePlayer(p))
      .map(p => ({ openId: p.openId, gameCount: 1 }))
    const currentGamemates = currentUserData.gamemate || []
    const updatedGamemates = [...currentGamemates]
    for (const gamemate of gamemates) {
      const existingIndex = updatedGamemates.findIndex(g => g.openId === gamemate.openId)
      if (existingIndex >= 0) {
        updatedGamemates[existingIndex].gameCount =
          (updatedGamemates[existingIndex].gameCount || 0) + gamemate.gameCount
      } else {
        updatedGamemates.push(gamemate)
      }
    }

    const gameDataRecord = {
      roomNumber: settlementData.roomNumber,
      endTime: settlementData.settlementTime,
      rate: settlementData.rate,
      myScore: playerResult.score || 0,
      myFinalScore: playerResult.finalScore,
      myResult: playerResult.result,
      players: playerResults.map(p => ({
        openId: p.openId,
        nickName: p.nickName,
        score: p.score || 0,
        finalScore: p.finalScore,
        result: p.result
      }))
    }
    const newGameData = buildNewGameData(currentUserData.gamedata, gameDataRecord)

    await db.collection('users').doc(playerResult.openId).update({
      data: {
        gamemate: updatedGamemates,
        gamedata: newGameData,
        statistics: {
          totalGames,
          totalScore,
          wins,
          losses,
          draws,
          winRate,
          netScore
        },
        lastActiveTime: new Date()
      }
    })
  }

  const settleRoom = async room => {
    const players = Array.isArray(room.players) ? room.players : []
    const rate = Number(room.rate || 1)
    const settlementData = {
      roomId: room._id,
      roomNumber: room.roomNumber,
      settlementTime: new Date(),
      players,
      rate
    }
    const playerResults = computePlayerResults(players, rate)
    for (const playerResult of playerResults) {
      if (isTeaServicePlayer(playerResult)) {
        continue
      }
      await updateUserStats(playerResult, playerResults, settlementData)
    }
    await db.collection('rooms').doc(room._id).update({
      data: {
        status: 'inactive',
        closeTime: new Date(),
        settlementTime: settlementData.settlementTime,
        settlementCompleted: true,
        settlementCompletedAt: settlementData.settlementTime,
        settlementCompletedBy: 'system_cleanup',
        settlementLockTime: null,
        settlementLocker: null
      }
    })
  }

  try {
    const res = await db.collection('rooms')
      .where({
        createTime: _.lt(twentyFourHoursAgo)
      })
      .get()

    if (res.data.length > 0) {
      let settledCount = 0
      let deletedCount = 0
      let skippedCount = 0
      let failedCount = 0
      for (const room of res.data) {
        try {
          if (room.status === 'inactive') {
            await db.collection('rooms').doc(room._id).remove()
            deletedCount += 1
            continue
          }
          if (shouldAutoSettle(room)) {
            await settleRoom(room)
            settledCount += 1
          } else {
            skippedCount += 1
          }
          await db.collection('rooms').doc(room._id).remove()
          deletedCount += 1
        } catch (roomError) {
          failedCount += 1
        }
      }
      return {
        success: true,
        message: `成功处理 ${res.data.length} 条房间`,
        settledCount,
        deletedCount,
        skippedCount,
        failedCount
      }
    } else {
      return {
        success: false,
        message: '没有符合条件的数据'
      }
    }
  } catch (e) {
    return {
      success: false,
      message: `删除失败: ${e.message}`
    }
  }
}
