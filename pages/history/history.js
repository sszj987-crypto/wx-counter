/**
 * 历史结算页面逻辑
 * 按时间倒序显示历史结算数据
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    stats: {
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      initialized: false
    },
    historySettlements: [],
    loading: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.loadHistoryData()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据
    this.loadHistoryData()
  },

  /**
   * 加载历史结算数据
   */
  async loadHistoryData() {
    try {
      this.setData({ loading: true })
      
      const db = wx.cloud.database()
      
      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfoResult.openId
      
      // 获取用户完整数据
      const userDoc = await db.collection('users').doc(openId).get()
      const userData = userDoc.data || {}
      
      // 处理统计数据
      const stats = {
        totalGames: userData.totalGames || 0,
        wins: userData.wins || 0,
        losses: userData.losses || 0,
        draws: userData.draws || 0,
        winRate: ((userData.winRate || 0) * 100).toFixed(1) + '%',
        initialized: true
      }
      
      // 获取历史结算记录
      let historySettlements = userData.historySettlements || []
      
      // 按结算时间倒序排序
      historySettlements = historySettlements.sort((a, b) => {
        const timeA = new Date(a.settlementTime).getTime()
        const timeB = new Date(b.settlementTime).getTime()
        return timeB - timeA
      })
      
      // 为每个结算记录添加格式化时间和展开状态
      historySettlements = historySettlements.map((settlement, index) => {
        // 调试输出数据结构
        console.log(`历史记录 ${index}:`, {
          hasSettlementTime: !!settlement.settlementTime,
          settlementTime: settlement.settlementTime,
          settlementTimeType: typeof settlement.settlementTime,
          roomNumber: settlement.roomNumber,
          myScore: settlement.myScore,
          myResult: settlement.myResult
        })
        
        return {
          ...settlement,
          _index: index, // 添加索引用于key
          expanded: false, // 默认不展开
          formattedTime: this.formatTime(settlement.settlementTime) // 预格式化时间
        }
      })
      
      this.setData({
        stats,
        historySettlements
      })
      
      console.log('历史结算数据加载成功', { stats, recordCount: historySettlements.length })
      
    } catch (error) {
      console.error('加载历史结算数据失败:', error)
      wx.showToast({
        title: '加载历史记录失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 格式化时间显示 - 显示完整年月日时间
   */
  formatTime(timeStr) {
    try {
      if (!timeStr) return '未知时间'
      
      const date = new Date(timeStr)
      
      // 检查日期是否有效
      if (isNaN(date.getTime())) {
        console.error('无效的时间格式:', timeStr)
        return '时间格式错误'
      }
      
      // 始终显示完整的年月日时间格式（24小时制，无秒数）
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false // 使用24小时制
      })
    } catch (error) {
      console.error('格式化时间失败:', error)
      return '时间格式错误'
    }
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '查看我的可乐计分器游戏记录',
      path: '/pages/history/history',
      imageUrl: '/images/小程序码.jpg'
    }
  },

  /**
   * 切换记录详情显示/隐藏
   */
  toggleRecordDetail(e) {
    const index = e.currentTarget.dataset.index
    const historySettlements = this.data.historySettlements
    
    // 创建副本以确保Vue数据响应
    const newHistorySettlements = [...historySettlements]
    newHistorySettlements[index] = {
      ...newHistorySettlements[index],
      expanded: !newHistorySettlements[index].expanded
    }
    
    this.setData({
      historySettlements: newHistorySettlements
    })
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '查看我的可乐计分器游戏记录',
      imageUrl: '/images/小程序码.jpg'
    }
  }
})