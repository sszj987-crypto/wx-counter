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
    if (!score || score <= 0) {
      return { success: false, error: '分数必须大于0' }
    }

    let attempt = 0
    const maxAttempts = 3
    while (attempt < maxAttempts) {
      attempt++
      const transaction = await db.startTransaction()
      try {
        const roomResult = await transaction.collection('rooms').doc(roomId).get()
        const room = roomResult.data
        if (!room) {
          throw new Error('房间不存在')
        }

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

        const delta = Number(score)
        if (!Number.isFinite(delta) || delta <= 0) {
          throw new Error('分数必须大于0')
        }

        const scoreRecord = {
          fromPlayerOpenId: wxContext.OPENID,
          toPlayerOpenId: toPlayerOpenId,
          score: delta,
          fromPlayerNickName: room.players[fromPlayerIndex].nickName,
          toPlayerNickName: room.players[toPlayerIndex].nickName,
          createTime: new Date()
        }

        const updateData = {
          [`players.${fromPlayerIndex}.score`]: _.inc(-delta),
          [`players.${toPlayerIndex}.score`]: _.inc(delta)
        }
        if (!room.records) {
          updateData.records = [scoreRecord]
        } else {
          updateData.records = _.push(scoreRecord)
        }

        await transaction.collection('rooms').doc(roomId).update({ data: updateData })
        await transaction.commit()
        return { success: true, message: '计分成功' }
      } catch (err) {
        await transaction.rollback()
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 200 * attempt))
          continue
        }
        throw err
      }
    }
  } catch (error) {
    const msg = typeof error === 'object' && error && error.message ? error.message : '给分操作失败，请重试'
    console.error('计分操作失败:', msg)
    return { success: false, error: msg }
  }
}
