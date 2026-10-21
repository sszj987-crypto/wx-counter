const crypto = require('crypto')
const { MAX_PLAYERS, fail, validId, realPlayers, assertActiveMember } = require('./core')
const { optionalDocument, isWriteConflict } = require('./score')

const emptyStats = () => ({ totalGames: 0, wins: 0, losses: 0, draws: 0,
  totalScoreHundredths: 0, netScoreHundredths: 0, winRate: 0 })

function newRoom(roomId, openId, profile, now) {
  return {
    _id: roomId,
    creatorOpenId: openId,
    roomNumber: Math.floor(Math.random() * 9000) + 1000,
    status: 'active', createTime: now, updatedAt: now,
    memberOpenIds: [openId],
    players: [{ openId, nickName: profile.nickName || '玩家',
      avatarUrl: profile.avatarUrl || '/images/default-avatar.png', score: 0, joinTime: now }],
    roomFeeConfig: { enabled: false, total: 100, fullX: 10, drawY: 1 },
    transferCount: 0, version: 0, settlement: null
  }
}

function buildJoinedRoom(room, openId, profile, now) {
  if (!room || room.status !== 'active') fail('房间不存在或已结算')
  if (room.memberOpenIds.includes(openId)) return room
  if (realPlayers(room).length >= MAX_PLAYERS) fail('房间已满（最多30人）')
  return {
    ...room, updatedAt: now,
    memberOpenIds: [...room.memberOpenIds, openId],
    players: [...room.players, { openId, nickName: profile.nickName || '玩家',
      avatarUrl: profile.avatarUrl || '/images/default-avatar.png', score: 0, joinTime: now }]
  }
}

function buildFeeRoom(room, openId, config) {
  assertActiveMember(room, openId)
  const { enabled, total, fullX, drawY } = config
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(total) || total < 1 ||
      !Number.isSafeInteger(fullX) || fullX < 1 ||
      !Number.isSafeInteger(drawY) || drawY < 0 || drawY > fullX) fail('房费配置无效')
  const feeId = `room_fee_${room._id}`
  const fee = room.players.find(player => player.openId === feeId)
  if (fee && fee.score > total) fail('房费总额不能低于已收房费')
  return {
    ...room,
    roomFeeConfig: { enabled, total, fullX, drawY },
    players: enabled && !fee
      ? [...room.players, { openId: feeId, nickName: '房费', avatarUrl: '', score: 0, joinTime: new Date() }]
      : room.players
  }
}

function validProfile(event) {
  const nickName = String(event.nickName || '').trim()
  const avatarUrl = String(event.avatarUrl || '')
  if (!nickName || nickName.length > 30 || avatarUrl.length > 1000) fail('用户资料无效')
  return { nickName, avatarUrl }
}

function createRoomService(db) {
  async function transactionWork(work) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const tx = await db.startTransaction()
      try {
        const result = await work(tx)
        await tx.commit()
        return result
      } catch (error) {
        try { await tx.rollback() } catch (_) {}
        if (!isWriteConflict(error) || attempt === 2) throw error
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 100))
      }
    }
  }

  return {
    async createRoom(event, openId) {
      validId(openId, '用户ID')
      const roomId = crypto.randomBytes(12).toString('hex')
      return transactionWork(async tx => {
        const user = await optionalDocument(tx.collection('users'), openId)
        const activeCreatedRoomIds = Array.isArray(user?.activeCreatedRoomIds) ? user.activeCreatedRoomIds : []
        if (activeCreatedRoomIds.length >= 2) fail('您已创建了2个房间，请先结算之前的房间')
        const now = new Date()
        const profile = user || { nickName: event.nickName || '玩家', avatarUrl: event.avatarUrl || '' }
        const room = newRoom(roomId, openId, profile, now)
        await tx.collection('rooms').add({ data: room })
        if (user) {
          await tx.collection('users').doc(openId).update({ data: {
            activeCreatedRoomIds: [...activeCreatedRoomIds, roomId], lastActiveTime: now
          } })
        } else {
          await tx.collection('users').add({ data: {
            _id: openId, openId, nickName: profile.nickName, avatarUrl: profile.avatarUrl,
            gamemate: [], statistics: emptyStats(), activeCreatedRoomIds: [roomId],
            createdAt: now, lastActiveTime: now
          } })
        }
        return { success: true, room }
      })
    },

    async joinRoom(event, openId) {
      const roomId = validId(event.roomId, '房间ID')
      validId(openId, '用户ID')
      return transactionWork(async tx => {
        const room = await optionalDocument(tx.collection('rooms'), roomId)
        if (!room) fail('房间不存在')
        if (room.status !== 'active') {
          if (!room.memberOpenIds.includes(openId)) fail('无权查看已结算房间')
          return { success: true, room }
        }
        if (room.memberOpenIds.includes(openId)) return { success: true, room }
        const user = await optionalDocument(tx.collection('users'), openId)
        const now = new Date()
        const profile = user || { nickName: event.nickName || '玩家', avatarUrl: event.avatarUrl || '' }
        const joined = buildJoinedRoom(room, openId, profile, now)
        await tx.collection('rooms').doc(roomId).update({ data: {
          players: joined.players, memberOpenIds: joined.memberOpenIds, updatedAt: now
        } })
        if (!user) await tx.collection('users').add({ data: {
          _id: openId, openId, nickName: profile.nickName, avatarUrl: profile.avatarUrl,
          gamemate: [], statistics: emptyStats(), activeCreatedRoomIds: [],
          createdAt: now, lastActiveTime: now
        } })
        return { success: true, room: joined }
      })
    },

    async updateRoomFeeConfig(event, openId) {
      const roomId = validId(event.roomId, '房间ID')
      return transactionWork(async tx => {
        const room = await optionalDocument(tx.collection('rooms'), roomId)
        const updated = buildFeeRoom(room, openId, event)
        await tx.collection('rooms').doc(roomId).update({ data: {
          players: updated.players, roomFeeConfig: updated.roomFeeConfig, updatedAt: new Date()
        } })
        return { success: true, room: updated }
      })
    },

    async updateProfile(event, openId) {
      validId(openId, '用户ID')
      const profile = validProfile(event)
      const now = new Date()
      const user = await optionalDocument(db.collection('users'), openId)
      if (user) await db.collection('users').doc(openId).update({ data: {
        ...profile, largeTextEnabled: !!event.largeTextEnabled, lastActiveTime: now
      } })
      else await db.collection('users').add({ data: {
        _id: openId, openId, ...profile, gamemate: [], statistics: emptyStats(),
        activeCreatedRoomIds: [], largeTextEnabled: !!event.largeTextEnabled,
        createdAt: now, lastActiveTime: now
      } })
      // Member profiles are display data; each room is rechecked before updating.
      let skip = 0
      while (true) {
        const batch = await db.collection('rooms').where({ memberOpenIds: openId, status: 'active' })
          .skip(skip).limit(50).get()
        for (const listed of batch.data || []) {
          await transactionWork(async tx => {
            const room = await optionalDocument(tx.collection('rooms'), listed._id)
            if (!room || room.status !== 'active' || !room.memberOpenIds.includes(openId)) return
            const players = room.players.map(player => player.openId === openId ? { ...player, ...profile } : player)
            await tx.collection('rooms').doc(room._id).update({ data: { players, updatedAt: now } })
          })
        }
        if (!batch.data || batch.data.length < 50) break
        skip += batch.data.length
      }
      return { success: true, profile }
    }
  }
}

module.exports = { emptyStats, newRoom, buildJoinedRoom, buildFeeRoom, createRoomService }
