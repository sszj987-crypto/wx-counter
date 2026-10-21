// 结算页只展示云函数冻结的快照；个人历史由定时任务逐人补齐。
const counter = require('../../utils/counter-service.js')

Page({
  data: {
    roomId: '', roomNumber: '', players: [], rate: 1,
    roomClosed: false, isCreatingNewRoom: false,
    settlementTime: '', isSyncing: false, largeTextEnabled: false
  },

  async onLoad(options) {
    this.loadLargeTextSetting()
    let roomId = options.roomId || ''
    if (!roomId && options.data) {
      try { roomId = JSON.parse(decodeURIComponent(options.data)).roomId || '' }
      catch (error) { console.error('解析结算房间ID失败:', error) }
    }
    if (!roomId) {
      this.setData({ roomClosed: true })
      wx.showToast({ title: '结算信息错误', icon: 'none' })
      return
    }
    this.setData({ roomId })
    await this.loadSettlementData()
  },

  onShow() {
    this.loadLargeTextSetting()
    if (this.data.roomId) this.loadSettlementData()
  },

  loadLargeTextSetting() {
    this.setData({ largeTextEnabled: !!wx.getStorageSync('largeTextEnabled') })
  },

  async loadSettlementData() {
    try {
      const result = await counter.call('getRoomSnapshot', { roomId: this.data.roomId })
      const room = result.room
      const rateHundredths = room.settlement?.rateHundredths || 100
      const players = (room.players || []).map(player => ({
        ...player,
        rateScore: (player.score * rateHundredths / 100).toFixed(2)
      })).sort((a, b) => Number(b.rateScore) - Number(a.rateScore))
      this.setData({
        roomNumber: room.roomNumber,
        players,
        rate: (rateHundredths / 100).toFixed(2),
        settlementTime: room.settlement?.settlementTime || '',
        isSyncing: room.status === 'settling',
        roomClosed: room.status === 'inactive'
      })
    } catch (error) {
      console.error('加载结算数据失败:', error)
      wx.showToast({ title: error.message || '加载结算失败', icon: 'none' })
    }
  },

  async startNewGame() {
    if (this.data.isCreatingNewRoom) return
    this.setData({ isCreatingNewRoom: true })
    wx.redirectTo({
      url: '/pages/room/room?mode=create',
      fail: error => {
        this.setData({ isCreatingNewRoom: false })
        wx.showToast({ title: '创建新房间失败', icon: 'none' })
        console.error(error)
      }
    })
  },

  goToHome() { wx.reLaunch({ url: '/pages/home/home' }) }
})
