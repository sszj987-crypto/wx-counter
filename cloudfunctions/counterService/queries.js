const { fail, validId } = require('./core')
const { emptyStats } = require('./rooms')
const { optionalDocument } = require('./score')

function decodeCursor(cursor) {
  if (!cursor) return null
  if (typeof cursor !== 'object' || typeof cursor.time !== 'string' ||
      !/^\d{4}-\d\d-\d\dT/.test(cursor.time) ||
      Number.isNaN(new Date(cursor.time).getTime()) ||
      typeof cursor.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor.id)) fail('分页游标无效')
  return { time: new Date(cursor.time), id: cursor.id }
}

function compareRows(a, b, timeField) {
  const timeDifference = new Date(b[timeField]).getTime() - new Date(a[timeField]).getTime()
  return timeDifference || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0)
}

function pageByCursor(rows, cursor, timeField, limit = 20) {
  const after = decodeCursor(cursor)
  const sorted = [...rows].sort((a, b) => compareRows(a, b, timeField))
    .filter(row => !after || new Date(row[timeField]).getTime() < after.time.getTime() ||
      (new Date(row[timeField]).getTime() === after.time.getTime() && row._id < after.id))
  const items = sorted.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: sorted.length > limit && last
    ? { time: new Date(last[timeField]).toISOString(), id: last._id } : null }
}

function createQueryService(db) {
  async function list(collectionName, field, idField, value, cursor) {
    const after = decodeCursor(cursor)
    const collection = db.collection(collectionName)
    const query = where => collection.where(where).orderBy(field, 'desc').orderBy('_id', 'desc').limit(21).get()
    let rows
    if (!after) {
      rows = (await query({ [idField]: value })).data || []
    } else {
      const [older, sameTime] = await Promise.all([
        query({ [idField]: value, [field]: db.command.lt(after.time) }),
        query({ [idField]: value, [field]: after.time, _id: db.command.lt(after.id) })
      ])
      rows = [...(older.data || []), ...(sameTime.data || [])]
    }
    return pageByCursor(rows, null, field, 20)
  }

  async function memberRoom(roomId, openId) {
    const room = await optionalDocument(db.collection('rooms'), validId(roomId, '房间ID'))
    if (!room || !Array.isArray(room.memberOpenIds) || !room.memberOpenIds.includes(openId)) fail('无权查看房间')
    return room
  }

  return {
    async getRoomSnapshot(event, openId) {
      return { success: true, room: await memberRoom(event.roomId, openId) }
    },
    async getRoomPreview(event) {
      const room = await optionalDocument(db.collection('rooms'), validId(event.roomId, '房间ID'))
      if (!room) fail('房间不存在')
      return { success: true, preview: { roomId: room._id, roomNumber: room.roomNumber,
        status: room.status, playerCount: (room.memberOpenIds || []).length } }
    },
    async listScoreOperations(event, openId) {
      await memberRoom(event.roomId, openId)
      return { success: true, ...await list('score_operations', 'createdAt', 'roomId', event.roomId, event.cursor) }
    },
    async listUserGameRecords(event, openId) {
      validId(openId, '用户ID')
      const [page, user, pending] = await Promise.all([
        list('user_game_records', 'settlementTime', 'openId', openId, event.cursor),
        optionalDocument(db.collection('users'), openId),
        db.collection('rooms').where({ memberOpenIds: openId, status: 'settling' }).limit(1).get()
      ])
      return { success: true, ...page, statistics: user?.statistics || emptyStats(),
        isSyncing: !!pending.data?.length }
    },
    async listActiveRooms(event, openId) {
      const result = await db.collection('rooms').where({
        memberOpenIds: openId, status: db.command.in(['active', 'settling'])
      })
        .orderBy('createTime', 'desc').limit(20).get()
      return { success: true, rooms: result.data || [] }
    },
    async getRanking(event, openId) {
      const self = await optionalDocument(db.collection('users'), openId)
      const ids = [openId, ...((self?.gamemate || []).map(entry => entry.openId))]
      const unique = [...new Set(ids)]
      const users = await Promise.all(unique.map(id => optionalDocument(db.collection('users'), id)))
      return { success: true, items: unique.map((id, index) => {
        const user = users[index] || {}
        const statistics = { ...emptyStats(), ...(user.statistics || {}) }
        statistics.winRate = statistics.totalGames ? statistics.wins / statistics.totalGames : 0
        return { openId: id, isCurrentUser: id === openId, nickName: user.nickName || '玩家',
          avatarUrl: user.avatarUrl || '/images/default-avatar.png', statistics,
          gameCount: (self?.gamemate || []).find(entry => entry.openId === id)?.gameCount || 0 }
      }) }
    }
  }
}

module.exports = { decodeCursor, pageByCursor, createQueryService }
