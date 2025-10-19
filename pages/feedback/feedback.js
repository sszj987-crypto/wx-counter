/**
 * 建议与反馈页面
 * 收集用户反馈
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    feedbackContent: '',
    isSubmitting: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 页面加载完成
  },

  /**
   * 输入反馈内容
   */
  onContentInput(e) {
    this.setData({
      feedbackContent: e.detail.value
    })
  },

  /**
   * 提交反馈
   */
  async submitFeedback() {
    const { feedbackContent } = this.data

    if (!feedbackContent.trim()) {
      wx.showToast({
        title: '请输入反馈内容',
        icon: 'none'
      })
      return
    }

    this.setData({ isSubmitting: true })

    try {
      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfoResult.openId
      console.log('当前用户openId:', openId)

      // 直接从数据库提交反馈
      await wx.cloud.database().collection('feedback').add({
        data: {
          content: feedbackContent,
          userOpenId: openId,
          createTime: new Date(),
          status: 'pending' // pending, resolved, rejected
        }
      })

      wx.showToast({
        title: '提交成功',
        icon: 'success'
      })

      // 重置表单
      this.setData({
        feedbackContent: ''
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)

    } catch (error) {
      console.error('提交反馈失败:', error)
      wx.showToast({
        title: '提交失败',
        icon: 'error'
      })
    } finally {
      this.setData({ isSubmitting: false })
    }
  }
})




