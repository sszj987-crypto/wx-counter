/**
 * 数据统计页面
 * 展示用户游戏数据
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userStats: {
      totalGames: 0,
      totalScore: 0,
      averageScore: 0,
      winRate: 0,
      bestScore: 0
    },
    recentGames: [],
    isLoading: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.loadUserStatistics()
  },

  /**
   * 加载用户统计数据
   */
  async loadUserStatistics() {
    console.log('开始加载用户统计数据')
    try {
      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfoResult.openId
      console.log('当前用户openId:', openId)

      // 获取用户基本信息
      let userData = {}
      try {
        const userResult = await wx.cloud.database().collection('users').doc(openId).get()
        userData = userResult.data || {}
        console.log('用户基本信息:', userData)
      } catch (userError) {
        console.log('用户信息不存在，使用默认数据:', userError)
      }

      // 获取用户游戏记录
      let recordsData = []
      try {
        const recordsResult = await wx.cloud.database().collection('records')
          .where({ fromPlayerOpenId: openId })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get()
        recordsData = recordsResult.data || []
        console.log('用户游戏记录数量:', recordsData.length)
      } catch (recordsError) {
        console.log('获取游戏记录失败:', recordsError)
      }

      // 获取用户参与的房间
      let roomsData = []
      try {
        const roomsResult = await wx.cloud.database().collection('rooms')
          .where({ players: wx.cloud.database().command.elemMatch({ openId: openId }) })
          .orderBy('createTime', 'desc')
          .limit(20)
          .get()
        roomsData = roomsResult.data || []
        console.log('用户参与房间数量:', roomsData.length)
      } catch (roomsError) {
        console.log('获取房间记录失败:', roomsError)
      }

      // 计算统计数据
      const userStats = this.calculateStatistics(userData, recordsData, roomsData, openId)
      console.log('计算得到的统计数据:', userStats)

      this.setData({
        userStats: userStats,
        recentGames: roomsData.slice(0, 3), // 最多只显示3个最近游戏
        isLoading: false
      })
      console.log('统计数据加载完成')

    } catch (error) {
      console.error('加载统计数据失败:', error)
      // 只有在真正出错时才显示错误提示，而不是没有数据时
      if (error.message && !error.message.includes('not found')) {
        wx.showToast({
          title: '加载数据失败',
          icon: 'error'
        })
      }
      this.setData({ isLoading: false })
    }
  },

  /**
   * 计算统计数据
   */
  calculateStatistics(userData, records, rooms, currentUserOpenId) {
    console.log('开始计算统计数据，参数:', { userData, records, rooms, currentUserOpenId })
    
    const totalGames = rooms.length
    const totalScore = userData.totalScore || 0
    const averageScore = totalGames > 0 ? Math.round(totalScore / totalGames) : 0

    // 计算胜率（得分最高的次数 / 总游戏次数）
    let winCount = 0
    rooms.forEach(room => {
      const userPlayer = room.players.find(p => p.openId === currentUserOpenId)
      if (userPlayer) {
        const maxScore = Math.max(...room.players.map(p => p.score))
        if (userPlayer.score === maxScore && maxScore > 0) {
          winCount++
        }
      }
    })
    const winRate = totalGames > 0 ? Math.round((winCount / totalGames) * 100) : 0

    // 计算最高分
    let bestScore = 0
    rooms.forEach(room => {
      const userPlayer = room.players.find(p => p.openId === currentUserOpenId)
      if (userPlayer && userPlayer.score > bestScore) {
        bestScore = userPlayer.score
      }
    })

    const result = {
      totalGames,
      totalScore,
      averageScore,
      winRate,
      bestScore
    }
    
    console.log('统计数据计算结果:', result)
    return result
  },

  /**
   * 刷新数据
   */
  async onRefresh() {
    this.setData({ isLoading: true })
    await this.loadUserStatistics()
    wx.stopPullDownRefresh()
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '我的游戏数据统计',
      path: '/pages/home/home'
    }
  }
})
