/**
 * 可乐计分器房间页面
 * 支持实时同步、给分功能
 */
const db = wx.cloud.database()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    roomId: null,
    roomData: null,
    userInfo: null,
    qrcodeUrl: '',
    isCreating: false,
    currentUserOpenId: '',
    transferModal: {
      show: false,
      targetPlayer: null,
      score: ''
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('房间页面加载，参数:', options)
    const { roomId, mode } = options
    const app = getApp()
    
    // 获取用户信息
    let userInfo = app.globalData.userInfo
    if (!userInfo) {
      console.log('没有用户信息，生成默认信息')
      // 如果没有用户信息，生成默认信息
      userInfo = {
        nickName: '玩家' + Math.floor(Math.random() * 900) + 100,
        avatarUrl: '/images/default-avatar.png'
      }
      app.globalData.userInfo = userInfo
    }
    console.log('房间页面用户信息:', userInfo)

    this.setData({
      userInfo: userInfo,
      currentUserOpenId: '' // 将在云函数中获取
    })

    if (mode === 'create') {
      console.log('创建房间模式')
      this.createRoom()
    } else if (roomId) {
      console.log('加入房间模式，房间ID:', roomId)
      this.joinRoom(roomId)
    } else {
      console.log('房间信息错误')
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  /**
   * 创建房间
   */
  async createRoom() {
    console.log('开始创建房间')
    this.setData({ isCreating: true })
    
    try {
      // 确保用户信息存在
      if (!this.data.userInfo) {
        throw new Error('用户信息未初始化')
      }

      // 获取当前用户openId
      const { result: userInfo } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfo.openId
      console.log('当前用户openId:', openId)
      
      // 更新currentUserOpenId
      this.setData({
        currentUserOpenId: openId
      })

      // 生成唯一房间ID
      const roomId = this.generateRoomId()
      console.log('生成的房间ID:', roomId)
      
      // 生成房间编号（纯数字）
      const roomNumber = Math.floor(Math.random() * 9000) + 1000
      
      // 房间数据
      const roomData = {
        _id: roomId,
        roomName: `房间${roomNumber}`,
        roomNumber: roomNumber,
        creatorOpenId: openId,
        createTime: new Date(),
        players: [{
          openId: openId,
          nickName: this.data.userInfo.nickName || '房主',
          avatarUrl: this.data.userInfo.avatarUrl || '',
          score: 0,
          joinTime: new Date()
        }],
        status: 'active',
        totalRounds: 0
      }
      console.log('房间数据:', roomData)

      // 创建房间
      console.log('开始创建房间到数据库')
      await wx.cloud.database().collection('rooms').add({
        data: roomData
      })
      console.log('房间创建成功')

      // 更新用户信息
      console.log('开始更新用户信息')
      try {
        await wx.cloud.database().collection('users').doc(openId).set({
          data: {
            openId: openId,
            nickName: this.data.userInfo.nickName || '用户',
            avatarUrl: this.data.userInfo.avatarUrl || '',
            totalGames: 0,
            totalScore: 0,
            lastActiveTime: new Date()
          }
        })
        console.log('用户信息更新成功')
      } catch (error) {
        console.log('用户信息更新失败，尝试创建新用户:', error)
        // 如果用户不存在则创建
        await wx.cloud.database().collection('users').add({
          data: {
            _id: openId,
            openId: openId,
            nickName: this.data.userInfo.nickName || '用户',
            avatarUrl: this.data.userInfo.avatarUrl || '',
            totalGames: 0,
            totalScore: 0,
            lastActiveTime: new Date()
          }
        })
        console.log('新用户创建成功')
      }

      console.log('房间创建成功，房间ID:', roomId, '房间数据:', roomData)
      this.setData({
        roomId: roomId,
        roomData: roomData,
        isCreating: false
      })
      
      // 生成小程序码
      this.generateQRCode()
      
      // 开始监听房间数据
      this.watchRoomData()
    } catch (error) {
      console.error('创建房间失败:', error)
      wx.showToast({
        title: error.message || '创建房间失败',
        icon: 'error',
        duration: 2000
      })
      this.setData({ isCreating: false })
      
      // 延迟返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 2000)
    }
  },

  /**
   * 加入房间
   */
  async joinRoom(roomId) {
    try {
      // 获取当前用户openId
      const { result: userInfoResult } = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      const openId = userInfoResult.openId
      console.log('当前用户openId:', openId)
      
      // 更新currentUserOpenId
      this.setData({
        currentUserOpenId: openId
      })

      // 查找房间
      console.log('查找房间，房间ID:', roomId)
      const roomResult = await wx.cloud.database().collection('rooms').doc(roomId).get()
      
      if (!roomResult.data) {
        throw new Error('房间不存在')
      }

      const room = roomResult.data
      console.log('找到房间:', room)

      // 检查房间状态
      if (room.status !== 'active') {
        throw new Error('房间已关闭')
      }

      // 检查房间人数限制
      if (room.players.length >= 30) {
        throw new Error('房间已满（最多30人）')
      }

      // 检查用户是否已在房间中
      const existingPlayer = room.players.find(player => player.openId === openId)
      if (existingPlayer) {
        console.log('用户已在房间中')
        this.setData({
          roomId: roomId,
          roomData: room
        })
        this.watchRoomData()
        return
      }

      // 添加用户到房间
      const newPlayer = {
        openId: openId,
        nickName: this.data.userInfo.nickName || '玩家',
        avatarUrl: this.data.userInfo.avatarUrl || '',
        score: 0,
        joinTime: new Date()
      }

      await wx.cloud.database().collection('rooms').doc(roomId).update({
        data: {
          players: wx.cloud.database().command.push(newPlayer)
        }
      })

      // 更新用户信息
      try {
        await wx.cloud.database().collection('users').doc(openId).set({
          data: {
            openId: openId,
            nickName: this.data.userInfo.nickName || '用户',
            avatarUrl: this.data.userInfo.avatarUrl || '',
            totalGames: 0,
            totalScore: 0,
            lastActiveTime: new Date()
          }
        })
      } catch (error) {
        console.log('用户信息更新失败，尝试创建新用户:', error)
        await wx.cloud.database().collection('users').add({
          data: {
            _id: openId,
            openId: openId,
            nickName: this.data.userInfo.nickName || '用户',
            avatarUrl: this.data.userInfo.avatarUrl || '',
            totalGames: 0,
            totalScore: 0,
            lastActiveTime: new Date()
          }
        })
      }

      // 获取更新后的房间数据
      const updatedRoomResult = await wx.cloud.database().collection('rooms').doc(roomId).get()
      
      this.setData({
        roomId: roomId,
        roomData: updatedRoomResult.data
      })
      
      // 开始监听房间数据
      this.watchRoomData()
    } catch (error) {
      console.error('加入房间失败:', error)
      wx.showToast({
        title: '加入房间失败',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  /**
   * 生成小程序码
   */
  async generateQRCode() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          roomId: this.data.roomId
        }
      })

      if (result.result.success) {
        this.setData({
          qrcodeUrl: result.result.qrcodeUrl
        })
      }
    } catch (error) {
      console.error('生成小程序码失败:', error)
    }
  },

  /**
   * 监听房间数据变化
   */
  watchRoomData() {
    const watcher = db.collection('rooms').doc(this.data.roomId).watch({
      onChange: (snapshot) => {
        console.log('房间数据更新:', snapshot.docs)
        if (snapshot.docs.length > 0) {
          this.setData({
            roomData: snapshot.docs[0]
          })
        }
      },
      onError: (error) => {
        console.error('监听房间数据失败:', error)
      }
    })

    // 页面卸载时关闭监听
    this.watcher = watcher
  },

  /**
   * 显示给分弹窗
   */
  showTransferModal(e) {
    const { player } = e.currentTarget.dataset
    
    console.log("showTransferModal", player.openId, this.data.currentUserOpenId)
    // 不能给自己给分
    if (player.openId === this.data.currentUserOpenId) {
      wx.showToast({
        title: '不能给自己给分',
        icon: 'none'
      })
      return
    }

    this.setData({
      'transferModal.show': true,
      'transferModal.targetPlayer': player,
      'transferModal.score': ''
    })
  },

  /**
   * 隐藏给分弹窗
   */
  hideTransferModal() {
    this.setData({
      'transferModal.show': false,
      'transferModal.targetPlayer': null,
      'transferModal.score': ''
    })
  },

  /**
   * 输入分数
   */
  onScoreInput(e) {
    const value = e.detail.value
    // 只允许输入数字
    if (/^\d*$/.test(value)) {
      this.setData({
        'transferModal.score': value
      })
    }
  },

  /**
   * 确认给分
   */
  async confirmTransfer() {
    const { targetPlayer, score } = this.data.transferModal
    
    if (!score || score <= 0) {
      wx.showToast({
        title: '请输入有效分数',
        icon: 'none'
      })
      return
    }

    try {
      const result = await wx.cloud.callFunction({
        name: 'transferScore',
        data: {
          roomId: this.data.roomId,
          toPlayerOpenId: targetPlayer.openId,
          score: parseInt(score)
        }
      })

      if (result.result.success) {
        wx.showToast({
          title: '给分成功',
          icon: 'success'
        })
        this.hideTransferModal()
      } else {
        throw new Error(result.result.error)
      }
    } catch (error) {
      console.error('给分失败:', error)
      wx.showToast({
        title: error.message || '给分失败',
        icon: 'error'
      })
    }
  },

  /**
   * 分享房间
   */
  onShareAppMessage() {
    return {
      title: `房间 ${this.data.roomData?.roomName || this.data.roomId} - 可乐计分器`,
      path: `/pages/room/room?roomId=${this.data.roomId}`,
      imageUrl: this.data.qrcodeUrl
    }
  },

  /**
   * 生成房间ID
   * @returns {string} 房间ID
   */
  generateRoomId() {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substr(2, 6)
    return `${timestamp}${random}`.toUpperCase()
  },

  /**
   * 获取当前用户的分数
   */
  getCurrentUserScore() {
    if (!this.data.roomData || !this.data.roomData.players || !this.data.currentUserOpenId) {
      return 0;
    }
    
    // 遍历玩家数组查找当前用户
    const currentPlayer = this.data.roomData.players.find(
      player => player.openId === this.data.currentUserOpenId
    );
    
    return currentPlayer ? currentPlayer.score : 0;
  },
  
  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 关闭数据监听
    if (this.watcher) {
      this.watcher.close()
    }
  }
})
