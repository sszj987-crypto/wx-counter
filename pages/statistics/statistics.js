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
    try {
      const db = wx.cloud.database()
      const openId = wx.getStorageSync('openid')

      // 获取用户基本信息
      const userResult = await db.collection('users').doc(openId).get()
      const userData = userResult.data || {}

      // 获取用户游戏记录
      const recordsResult = await db.collection('records')
        .where({
          fromPlayerOpenId: openId
        })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()

      // 获取用户参与的房间记录
      const roomsResult = await db.collection('rooms')
        .where({
          players: db.command.elemMatch({
            openId: openId
          })
        })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get()

      // 计算统计数据
      const stats = this.calculateStatistics(userData, recordsResult.data, roomsResult.data)

      this.setData({
        userStats: stats,
        recentGames: roomsResult.data.slice(0, 10),
        isLoading: false
      })

    } catch (error) {
      console.error('加载统计数据失败:', error)
      wx.showToast({
        title: '加载数据失败',
        icon: 'error'
      })
      this.setData({ isLoading: false })
    }
  },

  /**
   * 计算统计数据
   */
  calculateStatistics(userData, records, rooms) {
    const totalGames = rooms.length
    const totalScore = userData.totalScore || 0
    const averageScore = totalGames > 0 ? Math.round(totalScore / totalGames) : 0

    // 计算胜率（得分最高的次数 / 总游戏次数）
    let winCount = 0
    rooms.forEach(room => {
      const userPlayer = room.players.find(p => p.openId === wx.getStorageSync('openid'))
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
      const userPlayer = room.players.find(p => p.openId === wx.getStorageSync('openid'))
      if (userPlayer && userPlayer.score > bestScore) {
        bestScore = userPlayer.score
      }
    })

    return {
      totalGames,
      totalScore,
      averageScore,
      winRate,
      bestScore
    }
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
