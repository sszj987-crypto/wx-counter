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
    hasUserInfo: true, // 默认设为true，确保按钮始终可用
    isProcessing: false, // 标记按钮是否正在处理点击事件，防止重复点击
    activeRoom: null, // 活跃的房间信息
    checkActiveRoomTimer: null // 用于防抖处理的定时器
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('主页面加载，参数:', options)
    
    // 处理从二维码扫描带来的参数
    // 二维码参数可能在scene中，也可能直接在options中
    let roomId = null
    
    // 检查是否有scene参数（从二维码扫描进入）
    if (options.scene) {
      console.log('检测到scene参数:', options.scene)
      // scene参数通常是url编码的
      try {
        const sceneParams = decodeURIComponent(options.scene)
        console.log('解码后的scene参数:', sceneParams)
        
        // 解析scene参数，查找roomId
        if (sceneParams.includes('roomId=')) {
          roomId = sceneParams.split('roomId=')[1]
          console.log('从scene中解析到roomId:', roomId)
        }
      } catch (e) {
        console.error('解析scene参数失败:', e)
      }
    } 
    // 检查是否直接有roomId参数
    else if (options.roomId) {
      roomId = options.roomId
      console.log('检测到直接的roomId参数:', roomId)
    }
    
    // 无论是否有roomId参数，都先初始化用户信息
    this.initUserInfo().catch(err => {
      console.log('用户信息初始化失败，但不影响页面功能:', err)
    }).finally(() => {
      // 初始化完成后检查活跃房间
      this.checkActiveRoom()
    })
    
    // 如果存在有效roomId，跳转到对应房间页面
    if (roomId) {
      console.log('根据二维码参数跳转到房间:', roomId)
      // 延迟跳转，确保页面有时间初始化
      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/room/room?roomId=${roomId}`
        })
      }, 300)
    }
  },
  
  /**
   * 生命周期函数--监听页面显示
   * 每次页面显示时都检查是否有活跃房间
   */
  onShow() {
    console.log('主页面显示')
    // 页面显示时也检查活跃房间
    this.checkActiveRoom()
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
      // 尝试从缓存获取openId
      const app = getApp();
      const cacheManager = app.globalData.cacheManager;
      let openId = cacheManager.getOpenId();
      
      if (!openId) {
        // 缓存中没有openid，调用云函数获取
        const { result: userInfo } = await wx.cloud.callFunction({
          name: 'getOpenId'
        })
        openId = userInfo.openId
        // 将openid存入缓存
        cacheManager.setOpenId(openId);
        console.log('通过云函数获取用户openId:', openId)
      } else {
        console.log('使用缓存的用户openId:', openId)
      }

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
   * 开始可乐计分器 - 始终创建新房间
   */
  async startMultiPlayer() {
    // 防止重复点击
    if (this.data.isProcessing) {
      console.log('正在处理中，请稍后再试')
      return
    }
    
    // 设置处理状态为true
    this.setData({
      isProcessing: true
    })
    
    console.log('点击开始可乐计分器按钮 - 创建新房间')
    
    try {
      // 直接创建新房间
      wx.navigateTo({
        url: '/pages/room/room?mode=create',
        events: {
          // 当从room页面返回时刷新活跃房间状态
          roomCreated: () => {
            console.log('房间已创建，刷新活跃房间状态');
            this.checkActiveRoom();
          }
        }
      })
    } catch (error) {
      console.error('创建房间失败:', error)
      wx.showToast({
        title: '创建房间失败，请重试',
        icon: 'none'
      })
    } finally {
      // 无论成功失败，都在最后将处理状态设为false
      setTimeout(() => {
        this.setData({
          isProcessing: false
        })
      }, 500) // 延迟500ms，防止快速重复点击
    }
  },
  
  /**
   * 进入已存在的房间
   */
  async enterExistingRoom() {
    // 防止重复点击
    if (this.data.isProcessing || !this.data.activeRoom) {
      console.log('正在处理中或无活跃房间，请稍后再试')
      return
    }
    
    // 设置处理状态为true
    this.setData({
      isProcessing: true
    })
    
    console.log('进入已存在的房间:', this.data.activeRoom.roomNumber)
    // 直接使用现有的activeRoom数据进行跳转，避免重新检查导致按钮消失再出现
    wx.navigateTo({
      url: `/pages/room/room?roomId=${this.data.activeRoom._id}`,
      events: {
        // 当从room页面返回时刷新活跃房间状态
        roomUpdated: () => {
          console.log('房间已更新，刷新活跃房间状态');
          this.checkActiveRoom();
        }
      }
    })
    
    // 无论成功失败，都在最后将处理状态设为false
    setTimeout(() => {
      this.setData({
        isProcessing: false
      })
    }, 500) // 延迟500ms，防止快速重复点击
  },

  /**
   * 检查是否有活跃的房间 - 更新版，直接更新页面数据
   * 添加防抖处理，避免重复调用
   */
  async checkActiveRoom() {
    // 防抖处理：如果已有定时器在等待执行，则清除它并重新设置
    if (this.data.checkActiveRoomTimer) {
      clearTimeout(this.data.checkActiveRoomTimer);
    }
    
    // 设置新的定时器，延迟执行实际的检查逻辑
    const timer = setTimeout(async () => {
      try {
        console.log('开始检查活跃房间')
        
        // 先重置activeRoom为null，确保默认状态正确
        this.setData({
          activeRoom: null
        })
        
        // 即使没有用户信息初始化完成，也尝试获取openId
        let openId = null
        try {
          // 尝试从缓存获取openId
          const app = getApp();
          const cacheManager = app.globalData.cacheManager;
          openId = cacheManager.getOpenId();
          
          if (!openId) {
            // 缓存中没有openid，调用云函数获取
            const { result: userInfoResult } = await wx.cloud.callFunction({
              name: 'getOpenId'
            })
            openId = userInfoResult.openId
            // 将openid存入缓存
            cacheManager.setOpenId(openId);
            console.log('通过云函数获取用户openId:', openId)
          } else {
            console.log('使用缓存的用户openId:', openId)
          }
        } catch (err) {
          console.log('获取openId失败，可能没有登录，但继续执行:', err)
          return null
        }

        // 查询房间 - 不再通过status字段过滤
        const db = wx.cloud.database()
        // 数据库索引建议:
        // 组合索引: createTime: 降序, _id: 升序, players: 升序
        const result = await db.collection('rooms')
          .where({
            players: db.command.elemMatch({
              openId: openId
            }),
            _id: db.command.exists(true) // 确保记录存在
          })
          .orderBy('createTime', 'desc') // 获取最新创建的房间
          .limit(1) // 只获取一个最新的房间
          .get()

        console.log('查询活跃房间结果:', result)

        if (result.data && result.data.length > 0) {
          const room = result.data[0]
          const now = new Date()
          const roomTime = new Date(room.createTime)
          const hoursDiff = (now - roomTime) / (1000 * 60 * 60)

          // 检查房间是否超时
          if (hoursDiff < 24) {
            console.log('找到活跃房间:', room._id, '房间号:', room.roomNumber, '创建时间:', room.createTime)
            
            // 再次验证房间是否真的存在（防止查询和验证之间被删除）
            try {
              const verifyResult = await db.collection('rooms').doc(room._id).get()
              if (verifyResult.data) {
                // 确认房间仍然存在，才更新页面数据
                this.setData({
                  activeRoom: room
                })
                return room
              }
            } catch (verifyError) {
              console.log('验证房间存在性失败，可能已被删除:', verifyError)
            }
          } else {
            console.log('房间已超时，关闭房间:', room._id)
            // 删除超时房间
            try {
              await db.collection('rooms').doc(room._id).remove()
              console.log('超时房间已删除:', room._id)
            } catch (removeError) {
              console.log('删除房间失败，可能已被删除:', removeError)
            }
          }
        }
        
        console.log('未找到活跃房间或房间已失效')
        return null
      } catch (error) {
        console.error('检查活跃房间失败:', error)
        // 出错时不显示进入房间按钮
        this.setData({
          activeRoom: null
        })
        return null
      } finally {
        // 清除定时器引用
        this.setData({
          checkActiveRoomTimer: null
        });
      }
    }, 300); // 延迟300毫秒执行
    
    // 更新定时器引用
    this.setData({
      checkActiveRoomTimer: timer
    });
  },

  /**
   * 页面分享
   */
  /**
   * 生命周期函数--监听页面卸载
   * 清理防抖定时器，防止内存泄漏
   */
  onUnload() {
    console.log('主页面卸载，清理防抖定时器')
    // 清理checkActiveRoom的防抖定时器
    if (this.data.checkActiveRoomTimer) {
      clearTimeout(this.data.checkActiveRoomTimer);
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
