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
   * 生命周期函数--监听页面显示
   * 每次页面显示时都重新获取最新用户信息
   */
  onShow() {
    this.getUserInfo()
  },

  /**
   * 获取用户信息 - 从数据库获取最新信息
   */
  async getUserInfo() {
    try {
      const app = getApp()
      let userInfo = app.globalData.userInfo || {}
      
      // 尝试从数据库获取最新用户信息
      try {
        // 获取当前用户openId
        const { result: userInfoResult } = await wx.cloud.callFunction({
          name: 'getOpenId'
        })
        const openId = userInfoResult.openId
        
        // 从数据库查询最新用户信息
        const db = wx.cloud.database()
        const userDoc = await db.collection('users').doc(openId).get()
        
        if (userDoc.data) {
          console.log('从数据库获取到最新用户信息')
          // 更新全局用户信息
          userInfo = {
            nickName: userDoc.data.nickName || '玩家',
            avatarUrl: userDoc.data.avatarUrl || '/images/default-avatar.png'
          }
          app.globalData.userInfo = userInfo
        }
      } catch (dbError) {
        console.log('从数据库获取用户信息失败，使用本地信息', dbError)
      }
      
      // 设置页面数据
      this.setData({
        userInfo: {
          nickName: userInfo.nickName || '玩家',
          avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
        }
      })
    } catch (error) {
      console.error('获取用户信息失败:', error)
      // 即使出错也设置默认信息
      this.setData({
        userInfo: {
          nickName: '玩家',
          avatarUrl: '/images/default-avatar.png'
        }
      })
    }
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
  async onShareTap() {
    try {
      // 生成进入小程序主页的二维码
      wx.showLoading({
        title: '生成小程序码...',
      })
      
      const result = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          // 不提供roomId，生成进入主页的二维码
          page: 'pages/home/home'
        }
      })
      
      wx.hideLoading()
      
      if (result.result.success) {
        // 更新二维码URL并显示弹窗
        this.setData({
          qrcodeUrl: result.result.qrcodeUrl,
          showQrcode: true
        })
      } else {
        throw new Error(result.result.error || '生成小程序码失败')
      }
      
      // 同时打开原生分享菜单选项
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      })
    } catch (error) {
      wx.hideLoading()
      console.error('生成小程序码失败:', error)
      wx.showToast({
        title: '生成小程序码失败',
        icon: 'none'
      })
      
      // 即使生成失败，也显示默认二维码
      this.setData({
        showQrcode: true
      })
    }
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
