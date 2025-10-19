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
    console.log('主页面加载，参数:', options)
    this.initUserInfo()
  },

  /**
   * 初始化用户信息
   */
  async initUserInfo() {
    console.log('开始初始化用户信息')
    const app = getApp()
    
    // 检查是否已有用户信息
    if (app.globalData.userInfo) {
      console.log('使用已存在的用户信息:', app.globalData.userInfo)
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
      return
    }

    // 先从数据库获取用户信息
    try {
      console.log('尝试从数据库获取用户信息')
      const dbUserInfo = await this.getUserInfoFromDB()
      if (dbUserInfo) {
        console.log('从数据库获取到用户信息:', dbUserInfo)
        app.globalData.userInfo = dbUserInfo
        this.setData({
          userInfo: dbUserInfo,
          hasUserInfo: true
        })
        return
      }
    } catch (error) {
      console.log('从数据库获取用户信息失败:', error)
    }

    // 如果数据库中没有用户信息，尝试获取微信用户信息
    try {
      console.log('尝试获取微信用户信息')
      const userInfo = await this.getWxUserInfo()
      console.log('获取到微信用户信息:', userInfo)
      app.globalData.userInfo = userInfo
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true
      })
    } catch (error) {
      console.error('获取用户信息失败:', error)
      // 使用默认用户信息
      const defaultUserInfo = this.generateDefaultUserInfo()
      console.log('使用默认用户信息:', defaultUserInfo)
      app.globalData.userInfo = defaultUserInfo
      this.setData({
        userInfo: defaultUserInfo,
        hasUserInfo: true
      })
    }
  },

  /**
   * 从数据库获取用户信息
   */
  async getUserInfoFromDB() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'getUserInfo'
      })
      console.log('从数据库获取用户信息结果:', result)
      if (result.result && result.result.success && result.result.userInfo) {
        return {
          nickName: result.result.userInfo.nickName || '玩家',
          avatarUrl: result.result.userInfo.avatarUrl || '/images/default-avatar.png'
        }
      }
      return null
    } catch (error) {
      console.error('从数据库获取用户信息失败:', error)
      return null
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
  async startMultiPlayer() {
    console.log('点击开始多人计分按钮')
    if (!this.data.hasUserInfo) {
      console.log('用户信息未初始化，显示提示')
      wx.showToast({
        title: '正在初始化用户信息...',
        icon: 'loading'
      })
      return
    }

    try {
      // 检查是否有活跃的房间
      const activeRoom = await this.checkActiveRoom()
      if (activeRoom) {
        console.log('找到活跃房间，直接进入:', activeRoom._id)
        wx.navigateTo({
          url: `/pages/room/room?roomId=${activeRoom._id}`
        })
      } else {
        console.log('没有活跃房间，创建新房间')
        wx.navigateTo({
          url: '/pages/room/room?mode=create'
        })
      }
    } catch (error) {
      console.error('检查房间状态失败:', error)
      // 出错时默认创建新房间
      wx.navigateTo({
        url: '/pages/room/room?mode=create'
      })
    }
  },

  /**
   * 检查是否有活跃的房间
   */
  async checkActiveRoom() {
    try {
      console.log('开始检查活跃房间')
      // 调用云函数来检查活跃房间
      const result = await wx.cloud.callFunction({
        name: 'checkActiveRoom'
      })
      
      console.log('检查活跃房间结果:', result)
      if (result.result && result.result.success) {
        return result.result.room
      }
      
      return null
    } catch (error) {
      console.error('检查活跃房间失败:', error)
      return null
    }
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
