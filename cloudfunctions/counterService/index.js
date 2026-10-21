const cloud = require('wx-server-sdk')
const { createScoreService } = require('./score')
const { createRoomService } = require('./rooms')
const { createSettlementService } = require('./settlement')
const { createQueryService } = require('./queries')
const { createJobs } = require('./jobs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const score = createScoreService(db)
const rooms = createRoomService(db)
const settlement = createSettlementService(db)
const queries = createQueryService(db)
const jobs = createJobs(db)

const actions = {
  transferScore: score.transferScore,
  withdrawRoomFee: score.withdrawRoomFee,
  createRoom: rooms.createRoom,
  joinRoom: rooms.joinRoom,
  updateRoomFeeConfig: rooms.updateRoomFeeConfig,
  updateProfile: rooms.updateProfile,
  settleRoom: settlement.settleRoom,
  getRoomSnapshot: queries.getRoomSnapshot,
  getRoomPreview: queries.getRoomPreview,
  listScoreOperations: queries.listScoreOperations,
  listUserGameRecords: queries.listUserGameRecords,
  listActiveRooms: queries.listActiveRooms,
  getRanking: queries.getRanking
}

exports.main = async event => {
  const openId = cloud.getWXContext().OPENID
  try {
    // Timer invocations have no user identity; authenticated mini-program calls always do.
    if (!openId) return await jobs.processSettlements()
    const action = actions[event.action]
    if (!action) throw new Error('不支持的操作')
    return await action(event, openId)
  } catch (error) {
    console.error('计分服务失败:', event.action || 'timer', error)
    return { success: false, error: error.message || '操作失败' }
  }
}
