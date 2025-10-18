/**
 * 创建房间云函数
 * 生成唯一房间ID并初始化房间数据
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 创建房间
 * @param {Object} event - 事件参数
 * @param {string} event.roomName - 房间名称（可选）
 * @param {Object} event.creatorInfo - 创建者信息
 */
exports.main = async (event, context) => {
  const { roomName, creatorInfo } = event
  const wxContext = cloud.getWXContext()
  
  try {
    // 生成唯一房间ID
    const roomId = generateRoomId()
    
    // 房间数据
    const roomData = {
      _id: roomId,
      roomName: roomName || `房间${roomId.slice(-6)}`,
      creatorOpenId: wxContext.OPENID,
      createTime: new Date(),
      players: [{
        openId: wxContext.OPENID,
        nickName: creatorInfo.nickName || '房主',
        avatarUrl: creatorInfo.avatarUrl || '',
        score: 0,
        joinTime: new Date()
      }],
      status: 'active', // active, closed
      totalRounds: 0
    }

    // 创建房间
    await db.collection('rooms').add({
      data: roomData
    })

    // 更新用户信息
    try {
      await db.collection('users').doc(wxContext.OPENID).set({
        data: {
          openId: wxContext.OPENID,
          nickName: creatorInfo.nickName || '用户',
          avatarUrl: creatorInfo.avatarUrl || '',
          totalGames: 0,
          totalScore: 0,
          lastActiveTime: new Date()
        }
      })
    } catch (error) {
      // 如果用户不存在则创建
      await db.collection('users').add({
        data: {
          _id: wxContext.OPENID,
          openId: wxContext.OPENID,
          nickName: creatorInfo.nickName || '用户',
          avatarUrl: creatorInfo.avatarUrl || '',
          totalGames: 0,
          totalScore: 0,
          lastActiveTime: new Date()
        }
      })
    }

    return {
      success: true,
      roomId: roomId,
      roomData: roomData
    }
  } catch (error) {
    console.error('创建房间失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 生成房间ID
 * @returns {string} 房间ID
 */
function generateRoomId() {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 6)
  return `${timestamp}${random}`.toUpperCase()
}
