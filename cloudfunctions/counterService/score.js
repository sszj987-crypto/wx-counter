const {
  fail, normalizeTransferRequest, normalizeWithdrawal,
  requestHash, applyTransfer, applyFeeWithdrawal
} = require('./core')

async function optionalDocument(collection, id) {
  try {
    const result = await collection.doc(id).get()
    return result && result.data ? result.data : null
  } catch (error) {
    if (/not exist|not found|文档不存在|找不到该记录/i.test(error.message || '')) return null
    throw error
  }
}

function isWriteConflict(error) {
  return /write conflict|transaction conflict|duplicate key|already exists|写冲突|重复键|DATABASE_TRANSACTION_CONFLICT|DATABASE_DUPLICATE_WRITE/i
    .test(`${error.code || ''} ${error.message || ''}`)
}

function createScoreService(db) {
  async function execute(request) {
    const hash = requestHash(request)
    const operationRef = db.collection('score_operations')
    const existingResult = operation => {
      if (!operation) return null
      if (operation.roomId !== request.roomId || operation.actorOpenId !== request.actorOpenId ||
          operation.type !== request.type || operation.requestHash !== hash) fail('操作ID与已有请求冲突')
      return { success: true, operationId: request.operationId, roomVersion: operation.roomVersion }
    }
    const existing = existingResult(await optionalDocument(operationRef, request.operationId))
    if (existing) return existing

    for (let attempt = 0; attempt < 3; attempt++) {
      const transaction = await db.startTransaction()
      try {
        const recorded = existingResult(await optionalDocument(transaction.collection('score_operations'), request.operationId))
        if (recorded) {
          await transaction.rollback()
          return recorded
        }
        const room = await optionalDocument(transaction.collection('rooms'), request.roomId)
        const result = request.type === 'transfer'
          ? applyTransfer(room, request)
          : applyFeeWithdrawal(room, request.actorOpenId, request.amount)
        const now = new Date()
        await transaction.collection('rooms').doc(request.roomId).update({ data: {
          players: result.players,
          version: result.roomVersion,
          transferCount: result.transferCount,
          updatedAt: now
        } })
        await transaction.collection('score_operations').add({ data: {
          _id: request.operationId,
          roomId: request.roomId,
          actorOpenId: request.actorOpenId,
          type: request.type,
          transfers: result.transfers,
          createdAt: now,
          roomVersion: result.roomVersion,
          requestHash: hash
        } })
        await transaction.commit()
        return { success: true, operationId: request.operationId, roomVersion: result.roomVersion,
          players: result.players, transferCount: result.transferCount }
      } catch (error) {
        try { await transaction.rollback() } catch (_) {}
        // A timed out commit may already have succeeded. Always check the same ID first.
        const committed = existingResult(await optionalDocument(operationRef, request.operationId))
        if (committed) return committed
        if (!isWriteConflict(error) || attempt === 2) throw error
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 100))
      }
    }
    fail('计分繁忙，请使用原操作ID重试')
  }

  return {
    transferScore(event, openId) { return execute(normalizeTransferRequest(event, openId)) },
    withdrawRoomFee(event, openId) { return execute(normalizeWithdrawal(event, openId)) }
  }
}

module.exports = { createScoreService, optionalDocument, isWriteConflict }
