const test = require('node:test')
const assert = require('node:assert/strict')

test('leaving a room closes the watch and keeps member and balance untouched', async () => {
  let pageDefinition
  let writes = 0
  let closed = false
  let route = ''
  const previousWx = global.wx
  const previousPage = global.Page
  global.wx = {
    cloud: { database: () => ({ command: {}, collection: () => {
      writes++
      throw new Error('exit must not access database')
    } }) },
    showModal: options => options.success({ confirm: true }),
    switchTab: options => { route = options.url }
  }
  global.Page = definition => { pageDefinition = definition }
  try {
    delete require.cache[require.resolve('../pages/room/room.js')]
    require('../pages/room/room.js')
    const page = { data: { roomId: 'r1', roomData: { players: [{ openId: 'alice', score: 10 }] } },
      setData(update) { Object.assign(this.data, update) },
      watcher: { close() { closed = true } } }
    await pageDefinition.exitRoom.call(page)
    assert.equal(writes, 0)
    assert.equal(closed, true)
    assert.equal(route, '/pages/home/home')
    assert.equal(page.data.roomData.players[0].score, 10)
  } finally {
    global.wx = previousWx
    global.Page = previousPage
  }
})

test('successful transfer waits for watch and only rereads after timeout', () => {
  let pageDefinition
  const previousWx = global.wx
  const previousPage = global.Page
  const previousTimeout = global.setTimeout
  let callback
  global.wx = { cloud: { database: () => ({ command: {} }) } }
  global.Page = definition => { pageDefinition = definition }
  global.setTimeout = work => { callback = work; return 1 }
  try {
    delete require.cache[require.resolve('../pages/room/room.js')]
    require('../pages/room/room.js')
    let reads = 0
    const page = { data: { roomData: { version: 1 } },
      refreshRoomData() { reads++ } }
    pageDefinition.refreshRoomDataAfterTransfer.call(page, 2)
    assert.equal(reads, 0)
    page.data.roomData.version = 2
    callback()
    assert.equal(reads, 0)
    pageDefinition.refreshRoomDataAfterTransfer.call(page, 3)
    callback()
    assert.equal(reads, 1)
  } finally {
    global.wx = previousWx
    global.Page = previousPage
    global.setTimeout = previousTimeout
  }
})
