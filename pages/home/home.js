/**
 * 主页面逻辑
 * 提供可乐计分器入口
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
      // 获取当前用户openId
      const { result: userInfo } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfo.openId
      console.log('当前用户openId:', openId)

      // 直接从数据库查询用户信息
      const userResult = await wx.cloud.database().collection('users').doc(openId).get()
      console.log('从数据库获取用户信息结果:', userResult)
      
      if (userResult.data) {
        return {
          nickName: userResult.data.nickName || '玩家',
          avatarUrl: userResult.data.avatarUrl || '/images/default-avatar.png'
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
   * 开始可乐计分器
   */
  async startMultiPlayer() {
    console.log('点击开始可乐计分器按钮')
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
      
      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfoResult.openId
      console.log('当前用户openId:', openId)

      // 直接从数据库查询活跃房间
      const result = await wx.cloud.database().collection('rooms')
        .where({
          status: 'active',
          players: wx.cloud.database().command.elemMatch({
            openId: openId
          })
        })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()

      console.log('查询活跃房间结果:', result)

      if (result.data && result.data.length > 0) {
        const room = result.data[0]
        const now = new Date()
        const roomTime = new Date(room.createTime)
        const hoursDiff = (now - roomTime) / (1000 * 60 * 60)

        if (hoursDiff < 24) {
          console.log('找到活跃房间:', room._id, '创建时间:', room.createTime)
          return room
        } else {
          console.log('房间已超时，关闭房间:', room._id)
          // 关闭超时房间
          await wx.cloud.database().collection('rooms').doc(room._id).update({
            data: { status: 'closed' }
          })
          return null
        }
      }
      
      console.log('未找到活跃房间')
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
      title: '可乐计分器小程序',
      path: '/pages/home/home'
    }
  }
})
