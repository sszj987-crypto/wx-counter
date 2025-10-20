/**
 * 设置页面逻辑
 * 提供各种设置和功能入口
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: null,
    showQrcode: false,
    qrcodeUrl: '/images/小程序码.jpg'
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
   * 点击分享按钮显示小程序码
   */
  onShareTap() {
    // 显示小程序码弹窗
    this.setData({
      showQrcode: true
    })
    
    // 同时打开原生分享菜单选项
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },
  
  /**
   * 关闭小程序码弹窗
   */
  closeQrcode() {
    this.setData({
      showQrcode: false
    })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '可乐计分器小程序 - 实时同步，简单易用',
      path: '/pages/home/home',
      imageUrl: '/images/share-banner.png'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '可乐计分器小程序 - 实时同步，简单易用',
      imageUrl: '/images/share-banner.png'
    }
  }
})
