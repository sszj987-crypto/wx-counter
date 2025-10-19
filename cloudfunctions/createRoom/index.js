/**
 * 创建房间云函数
 * 生成唯一房间ID并初始化房间数据
 */
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

/**
 * 创建房间
 * @param {Object} event - 事件参数
 * @param {string} event.roomName - 房间名称（可选）
 * @param {Object} event.creatorInfo - 创建者信息
 */
exports.main = async (event, context) => {
  console.log('创建房间云函数被调用，参数:', event)
  const { roomName, creatorInfo } = event
  const wxContext = cloud.getWXContext()
  console.log('微信上下文:', { OPENID: wxContext.OPENID, APPID: wxContext.APPID })
  
  try {
    // 生成唯一房间ID
    const roomId = generateRoomId()
    console.log('生成的房间ID:', roomId)
    
    // 生成房间编号（纯数字）
    const roomNumber = Math.floor(Math.random() * 9000) + 1000
    
    // 房间数据
    const roomData = {
      _id: roomId,
      roomName: roomName || `房间${roomNumber}`,
      roomNumber: roomNumber,
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
    console.log('房间数据:', roomData)

    // 创建房间
    console.log('开始创建房间到数据库')
    await db.collection('rooms').add({
      data: roomData
    })
    console.log('房间创建成功')

    // 更新用户信息
    console.log('开始更新用户信息')
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
      console.log('用户信息更新成功')
    } catch (error) {
      console.log('用户信息更新失败，尝试创建新用户:', error)
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
      console.log('新用户创建成功')
    }

    const result = {
      success: true,
      roomId: roomId,
      roomData: roomData
    }
    console.log('创建房间云函数执行成功，返回结果:', result)
    return result
  } catch (error) {
    console.error('创建房间失败:', error)
    const errorResult = {
      success: false,
      error: error.message
    }
    console.log('创建房间云函数执行失败，返回结果:', errorResult)
    return errorResult
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
