/**
 * 个人资料页面
 * 更改头像昵称
 */
const counter = require('../../utils/counter-service.js')

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
      await counter.call('updateProfile', {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl || '',
        largeTextEnabled: !!wx.getStorageSync('largeTextEnabled')
      })
      // 服务端保存成功后更新全局用户信息。
      getApp().globalData.userInfo = userInfo

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
