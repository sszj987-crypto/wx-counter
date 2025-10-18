/**
 * 个人资料页面
 * 更改头像昵称
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {
      nickName: '',
      avatarUrl: ''
    },
    originalUserInfo: {
      nickName: '',
      avatarUrl: ''
    },
    isSaving: false,
    hasChanges: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    this.loadUserInfo()
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const app = getApp()
    const userInfo = app.globalData.userInfo || {}
    
    const userData = {
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || ''
    }
    
    this.setData({
      userInfo: userData,
      originalUserInfo: { ...userData }
    })
  },

  /**
   * 选择头像
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      'userInfo.avatarUrl': avatarUrl
    })
    this.checkChanges()
  },

  /**
   * 昵称输入
   */
  onNicknameChange(e) {
    this.setData({
      'userInfo.nickName': e.detail.value
    })
    this.checkChanges()
  },

  /**
   * 检查是否有变化
   */
  checkChanges() {
    const { userInfo, originalUserInfo } = this.data
    const hasChanges = userInfo.nickName !== originalUserInfo.nickName || 
                      userInfo.avatarUrl !== originalUserInfo.avatarUrl
    this.setData({ hasChanges })
  },

  /**
   * 保存用户信息
   */
  async saveUserInfo() {
    const { userInfo, originalUserInfo } = this.data
    
    if (!userInfo.nickName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }

    // 检查是否有变化
    const hasChanged = userInfo.nickName !== originalUserInfo.nickName || 
                      userInfo.avatarUrl !== originalUserInfo.avatarUrl
    
    if (!hasChanged) {
      wx.showToast({
        title: '信息无变化',
        icon: 'none'
      })
      return
    }

    this.setData({ isSaving: true })

    try {
      // 更新全局用户信息
      const app = getApp()
      app.globalData.userInfo = userInfo

      // 更新云数据库
      const db = wx.cloud.database()
      const openId = wx.getStorageSync('openid')
      
      if (openId) {
        await db.collection('users').doc(openId).update({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            updateTime: new Date()
          }
        })
      } else {
        // 如果没有openId，创建一个新用户
        await db.collection('users').add({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            totalGames: 0,
            totalScore: 0,
            updateTime: new Date()
          }
        })
      }

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('保存用户信息失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      })
    } finally {
      this.setData({ isSaving: false })
    }
  }
})
