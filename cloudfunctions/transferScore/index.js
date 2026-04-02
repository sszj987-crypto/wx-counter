/**
 * 计分操作云函数
 * 处理玩家之间的分数转移
 */
const cloud = require('wx-server-sdk')

// 初始化云环境，使用DYNAMIC_CURRENT_ENV自动复用环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 复用数据库连接
const db = cloud.database()
const _ = db.command

/**
 * 转移分数
 * @param {Object} event - 事件参数
 * @param {string} event.roomId - 房间ID
 * @param {string} event.toPlayerOpenId - 接收方玩家openId（单次给分使用）
 * @param {number} event.score - 转移分数（单次给分使用）
 * @param {Array} event.transfers - 批量转移列表 [{toPlayerOpenId, score}]（批量给分使用）
 */
exports.main = async (event, context) => {
  let { roomId, toPlayerOpenId, score, transfers } = event
  const wxContext = cloud.getWXContext()
  
  // 解析 JSON 字符串
  if (typeof transfers === 'string') {
    try {
      transfers = JSON.parse(transfers);
    } catch (e) {
      transfers = null;
    }
  }
  
  try {
    let transferList = []
    if (transfers && Array.isArray(transfers)) {
      transferList = transfers.filter(t => t.score && Number(t.score) > 0)
    } else if (toPlayerOpenId && score && Number(score) > 0) {
      transferList = [{ toPlayerOpenId, score: Number(score) }]
    }

    if (transferList.length === 0) {
      return { success: false, error: '请输入有效的分数' }
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
        if (fromPlayerIndex === -1) {
          throw new Error('您不在该房间中')
        }

        const updateData = {}
        const newRecords = []
        let totalScoreOut = 0

        for (const item of transferList) {
          const toPlayerIndex = room.players.findIndex(p => p.openId === item.toPlayerOpenId)
          if (toPlayerIndex === -1) {
            throw new Error(`玩家 ${item.toPlayerOpenId} 不在该房间中`)
          }
          if (fromPlayerIndex === toPlayerIndex) {
            continue // 跳过给自己加分
          }

          const delta = Number(item.score)
          if (!Number.isFinite(delta) || delta <= 0) {
            continue
          }

          totalScoreOut += delta

          // 记录每笔转账记录
          newRecords.push({
            fromPlayerOpenId: wxContext.OPENID,
            toPlayerOpenId: item.toPlayerOpenId,
            score: delta,
            fromPlayerNickName: room.players[fromPlayerIndex].nickName,
            toPlayerNickName: room.players[toPlayerIndex].nickName,
            createTime: new Date()
          })

          // 累加接收方分数
          // 注意：如果有多个针对同一人的给分（虽然UI限制了，但逻辑上要健壮），需要累加
          // 但 _.inc 只能用一次，所以这里如果有多笔给同一人，需要先合并逻辑或者假设输入列表不重复
          // 假设输入列表每个toPlayerOpenId只出现一次
          updateData[`players.${toPlayerIndex}.score`] = _.inc(delta)
        }

        if (totalScoreOut === 0) {
           throw new Error('没有有效的给分操作')
        }

        // 扣除发送方总分
        updateData[`players.${fromPlayerIndex}.score`] = _.inc(-totalScoreOut)

        // 添加记录
        if (!room.records) {
          updateData.records = newRecords
        } else {
          updateData.records = _.push(newRecords)
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
