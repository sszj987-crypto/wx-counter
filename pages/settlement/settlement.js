// settlement.js
Page({
  data: {
    roomId: '',
    roomName: '',
    players: [],
    rate: 1
  },

  onLoad(options) {
    console.log('结算页面加载，参数:', options)
    try {
      const decodedData = decodeURIComponent(options.data || '')
      const { roomId, roomName, players, rate } = JSON.parse(decodedData || '{}')
    
      if (!roomId || !players || !Array.isArray(players)) {
        wx.showToast({
          title: '结算信息错误',
          icon: 'error'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }

      // 计算倍率分并排序（按倍率分降序）
      const playersWithRateScore = players.map(player => ({
        ...player,
        rateScore: Math.round(player.score * rate)
      })).sort((a, b) => b.rateScore - a.rateScore)

      this.setData({
        roomId: roomId,
        roomName: roomName || '房间',
        players: playersWithRateScore,
        rate: rate || 1
      })
    } catch (error) {
      console.error('解析结算数据失败:', error)
      wx.showToast({
        title: '数据解析失败',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  }
})