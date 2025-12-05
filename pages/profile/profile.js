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
    
    // 设置保存中状态
    this.setData({ isSaving: true })

    try {
      // 更新全局用户信息
      const app = getApp()
      app.globalData.userInfo = userInfo

      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfoResult.openId
      console.log('当前用户openId:', openId)

      // 直接从数据库更新用户信息
      const userRef = wx.cloud.database().collection('users').doc(openId)
      const userDoc = await userRef.get().catch(() => ({ data: null }))

      if (userDoc.data) {
        console.log('更新现有用户信息')
        await userRef.update({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl || '',
            updateTime: new Date()
          }
        })
      } else {
        console.log('创建新用户信息')
        await wx.cloud.database().collection('users').add({
          data: {
            _id: openId,
            openId: openId,
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl || '',
            gamedata: [], // 游戏数据数组
            gamemate: [], // 游戏伙伴数组
            createTime: new Date(),
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
