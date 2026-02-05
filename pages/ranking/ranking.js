/**
 * 排行榜页面逻辑
 * 显示用户胜率和净胜分排行榜
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    sortType: 'winRate', // winRate 或 netScore
    rankingList: [],
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.loadRankingData()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据
    this.loadRankingData()
  },

  /**
   * 加载排行榜数据 - 显示当前用户自己及所有gamemate数据
   */
  async loadRankingData() {
    try {
      this.setData({ loading: true })
      
      const db = wx.cloud.database()
      
      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const currentOpenId = userInfoResult.openId
      
      // 获取当前用户的gamemate数据
      const currentUserDoc = await db.collection('users').doc(currentOpenId).get()
      const currentUserData = currentUserDoc.data || {}
      const gamemates = currentUserData.gamemate || []
      
      
      // 如果没有任何gamemate数据，至少显示当前用户自己
      const allUsersForRanking = []
      
      // 计算当前用户的统计数据
      const currentUserStats = this.calculateUserStats(currentUserData.gamedata || [])
      
      // 首先添加当前用户自己
      allUsersForRanking.push({
        openId: currentOpenId,
        isCurrentUser: true, // 标记为当前用户
        nickName: currentUserData.nickName || '我',
        avatarUrl: currentUserData.avatarUrl || '/images/default-avatar.png',
        totalGames: currentUserStats.totalGames,
        totalScore: currentUserStats.totalScore,
        wins: currentUserStats.wins,
        losses: currentUserStats.losses,
        draws: currentUserStats.draws,
        winRate: currentUserStats.winRate,
        winRateDisplay: ((currentUserStats.winRate) * 100).toFixed(1) + '%',
        netScore: currentUserStats.netScore,
        gameCount: 0, // 自己与自己不对局
        hasData: !!currentUserData.nickName // 标记是否有真实数据
      })
      
      // 如果有gamemate用户，添加gamemate用户数据
      if (gamemates.length > 0) {
        // 获取所有gamemate用户的openId
        const gamemateOpenIds = gamemates.map(g => g.openId)
        
        // 查询存在的用户数据（包含当前用户和所有gamemate用户）
        const result = await db.collection('users')
          .where({
            _openid: db.command.in([currentOpenId, ...gamemateOpenIds])
          })
          .field({
            _openid: true,
            nickName: true,
            avatarUrl: true,
            gamedata: true, // 包含游戏记录数据
            statistics: true, // 包含统计数据
            gamemate: true // 包含队友信息
          })
          .get()

        
        // 为每个gamemate用户创建排行榜数据
        gamemates.forEach(gamemate => {
          // 查找对应的用户数据
          const userData = result.data.find(u => u._openid === gamemate.openId)
          
          if (userData) {
            // 计算用户的统计数据
            const userStats = this.calculateUserStats(userData.gamedata || [], userData.statistics || {})
            
            // 如果用户存在，使用真实数据
            allUsersForRanking.push({
              openId: gamemate.openId,
              isCurrentUser: false,
              nickName: userData.nickName || '玩家',
              avatarUrl: userData.avatarUrl || '/images/default-avatar.png',
              totalGames: userStats.totalGames,
              totalScore: userStats.totalScore,
              wins: userStats.wins,
              losses: userStats.losses,
              draws: userStats.draws,
              winRate: userStats.winRate,
              winRateDisplay: ((userStats.winRate) * 100).toFixed(1) + '%',
              netScore: userStats.netScore,
              gameCount: gamemate.gameCount || 0,
              hasData: true
            })
          } else {
            // 如果用户不存在，使用默认数据
            allUsersForRanking.push({
              openId: gamemate.openId,
              isCurrentUser: false,
              nickName: gamemate.nickName || '玩家',
              avatarUrl: '/images/default-avatar.png',
              totalGames: 0,
              totalScore: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              winRate: 0,
              winRateDisplay: '0.0%',
              netScore: 0,
              gameCount: gamemate.gameCount || 0,
              hasData: false
            })
          }
        })
      }
      
      
      this.setData({ rankingList: allUsersForRanking })
      this.sortRanking() // 默认按胜率排序
    } catch (error) {
      console.error('加载排行榜数据失败:', error)
      wx.showToast({
        title: '加载排行榜失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 切换排序类型
   */
  changeSortType(e) {
    const sortType = e.currentTarget.dataset.type
    if (sortType !== this.data.sortType) {
      this.setData({ sortType })
      this.sortRanking()
    }
  },

  /**
   * 对排行榜进行排序
   */
  sortRanking() {
    const { rankingList, sortType } = this.data
    
    const sortedList = [...rankingList].sort((a, b) => {
      if (sortType === 'winRate') {
        // 按胜率排序（降序），胜率相同时按净胜分排序
        if (b.winRate !== a.winRate) {
          return b.winRate - a.winRate
        } else {
          return b.netScore - a.netScore
        }
      } else {
        // 按净胜分排序（降序），净胜分相同时按胜率排序
        if (b.netScore !== a.netScore) {
          return b.netScore - a.netScore
        } else {
          return b.winRate - a.winRate
        }
      }
    })
    
    this.setData({ rankingList: sortedList })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '查看可乐计分器排行榜',
      path: '/pages/ranking/ranking',
      imageUrl: '/images/小程序码.jpg'
    }
  },

  /**
   * 计算用户的统计数据
   * @param {Array} gamedata 用户的游戏数据数组
   * @param {Object} statistics 用户的统计数据对象
   * @returns {Object} 统计数据对象
   */
  calculateUserStats(gamedata, statistics) {
    // 优先使用顶层的statistics字段（新数据结构）
    if (statistics && typeof statistics === 'object') {
      const wins = statistics.wins || 0
      const losses = statistics.losses || 0
      const effectiveGames = wins + losses
      return {
        totalGames: statistics.totalGames || 0,
        totalScore: statistics.totalScore || 0,
        wins: wins,
        losses: losses,
        draws: statistics.draws || 0,
        winRate: effectiveGames > 0 ? wins / effectiveGames : 0,
        netScore: statistics.netScore || 0
      }
    }
    
    // 兼容旧数据结构（数组格式）
    let totalGames = 0
    let totalScore = 0
    let wins = 0
    let losses = 0
    let draws = 0
    
    // 遍历用户的所有游戏记录
    gamedata.forEach(game => {
      // 新的gamedata记录不包含statistics字段，统计数据从根级别的statistics获取
      // 兼容更旧的数据结构（如果存在）
      totalGames += 1
      totalScore += game.myScore || 0
      if (game.myScore > 0) wins++
      else if (game.myScore < 0) losses++
      else draws++
    })
    
    // 计算胜率（剔除得分为0的记录）
    const effectiveGames = wins + losses
    const winRate = effectiveGames > 0 ? wins / effectiveGames : 0
    // 计算净胜分
    const netScore = totalScore
    
    return {
      totalGames,
      totalScore,
      wins,
      losses,
      draws,
      winRate,
      netScore
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '查看可乐计分器排行榜',
      imageUrl: '/images/小程序码.jpg'
    }
  }
})
