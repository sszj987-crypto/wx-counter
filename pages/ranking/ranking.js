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
      console.log('当前用户OpenId:', currentOpenId)
      
      // 获取当前用户的gamemate数据
      const currentUserDoc = await db.collection('users').doc(currentOpenId).get()
      const currentUserData = currentUserDoc.data || {}
      const gamemates = currentUserData.gamemate || []
      
      console.log('当前用户的gamemate数据:', gamemates)
      
      // 如果没有任何gamemate数据，至少显示当前用户自己
      const allUsersForRanking = []
      
      // 首先添加当前用户自己
      allUsersForRanking.push({
        openId: currentOpenId,
        isCurrentUser: true, // 标记为当前用户
        nickName: currentUserData.nickName || '我',
        avatarUrl: currentUserData.avatarUrl || '/images/default-avatar.png',
        totalGames: currentUserData.totalGames || 0,
        totalScore: currentUserData.totalScore || 0,
        wins: currentUserData.wins || 0,
        losses: currentUserData.losses || 0,
        draws: currentUserData.draws || 0,
        winRate: currentUserData.winRate || 0,
        winRateDisplay: ((currentUserData.winRate || 0) * 100).toFixed(1) + '%',
        netScore: currentUserData.netScore || 0,
        gameCount: 0, // 自己与自己不对局
        hasData: !!currentUserData.nickName // 标记是否有真实数据
      })
      
      // 如果有gamemate用户，添加gamemate用户数据
      if (gamemates.length > 0) {
        // 获取所有gamemate用户的openId
        const gamemateOpenIds = gamemates.map(g => g.openId)
        console.log('需要获取数据的gamemate用户ID:', gamemateOpenIds)
        
        // 查询存在的用户数据（包含当前用户和所有gamemate用户）
        const result = await db.collection('users')
          .where({
            _openid: db.command.in([currentOpenId, ...gamemateOpenIds])
          })
          .field({
            _openid: true,
            nickName: true,
            avatarUrl: true,
            totalGames: true,
            totalScore: true,
            wins: true,
            losses: true,
            draws: true,
            winRate: true,
            netScore: true
          })
          .get()

        console.log('查询到的用户数据:', result.data)
        
        // 为每个gamemate用户创建排行榜数据
        gamemates.forEach(gamemate => {
          // 查找对应的用户数据
          const userData = result.data.find(u => u._openid === gamemate.openId)
          
          if (userData) {
            // 如果用户存在，使用真实数据
            allUsersForRanking.push({
              openId: gamemate.openId,
              isCurrentUser: false,
              nickName: userData.nickName || '玩家',
              avatarUrl: userData.avatarUrl || '/images/default-avatar.png',
              totalGames: userData.totalGames || 0,
              totalScore: userData.totalScore || 0,
              wins: userData.wins || 0,
              losses: userData.losses || 0,
              draws: userData.draws || 0,
              winRate: userData.winRate || 0,
              winRateDisplay: ((userData.winRate || 0) * 100).toFixed(1) + '%',
              netScore: userData.netScore || 0,
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
      
      console.log('处理后的排行榜数据:', allUsersForRanking)
      
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
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '查看可乐计分器排行榜',
      imageUrl: '/images/小程序码.jpg'
    }
  }
})