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

        // 检查房费配置
        const roomFeeConfig = room.roomFeeConfig || null
        const isRoomFeeEnabled = roomFeeConfig && roomFeeConfig.enabled === true
        const roomFeePlayerIndex = isRoomFeeEnabled ? room.players.findIndex(p => p.nickName === '房费' || p.openId.startsWith('room_fee_')) : -1
        let roomFeeScoreOut = 0
        let roomFeeDirectScore = 0 // 房费玩家直接接收的分数

        for (const item of transferList) {
          const toPlayerIndex = room.players.findIndex(p => p.openId === item.toPlayerOpenId)
          if (toPlayerIndex === -1) {
            throw new Error(`玩家 ${item.toPlayerOpenId} 不在该房间中`)
          }
          if (fromPlayerIndex === toPlayerIndex) {
            continue // 跳过给自己加分
          }

          let delta = Number(item.score)
          if (!Number.isFinite(delta) || delta <= 0) {
            continue
          }

          // 房费抽水逻辑（给房费玩家转钱不抽水）
          let roomFeeDeduction = 0
          if (isRoomFeeEnabled && roomFeePlayerIndex !== -1 && toPlayerIndex !== roomFeePlayerIndex) {
            const currentRoomFeeScore = room.players[roomFeePlayerIndex].score || 0
            const roomFeeRemaining = roomFeeConfig.total - currentRoomFeeScore - roomFeeScoreOut
            
            if (delta >= roomFeeConfig.fullX && roomFeeRemaining > 0) {
              // 每满X抽Y
              const fullCount = Math.floor(delta / roomFeeConfig.fullX)
              const totalDeduction = fullCount * roomFeeConfig.drawY
              // 不能超过剩余房费
              roomFeeDeduction = Math.min(totalDeduction, roomFeeRemaining)
              delta = delta - roomFeeDeduction
              roomFeeScoreOut += roomFeeDeduction
            }
          }

          totalScoreOut += delta + roomFeeDeduction

          // 记录每笔转账记录
          newRecords.push({
            fromPlayerOpenId: wxContext.OPENID,
            toPlayerOpenId: item.toPlayerOpenId,
            score: delta,
            fromPlayerNickName: room.players[fromPlayerIndex].nickName,
            toPlayerNickName: room.players[toPlayerIndex].nickName,
            createTime: new Date()
          })

          // 如果有房费扣除，记录房费记录
          if (roomFeeDeduction > 0 && roomFeePlayerIndex !== -1) {
            newRecords.push({
              fromPlayerOpenId: wxContext.OPENID,
              toPlayerOpenId: room.players[roomFeePlayerIndex].openId,
              score: roomFeeDeduction,
              fromPlayerNickName: room.players[fromPlayerIndex].nickName,
              toPlayerNickName: '房费',
              createTime: new Date(),
              isRoomFee: true
            })
          }

          // 累加接收方分数（房费玩家单独处理）
          if (toPlayerIndex === roomFeePlayerIndex) {
            roomFeeDirectScore += delta
          } else {
            updateData[`players.${toPlayerIndex}.score`] = _.inc(delta)
          }
        }

        if (totalScoreOut === 0) {
           throw new Error('没有有效的给分操作')
        }

        // 扣除发送方总分
        updateData[`players.${fromPlayerIndex}.score`] = _.inc(-totalScoreOut)

        // 统一更新房费玩家分数（直接接收 + 抽水）
        if (roomFeePlayerIndex !== -1 && (roomFeeDirectScore > 0 || roomFeeScoreOut > 0)) {
          updateData[`players.${roomFeePlayerIndex}.score`] = _.inc(roomFeeDirectScore + roomFeeScoreOut)
        }

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
