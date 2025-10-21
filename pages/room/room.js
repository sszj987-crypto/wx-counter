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
    },
    settlementModal: {
      show: false,
      rate: '1'
    },
    qrcodeModal: {
      show: false
    },
    isTeaServiceEnabled: false,
    teaServicePlayerId: null
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
      this.generateQRCode().then(() => {
        // 自动显示二维码弹窗
        this.showQRCodeModal()
      })
      
      // 生成小程序码（加入房间时不自动显示弹窗）
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
   * 生成小程序码 - 简化实现，直接使用本地默认图片
   */
  generateQRCode() {
    try {
      // 如果没有roomId，不执行生成
      if (!this.data.roomId) {
        console.error('房间ID未设置');
        wx.showToast({
          title: '房间ID未设置，无法生成二维码',
          icon: 'none'
        });
        return;
      }
      
      // 直接使用本地默认二维码图片作为解决方案
      this.setData({
        qrcodeUrl: '/images/小程序码.jpg',
        // 存储房间ID，用于在弹窗中显示
        currentRoomId: this.data.roomId
      });
      
      console.log('使用本地默认二维码图片');
      
    } catch (error) {
      console.error('二维码处理失败:', error);
      // 出错时仍使用默认图片
      this.setData({
        qrcodeUrl: '/images/小程序码.jpg',
        currentRoomId: this.data.roomId || ''
      });
    }
  },
    } catch (error) {
      console.error('生成小程序码失败:', error);
      // 出错时使用默认图片
      this.setData({
        qrcodeUrl: '/images/小程序码.jpg'
      })
      wx.showToast({
        title: '二维码生成失败，显示备用图片',
        icon: 'none'
      })
    }
  },

  /**
   * 显示二维码弹窗
   */
  showQRCodeModal() {
    // 确保设置了currentRoomId
    if (this.data.roomId) {
      this.setData({
        currentRoomId: this.data.roomId
      })
    }
    // 确保二维码已生成
    if (!this.data.qrcodeUrl) {
      this.generateQRCode()
    }
    this.setData({
      'qrcodeModal.show': true
    })
  },

  /**
   * 隐藏二维码弹窗
   */
  hideQRCodeModal() {
    this.setData({
      'qrcodeModal.show': false
    })
  },

  /**
   * 切换台位/茶水开关
   */
  async toggleTeaService() {
    try {
      const newState = !this.data.isTeaServiceEnabled
      
      if (newState) {
        // 打开开关，添加台位/茶水玩家
        const teaServicePlayer = {
          nickName: '台位/茶水',
          avatarUrl: '/images/default-avatar.png',
          openId: 'tea_service_' + Date.now(),
          score: 0
        }
        
        const players = [...this.data.roomData.players, teaServicePlayer]
        
        await db.collection('rooms').doc(this.data.roomId).update({
          data: {
            players: players
          }
        })
        
        this.setData({
          isTeaServiceEnabled: true,
          teaServicePlayerId: teaServicePlayer.openId
        })
      } else {
        // 关闭开关，移除台位/茶水玩家
        const players = this.data.roomData.players.filter(
          player => player.openId !== this.data.teaServicePlayerId
        )
        
        await db.collection('rooms').doc(this.data.roomId).update({
          data: {
            players: players
          }
        })
        
        this.setData({
          isTeaServiceEnabled: false,
          teaServicePlayerId: null
        })
      }
    } catch (error) {
      console.error('切换台位/茶水开关失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      })
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
   * 显示给分弹窗 - 修复版本
   */
  showTransferModal(e) {
    try {
      const { player } = e.currentTarget.dataset
      
      // 不能给自己给分
      if (player && player.openId === this.data.currentUserOpenId) {
        wx.showToast({
          title: '不能给自己给分',
          icon: 'none'
        })
        return
      }

      // 重置并显示弹窗
      this.setData({
        'transferModal.show': true,
        'transferModal.targetPlayer': player,
        'transferModal.score': ''
      })
      
      // 短暂延迟后尝试聚焦输入框（如果需要）
      setTimeout(() => {
        try {
          // 微信小程序不支持直接DOM操作，依赖focus属性自动聚焦
        } catch (err) {
          console.log('聚焦尝试失败，但不会影响功能')
        }
      }, 100)
    } catch (error) {
      console.error('显示给分弹窗失败:', error)
    }
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
   * 输入分数 - 带最大值限制
   */
  onScoreInput(e) {
    // 检查事件参数是否有效
    if (!e || !e.detail) {
      console.warn('分数输入事件参数无效');
      return;
    }
    
    // 获取并处理输入值
    let value = String(e.detail.value || '');
    // 过滤非数字字符
    value = value.replace(/[^0-9]/g, '');
    
    // 添加最大数值限制（最大值设为100000）
    const MAX_SCORE = 100000;
    // 防止空字符串或0导致的问题
    if (value && parseInt(value) > MAX_SCORE) {
      value = String(MAX_SCORE);
      // 可以添加用户提示
      wx.showToast({
        title: `最大值为${MAX_SCORE}`,
        icon: 'none',
        duration: 1000
      });
    }
    
    // 直接更新数据
    this.setData({
      'transferModal.score': value
    });
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
  // 跳转到给分详情页面
  navigateToScoreDetails() {
    if (!this.data.roomId || !this.data.roomData) {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/score-details/score-details?roomId=${this.data.roomId}&roomName=${encodeURIComponent(this.data.roomData.roomName || '房间')}`
    })
  },

  // 显示结算弹窗
  showSettlementModal() {
    if (!this.data.roomId || !this.data.roomData) {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      })
      return
    }

    this.setData({
      'settlementModal.show': true,
      'settlementModal.rate': '1'
    })
  },

  // 隐藏结算弹窗
  hideSettlementModal() {
    this.setData({
      'settlementModal.show': false,
      'settlementModal.rate': '1'
    })
  },

  // 处理倍率输入
  onRateInput(e) {
    // 检查事件参数是否有效
    if (!e || !e.detail) {
      console.warn('倍率输入事件参数无效');
      return;
    }
    
    // 获取并处理输入值
    let value = String(e.detail.value || '');
    // 过滤非数字和小数点字符
    value = value.replace(/[^0-9.]/g, '');
    // 确保只有一个小数点
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    // 限制小数位数为2位
    if (parts.length === 2 && parts[1].length > 2) {
      value = parts[0] + '.' + parts[1].substring(0, 2);
    }
    // 确保不能以小数点开头
    if (value.startsWith('.')) {
      value = '0' + value;
    }
    // 限制最大值为10000
    const MAX_RATE = 10000;
    if (value && parseFloat(value) > MAX_RATE) {
      value = String(MAX_RATE);
      wx.showToast({
        title: `最大值为${MAX_RATE}`,
        icon: 'none',
        duration: 1000
      });
    }
    
    this.setData({
      'settlementModal.rate': value
    });
  },

  // 确认结算
  confirmSettlement() {
    const { rate } = this.data.settlementModal
    
    // 验证倍率输入
    let rateValue = parseFloat(rate)
    if (!rate || isNaN(rateValue) || rateValue <= 0) {
      wx.showToast({
        title: '请输入有效倍率',
        icon: 'none'
      })
      return
    }

    // 跳转到结算页面
    const data = {
      roomId: this.data.roomId,
      roomName: this.data.roomData.roomName,
      players: this.data.roomData.players,
      rate: rateValue
    }

    this.hideSettlementModal()
    wx.navigateTo({
      url: `/pages/settlement/settlement?data=${encodeURIComponent(JSON.stringify(data))}`
    })
  },

  onUnload() {
    // 关闭数据监听
    if (this.watcher) {
      this.watcher.close()
    }
  }
})
