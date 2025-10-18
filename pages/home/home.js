/**
 * 主页面逻辑
 * 提供多人计分入口
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: null,
    hasUserInfo: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.initUserInfo()
  },

  /**
   * 初始化用户信息
   */
  async initUserInfo() {
    const app = getApp()
    
    // 检查是否已有用户信息
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
      return
    }

    // 尝试获取微信用户信息
    try {
      const userInfo = await this.getWxUserInfo()
      app.globalData.userInfo = userInfo
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true
      })
    } catch (error) {
      console.error('获取用户信息失败:', error)
      // 使用默认用户信息
      const defaultUserInfo = this.generateDefaultUserInfo()
      app.globalData.userInfo = defaultUserInfo
      this.setData({
        userInfo: defaultUserInfo,
        hasUserInfo: true
      })
    }
  },

  /**
   * 获取微信用户信息
   */
  getWxUserInfo() {
    return new Promise((resolve, reject) => {
      // 先尝试获取用户信息
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          resolve({
            nickName: res.userInfo.nickName || '玩家',
            avatarUrl: res.userInfo.avatarUrl || '/images/default-avatar.png'
          })
        },
        fail: () => {
          reject(new Error('用户拒绝授权'))
        }
      })
    })
  },

  /**
   * 生成默认用户信息
   */
  generateDefaultUserInfo() {
    return {
      nickName: '玩家',
      avatarUrl: '/images/default-avatar.png'
    }
  },

  /**
   * 生成3位随机数字
   */
  generateRandomNumber() {
    return Math.floor(Math.random() * 900) + 100
  },

  /**
   * 开始多人计分
   */
  startMultiPlayer() {
    if (!this.data.hasUserInfo) {
      wx.showToast({
        title: '正在初始化用户信息...',
        icon: 'loading'
      })
      return
    }

    wx.navigateTo({
      url: '/pages/room/room?mode=create'
    })
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '多人计分小程序',
      path: '/pages/home/home'
    }
  }
})
