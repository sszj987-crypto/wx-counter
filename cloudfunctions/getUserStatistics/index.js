/**
 * 获取用户统计数据云函数
 * 处理用户游戏统计信息的查询
 */
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('getUserStatistics 云函数被调用')
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID
  console.log('用户 openId:', openId)

  try {
    // 获取用户基本信息
    let userData = {}
    try {
      const userResult = await db.collection('users').doc(openId).get()
      userData = userResult.data || {}
      console.log('用户基本信息:', userData)
    } catch (userError) {
      console.log('用户信息不存在，使用默认数据:', userError)
    }

    // 获取用户游戏记录
    let recordsData = []
    try {
      const recordsResult = await db.collection('records')
        .where({ fromPlayerOpenId: openId })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()
      recordsData = recordsResult.data || []
      console.log('用户游戏记录数量:', recordsData.length)
    } catch (recordsError) {
      console.log('获取游戏记录失败:', recordsError)
    }

    // 获取用户参与的房间
    let roomsData = []
    try {
      const roomsResult = await db.collection('rooms')
        .where({ players: db.command.elemMatch({ openId: openId }) })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()
      roomsData = roomsResult.data || []
      console.log('用户参与房间数量:', roomsData.length)
    } catch (roomsError) {
      console.log('获取房间记录失败:', roomsError)
    }

    // 计算统计数据
    const stats = calculateStatistics(userData, recordsData, roomsData, openId)
    console.log('计算得到的统计数据:', stats)

    return {
      success: true,
      userStats: stats,
      recentGames: roomsData.slice(0, 10)
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 计算用户统计数据
 * @param {Object} userData - 用户基本信息
 * @param {Array} records - 游戏记录
 * @param {Array} rooms - 参与的房间
 * @param {string} currentUserOpenId - 当前用户openId
 * @returns {Object} 统计数据
 */
function calculateStatistics(userData, records, rooms, currentUserOpenId) {
  console.log('开始计算统计数据，参数:', { userData, records, rooms, currentUserOpenId })
  
  // 总游戏数
  const totalGames = rooms.length
  
  // 总得分
  const totalScore = userData.totalScore || 0
  
  // 平均得分
  const averageScore = totalGames > 0 ? Math.round(totalScore / totalGames) : 0
  
  // 计算胜率
  let winCount = 0
  rooms.forEach(room => {
    const userPlayer = room.players.find(p => p.openId === currentUserOpenId)
    if (userPlayer) {
      const maxScore = Math.max(...room.players.map(p => p.score))
      if (userPlayer.score === maxScore && maxScore > 0) {
        winCount++
      }
    }
  })
  const winRate = totalGames > 0 ? Math.round((winCount / totalGames) * 100) : 0
  
  // 最高得分
  let bestScore = 0
  rooms.forEach(room => {
    const userPlayer = room.players.find(p => p.openId === currentUserOpenId)
    if (userPlayer && userPlayer.score > bestScore) {
      bestScore = userPlayer.score
    }
  })
  
  const result = {
    totalGames,
    totalScore,
    averageScore,
    winRate,
    bestScore
  }
  
  console.log('统计数据计算结果:', result)
  return result
}
