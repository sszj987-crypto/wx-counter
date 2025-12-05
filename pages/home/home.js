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
    
    // 处理从二维码扫描带来的参数
    // 二维码参数可能在scene中，也可能直接在options中
    let roomId = null
    
    // 检查是否有scene参数（从二维码扫描进入）
    if (options.scene) {
      // scene参数通常是url编码的
      try {
        const sceneParams = decodeURIComponent(options.scene)
        
        // 解析scene参数，查找roomId
        if (sceneParams.includes('roomId=')) {
          roomId = sceneParams.split('roomId=')[1]
        }
      } catch (e) {
        console.error('解析scene参数失败:', e)
      }
    } 
    // 检查是否直接有roomId参数
    else if (options.roomId) {
      roomId = options.roomId
    }
    
    // 无论是否有roomId参数，都先初始化用户信息
    this.initUserInfo().catch(err => {
    }).finally(() => {
      // 初始化完成后检查活跃房间
      this.checkActiveRoom()
      // 检查是否需要提示用户设置用户名
      this.checkAndPromptForUserInfo()
    })
    
    // 如果存在有效roomId，跳转到对应房间页面
    if (roomId) {
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
    // 页面显示时也检查活跃房间
    this.checkActiveRoom()
  },

  /**
   * 初始化用户信息 - 数据库优先策略
   */
  async initUserInfo() {
    const app = getApp()
    
    // 检查是否已有用户信息
    if (app.globalData.userInfo && app.globalData.userInfo.fromDatabase) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true
      })
      return
    }

    // 先从数据库获取用户信息，数据库优先策略
    try {
      const dbUserInfo = await this.getUserInfoFromDB()
      if (dbUserInfo) {
        // 标记信息来源为数据库，后续不再覆盖
        dbUserInfo.fromDatabase = true
        app.globalData.userInfo = dbUserInfo
        this.setData({
          userInfo: dbUserInfo,
          hasUserInfo: true
        })
        return
      }
    } catch (error) {
    }

    // 数据库中没有用户信息，才获取微信用户信息并保存到数据库
    try {
      const wxUserInfo = await this.getWxUserInfo()
      
      // 保存到数据库
      const savedUserInfo = await this.saveUserInfoToDB(wxUserInfo)
      if (savedUserInfo) {
        // 标记信息来源为数据库
        savedUserInfo.fromDatabase = true
        app.globalData.userInfo = savedUserInfo
        this.setData({
          userInfo: savedUserInfo,
          hasUserInfo: true
        })
      } else {
        // 如果保存失败，使用临时用户信息（标记为非数据库来源）
        wxUserInfo.fromDatabase = false
        app.globalData.userInfo = wxUserInfo
        this.setData({
          userInfo: wxUserInfo,
          hasUserInfo: true
        })
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      // 使用默认用户信息（标记为非数据库来源）
      const defaultUserInfo = this.generateDefaultUserInfo()
      defaultUserInfo.fromDatabase = false
      app.globalData.userInfo = defaultUserInfo
      this.setData({
        userInfo: defaultUserInfo,
        hasUserInfo: true
      })
    }
  },

  /**
   * 检查用户信息并在必要时提示设置 - 数据库优先策略
   */
  async checkAndPromptForUserInfo() {
    try {
      const app = getApp()
      const userInfo = app.globalData.userInfo
      
      // 检查用户信息是否存在且不是默认值
      // 注意：只有当用户信息不是来自数据库，且为默认值时才提示
      if (!userInfo || 
          (!userInfo.fromDatabase && (
            userInfo.nickName === '玩家' || 
            (userInfo.nickName && userInfo.nickName.startsWith('玩家') && /^\d+$/.test(userInfo.nickName.substring(2)))
          ))) {
        
        // 如果用户信息来自数据库，说明之前已经保存过，无需提示
        if (userInfo && userInfo.fromDatabase) {
          return
        }
        
        
        // 显示弹框询问是否需要设置用户名
        wx.showModal({
          title: '设置用户名',
          content: '检测到您还没有设置用户名，是否前往设置个人昵称和头像？',
          confirmText: '去设置',
          cancelText: '暂不设置',
          success: (res) => {
            if (res.confirm) {
              // 跳转到个人资料页面
              wx.navigateTo({
                url: '/pages/profile/profile'
              })
            } else if (res.cancel) {
            }
          }
        })
      } else {
      }
    } catch (error) {
      console.error('检查用户信息时出错:', error)
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
      } else {
      }

      // 直接从数据库查询用户信息
      const userResult = await wx.cloud.database().collection('users').doc(openId).get()
      
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
   * 保存用户信息到数据库
   */
  async saveUserInfoToDB(userInfo) {
    try {
      
      // 获取当前用户openId
      const app = getApp();
      const cacheManager = app.globalData.cacheManager;
      let openId = cacheManager.getOpenId();
      
      if (!openId) {
        // 缓存中没有openid，调用云函数获取
        const { result: userInfoResult } = await wx.cloud.callFunction({
          name: 'getOpenId'
        })
        openId = userInfoResult.openId
        // 将openid存入缓存
        cacheManager.setOpenId(openId);
      } else {
      }

      // 准备用户数据（使用新的对象结构）
      const userData = {
        _id: openId, // 使用openId作为文档ID
        nickName: userInfo.nickName || '玩家',
        avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
        gamedata: [], // 直接数组结构存储游戏记录
        statistics: {
          totalGames: 0,
          totalScore: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          netScore: 0
        },
        gamemate: [], // 游戏伙伴数组
        createTime: new Date(),
        updateTime: new Date(),
        lastLoginTime: new Date(),
        _openid: openId // 云开发需要这个字段
      }


      // 保存到数据库
      const db = wx.cloud.database()
      const result = await db.collection('users').add({
        data: userData
      })

      
      // 返回保存的数据（包含从数据库获取的完整信息）
      return {
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        fromDatabase: true
      }
    } catch (error) {
      console.error('保存用户信息到数据库失败:', error)
      return null
    }
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
      return
    }
    
    // 设置处理状态为true
    this.setData({
      isProcessing: true
    })
    
    
    try {
      // 获取当前用户openId
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
        } else {
        }
      } catch (err) {
        wx.showToast({
          title: '无法获取用户信息',
          icon: 'none'
        })
        return
      }
      
      // 检查用户已创建的房间数量（排除已结算的房间）
      try {
        const db = wx.cloud.database()
        const result = await db.collection('rooms')
          .where({
            _openid: openId,
            status: 'active' // 只统计活跃状态的房间
          })
          .get()
          
        
        // 如果用户已创建的房间超过2个，提示无法创建新房间
        if (result.data.length >= 2) {
          wx.showModal({
            title: '无法创建房间',
            content: '您已创建了2个房间，无法创建更多房间。请先结算之前的房间。',
            showCancel: false,
            confirmText: '我知道了'
          })
          return
        }
      } catch (checkError) {
        console.error('检查房间数量失败:', checkError)
        // 即使检查失败，也允许用户继续创建房间
      }
      
      // 直接创建新房间
      wx.navigateTo({
        url: '/pages/room/room?mode=create',
        events: {
          // 当从room页面返回时刷新活跃房间状态
          roomCreated: () => {
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
      return
    }
    
    // 设置处理状态为true
    this.setData({
      isProcessing: true
    })
    
    // 直接使用现有的activeRoom数据进行跳转，避免重新检查导致按钮消失再出现
    wx.navigateTo({
      url: `/pages/room/room?roomId=${this.data.activeRoom._id}`,
      events: {
        // 当从room页面返回时刷新活跃房间状态
        roomUpdated: () => {
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
          } else {
          }
        } catch (err) {
          return null
        }

        // 查询房间 - 只显示active状态的房间
        const db = wx.cloud.database()
        // 数据库索引建议:
        // 组合索引: createTime: 降序, _id: 升序, players: 升序, status: 升序
        const result = await db.collection('rooms')
          .where({
            players: db.command.elemMatch({
              openId: openId
            }),
            _id: db.command.exists(true), // 确保记录存在
            status: 'active' // 只显示活跃状态的房间
          })
          .orderBy('createTime', 'desc') // 获取最新创建的房间
          .limit(1) // 只获取一个最新的房间
          .get()


        if (result.data && result.data.length > 0) {
          const room = result.data[0]
          const now = new Date()
          const roomTime = new Date(room.createTime)
          const hoursDiff = (now - roomTime) / (1000 * 60 * 60)

          // 检查房间是否超时
          if (hoursDiff < 24) {
            
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
            }
          } else {
            // 删除超时房间
            try {
              await db.collection('rooms').doc(room._id).remove()
            } catch (removeError) {
            }
          }
        }
        
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
      path: '/pages/home/home',
      imageUrl: '/images/小程序码.jpg'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '可乐计分器小程序',
      imageUrl: '/images/小程序码.jpg'
    }
  }
})
