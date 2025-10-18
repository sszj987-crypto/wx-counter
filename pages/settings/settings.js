/**
 * 设置页面逻辑
 * 提供各种设置和功能入口
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.getUserInfo()
  },

  /**
   * 获取用户信息
   */
  getUserInfo() {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    this.setData({
      userInfo: {
        nickName: userInfo.nickName || '玩家',
        avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
      }
    })
  },

  /**
   * 跳转到个人资料页面
   */
  goToProfile() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    })
  },

  /**
   * 跳转到数据统计页面
   */
  goToStatistics() {
    wx.navigateTo({
      url: '/pages/statistics/statistics'
    })
  },

  /**
   * 跳转到使用说明页面
   */
  goToHelp() {
    wx.navigateTo({
      url: '/pages/help/help'
    })
  },

  /**
   * 跳转到建议反馈页面
   */
  goToFeedback() {
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '多人计分小程序 - 实时同步，简单易用',
      path: '/pages/home/home',
      imageUrl: '/images/share-banner.png'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '多人计分小程序 - 实时同步，简单易用',
      imageUrl: '/images/share-banner.png'
    }
  }
})
