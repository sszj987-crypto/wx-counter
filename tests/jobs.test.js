const test = require('node:test')
const assert = require('node:assert/strict')
const { scanRooms } = require('../cloudfunctions/counterService/jobs')

test('timeout scan resumes after the last visited failing room', async () => {
  const rooms = [
    { _id: 'old', status: 'settling', createTime: new Date('2026-01-01') },
    { _id: 'new', status: 'settling', createTime: new Date('2026-01-02') }
  ]
  let savedCursor = null
  let now = 0
  const originalNow = Date.now
  Date.now = () => now
  const db = {
    command: {
      and: parts => ({ and: parts }),
      or: parts => ({ or: parts }),
      gt: value => ({ gt: value }),
      lt: value => ({ lt: value })
    },
    collection(name) {
      if (name === 'counter_job_state') return {
        doc: () => ({
          get: async () => savedCursor === undefined ? { data: null } : { data: { cursor: savedCursor } },
          set: async ({ data }) => { savedCursor = data.cursor }
        })
      }
      return {
        where(condition) {
          const cursorTime = condition.and?.[1]?.or?.[0]?.createTime?.gt
          const cursorId = condition.and?.[1]?.or?.[1]?._id?.gt
          const matches = rooms.filter(room => !cursorTime || room.createTime > cursorTime ||
            (room.createTime.getTime() === cursorTime.getTime() && room._id > cursorId))
          return { orderBy() { return this }, limit() { return this }, get: async () => ({ data: matches }) }
        }
      }
    }
  }
  const visited = []
  try {
    const visit = async room => {
      visited.push(room._id)
      if (room._id === 'old') {
        now += 26
        throw new Error('temporary failure')
      }
    }
    const first = await scanRooms(db, 'settling', null, visit, now + 25)
    assert.equal(first.failures.length, 1)
    assert.deepEqual(savedCursor, { time: rooms[0].createTime, id: 'old' })
    await scanRooms(db, 'settling', null, visit, now + 25)
    assert.deepEqual(visited, ['old', 'new'])
    assert.equal(savedCursor, null)
  } finally {
    Date.now = originalNow
  }
})
