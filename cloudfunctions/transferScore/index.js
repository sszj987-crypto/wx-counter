/**
 * 计分操作云函数
 * 处理玩家之间的分数转移
 */
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command

/**
 * 转移分数
 * @param {Object} event - 事件参数
 * @param {string} event.roomId - 房间ID
 * @param {string} event.toPlayerOpenId - 接收方玩家openId
 * @param {number} event.score - 转移分数
 */
exports.main = async (event, context) => {
  const { roomId, toPlayerOpenId, score } = event
  const wxContext = cloud.getWXContext()
  
  try {
    // 验证分数
    if (!score || score <= 0) {
      return {
        success: false,
        error: '分数必须大于0'
      }
    }

    // 开始事务
    const transaction = await db.startTransaction()
    
    try {
      // 获取房间信息
      const roomResult = await transaction.collection('rooms').doc(roomId).get()
      const room = roomResult.data

      if (!room) {
        throw new Error('房间不存在')
      }

      if (room.status !== 'active') {
        throw new Error('房间已关闭')
      }

      // 查找发送方和接收方玩家
      const fromPlayerIndex = room.players.findIndex(p => p.openId === wxContext.OPENID)
      const toPlayerIndex = room.players.findIndex(p => p.openId === toPlayerOpenId)

      if (fromPlayerIndex === -1) {
        throw new Error('您不在该房间中')
      }

      if (toPlayerIndex === -1) {
        throw new Error('目标玩家不在该房间中')
      }

      if (fromPlayerIndex === toPlayerIndex) {
        throw new Error('不能给自己加分')
      }

      // 更新分数
      const newPlayers = [...room.players]
      newPlayers[fromPlayerIndex].score -= score
      newPlayers[toPlayerIndex].score += score

      // 更新房间数据
      await transaction.collection('rooms').doc(roomId).update({
        data: {
          players: newPlayers,
          lastUpdateTime: new Date()
        }
      })

      // 记录计分操作
      await transaction.collection('records').add({
        data: {
          roomId: roomId,
          fromPlayerOpenId: wxContext.OPENID,
          toPlayerOpenId: toPlayerOpenId,
          score: score,
          fromPlayerNickName: room.players[fromPlayerIndex].nickName,
          toPlayerNickName: room.players[toPlayerIndex].nickName,
          createTime: new Date()
        }
      })

      // 提交事务
      await transaction.commit()

      return {
        success: true,
        message: '计分成功',
        newPlayers: newPlayers
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    console.error('计分操作失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

