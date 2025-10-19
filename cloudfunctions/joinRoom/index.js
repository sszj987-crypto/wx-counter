/**
 * 加入房间云函数
 * 验证房间并添加用户到房间
 */
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

/**
 * 加入房间
 * @param {Object} event - 事件参数
 * @param {string} event.roomId - 房间ID
 * @param {Object} event.userInfo - 用户信息
 */
exports.main = async (event, context) => {
  console.log('加入房间云函数被调用，参数:', event)
  const { roomId, userInfo } = event
  const wxContext = cloud.getWXContext()
  console.log('微信上下文:', { OPENID: wxContext.OPENID, APPID: wxContext.APPID })
  
  try {
    // 查找房间
    console.log('查找房间，房间ID:', roomId)
    const roomResult = await db.collection('rooms').doc(roomId).get()
    
    if (!roomResult.data) {
      console.log('房间不存在')
      return {
        success: false,
        error: '房间不存在'
      }
    }

    const room = roomResult.data
    console.log('找到房间:', room)

    // 检查房间状态
    if (room.status !== 'active') {
      console.log('房间已关闭')
      return {
        success: false,
        error: '房间已关闭'
      }
    }

    // 检查房间人数限制
    if (room.players.length >= 30) {
      console.log('房间已满，当前人数:', room.players.length)
      return {
        success: false,
        error: '房间已满（最多30人）'
      }
    }

    // 检查用户是否已在房间中
    const existingPlayer = room.players.find(player => player.openId === wxContext.OPENID)
    if (existingPlayer) {
      return {
        success: true,
        message: '您已在房间中',
        roomData: room
      }
    }

    // 添加用户到房间
    const newPlayer = {
      openId: wxContext.OPENID,
      nickName: userInfo.nickName || '玩家',
      avatarUrl: userInfo.avatarUrl || '',
      score: 0,
      joinTime: new Date()
    }

    await db.collection('rooms').doc(roomId).update({
      data: {
        players: db.command.push(newPlayer)
      }
    })

    // 更新用户信息
    try {
      await db.collection('users').doc(wxContext.OPENID).set({
        data: {
          openId: wxContext.OPENID,
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl || '',
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
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl || '',
          totalGames: 0,
          totalScore: 0,
          lastActiveTime: new Date()
        }
      })
    }

    // 获取更新后的房间数据
    const updatedRoomResult = await db.collection('rooms').doc(roomId).get()

    return {
      success: true,
      message: '加入房间成功',
      roomData: updatedRoomResult.data
    }
  } catch (error) {
    console.error('加入房间失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
