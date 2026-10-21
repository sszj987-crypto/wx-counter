const { createSettlementService } = require('./settlement')
const { optionalDocument } = require('./score')

async function scanRooms(db, status, cutoff, visit, deadline) {
  const _ = db.command
  const state = db.collection('counter_job_state').doc(status)
  const saved = await optionalDocument(db.collection('counter_job_state'), status)
  let cursor = saved?.cursor || null
  let scanned = 0
  const failures = []
  while (Date.now() < deadline) {
    const base = { status }
    if (cutoff) base.createTime = _.lt(cutoff)
    const where = cursor
      ? _.and([base, _.or([
        { createTime: _.gt(cursor.time) },
        { createTime: cursor.time, _id: _.gt(cursor.id) }
      ])]) : base
    const result = await db.collection('rooms').where(where)
      .orderBy('createTime', 'asc').orderBy('_id', 'asc').limit(50).get()
    const rooms = result.data || []
    if (!rooms.length) {
      // The next invocation starts at the beginning, including rooms that failed earlier.
      await state.set({ data: { cursor: null } })
      break
    }
    let processedAll = true
    for (const room of rooms) {
      if (Date.now() >= deadline) {
        processedAll = false
        break
      }
      try {
        const outcome = await visit(room)
        if (outcome?.success === false) failures.push({ roomId: room._id, reason: outcome.failures })
      } catch (error) {
        failures.push({ roomId: room._id, reason: error.message })
      }
      scanned++
      cursor = { time: room.createTime, id: room._id }
      // Persist the last room actually visited, even when its processing failed.
      await state.set({ data: { cursor } })
    }
    if (!processedAll) break
    if (rooms.length < 50) {
      await state.set({ data: { cursor: null } })
      break
    }
  }
  return { scanned, failures }
}

function createJobs(db) {
  const settlement = createSettlementService(db)

  return {
    async processSettlements() {
      const started = Date.now()
      const deadline = started + 45000
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      // Finish frozen rooms first so a large expired-room backlog cannot delay history.
      const settling = await scanRooms(db, 'settling', null, room => settlement.processRoom(room._id), started + 25000)
      const expired = await scanRooms(db, 'active', cutoff, room => settlement.freezeExpired(room._id), deadline)
      return { success: true, expired, settling }
    }
  }
}

module.exports = { createJobs, scanRooms }
