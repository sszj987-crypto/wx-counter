/**
 * 可乐计分器房间页面
 * 支持实时同步、给分功能
 */
const db = wx.cloud.database();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    roomId: null,
    roomData: null,
    userInfo: null,
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
    isTeaServiceEnabled: false,
    teaServicePlayerId: null,
    isSettling: false, // 防止重复结算的状态标志
    isExitingRoom: false,
    largeTextEnabled: false,
    showSettingsPanel: false,
    isTransferring: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    const { roomId, mode } = options;
    const app = getApp();
    
    this.loadLargeTextSetting();

    // 先获取最新用户信息
    await this.updateUserInfoFromDatabase();
    
    // 然后处理房间逻辑
    if (mode === 'create') {
      this.createRoom();
    } else if (roomId) {
      this.joinRoom(roomId);
    } else {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },
  
  /**
   * 生命周期函数--监听页面显示
   * 每次页面显示时都重新获取最新用户信息并更新房间数据
   */
  async onShow() {
    this.loadLargeTextSetting();
    // 更新用户信息
    await this.updateUserInfoFromDatabase();
    // 如果房间已加载，重新获取最新房间数据以更新玩家信息
    if (this.data.roomId) {
      await this.refreshRoomData();
    }
  },
  

  
  /**
   * 点击玩家名跳转到个人资料页面
   */
  onPlayerNameTap(e) {
    const openId = e.currentTarget.dataset.openid;
    
    // 只有点击自己的名字才能跳转到个人资料页面
    if (openId === this.data.currentUserOpenId) {
      wx.navigateTo({
        url: '/pages/profile/profile'
      });
    }
  },

  loadLargeTextSetting() {
    const enabled = !!wx.getStorageSync('largeTextEnabled');
    this.setData({
      largeTextEnabled: enabled
    });
  },

  async toggleLargeText(e) {
    const enabled = !!(e && e.detail && e.detail.value);
    wx.setStorageSync('largeTextEnabled', enabled);
    this.setData({
      largeTextEnabled: enabled
    });

    try {
      let openId = this.data.currentUserOpenId;
      if (!openId) {
        const { result: userInfoResult } = await wx.cloud.callFunction({
          name: 'getOpenId'
        });
        openId = userInfoResult.openId;
      }
      if (openId) {
        await wx.cloud.database().collection('users').doc(openId).update({
          data: {
            largeTextEnabled: enabled,
            updateTime: new Date()
          }
        });
      }
    } catch (error) {
    }
  },

  toggleSettingsPanel() {
    this.setData({
      showSettingsPanel: !this.data.showSettingsPanel
    });
  },

  closeSettingsPanel() {
    this.setData({
      showSettingsPanel: false
    });
  },

  /**
   * 刷新房间数据
   */
  async refreshRoomData() {
    try {
      const db = wx.cloud.database();
      const roomResult = await db.collection('rooms').doc(this.data.roomId).get();
      
      if (roomResult.data) {
        // 更新玩家在房间中的信息
        const updatedRoomData = roomResult.data;
        
        // 查找当前用户在房间中的位置
        const currentPlayerIndex = updatedRoomData.players.findIndex(
          player => player.openId === this.data.currentUserOpenId
        );
        
        // 如果找到当前用户，更新其头像和昵称
        if (currentPlayerIndex !== -1 && this.data.userInfo) {
          const currentPlayer = updatedRoomData.players[currentPlayerIndex] || {};
          const nextNickName = this.data.userInfo.nickName;
          const nextAvatarUrl = this.data.userInfo.avatarUrl;
          const updateData = {};
          if (nextNickName && nextNickName !== currentPlayer.nickName) {
            updateData[`players.${currentPlayerIndex}.nickName`] = nextNickName;
          }
          if (nextAvatarUrl && nextAvatarUrl !== currentPlayer.avatarUrl) {
            updateData[`players.${currentPlayerIndex}.avatarUrl`] = nextAvatarUrl;
          }
          if (Object.keys(updateData).length > 0) {
            await db.collection('rooms').doc(this.data.roomId).update({
              data: updateData
            });
          }
          updatedRoomData.players[currentPlayerIndex] = {
            ...currentPlayer,
            ...(nextNickName ? { nickName: nextNickName } : {}),
            ...(nextAvatarUrl ? { avatarUrl: nextAvatarUrl } : {})
          };
        }
        
        // 更新页面数据
        this.setData({
          roomData: updatedRoomData
        });
      }
    } catch (error) {
      console.error('刷新房间数据失败:', error);
    }
  },

  /**
   * 从数据库更新用户信息
   */
  async updateUserInfoFromDatabase() {
    try {
      const app = getApp();
      let userInfo = app.globalData.userInfo || {};
      let currentUserOpenId = '';
      
      // 尝试从数据库获取最新用户信息
      try {
        // 获取当前用户openId
        const { result: userInfoResult } = await wx.cloud.callFunction({
          name: 'getOpenId'
        });
        const openId = userInfoResult.openId;
        currentUserOpenId = openId; // 保存openId
        
        // 从数据库查询最新用户信息
        const db = wx.cloud.database();
        const userDoc = await db.collection('users').doc(openId).get();
        
        if (userDoc.data) {
          const userData = userDoc.data;
          if (typeof userData.largeTextEnabled === 'boolean') {
            const enabled = !!userData.largeTextEnabled;
            wx.setStorageSync('largeTextEnabled', enabled);
            this.setData({
              largeTextEnabled: enabled
            });
          }
          userInfo = {
            nickName: userData.nickName || '玩家',
            avatarUrl: userData.avatarUrl || '/images/default-avatar.png'
          };
          app.globalData.userInfo = userInfo;
        }
      } catch (dbError) {
      }
      
      // 如果仍然没有用户信息，生成默认信息
      if (!userInfo.nickName) {
        userInfo = {
          nickName: '玩家' + Math.floor(Math.random() * 900) + 100,
          avatarUrl: '/images/default-avatar.png'
        };
        app.globalData.userInfo = userInfo;
      }
      
      // 更新页面数据
      this.setData({
        userInfo: userInfo,
        currentUserOpenId: currentUserOpenId // 设置用户openId
      });
    } catch (error) {
      console.error('更新用户信息失败:', error);
      // 出错时设置默认信息
      const defaultUserInfo = {
        nickName: '玩家',
        avatarUrl: '/images/default-avatar.png'
      };
      this.setData({
        userInfo: defaultUserInfo,
        // 保留当前的currentUserOpenId，不要重置为空
      });
    }
  },

  /**
   * 创建房间
   */
  async createRoom() {
    this.setData({ isCreating: true });
    
    try {
      // 确保用户信息存在
      if (!this.data.userInfo) {
        throw new Error('用户信息未初始化');
      }

      // 获取当前用户openId
      const { result: userInfo } = await wx.cloud.callFunction({
        name: 'getOpenId'
      });
      const openId = userInfo.openId;
      
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
            confirmText: '我知道了',
            success: (res) => {
              // 用户点击我知道了，返回首页
              wx.switchTab({
                url: '/pages/home/home'
              });
            }
          })
          this.setData({ isCreating: false });
          return
        }
      } catch (checkError) {
        console.error('检查房间数量失败:', checkError)
        // 即使检查失败，也允许用户继续创建房间
      }
      
      // 更新currentUserOpenId
      this.setData({
        currentUserOpenId: openId
      });

      // 生成唯一房间ID
      const roomId = this.generateRoomId();
      
      // 生成房间编号（纯数字）
      const roomNumber = Math.floor(Math.random() * 9000) + 1000;
      
      // 房间数据
      const roomData = {
        _id: roomId,
        _openid: openId, // 使用_openid替代creatorOpenId
        roomNumber: roomNumber,
        status: 'active', // 新增：房间状态字段，默认为active
        createTime: new Date(),
        players: [{
          openId: openId,
          nickName: this.data.userInfo.nickName || '房主',
          avatarUrl: this.data.userInfo.avatarUrl || '',
          score: 0,
          joinTime: new Date()
        }],

        totalRounds: 0,
        teaServiceScore: 0 // 新增：台位分数记忆
      };

      await wx.cloud.database().collection('rooms').add({
        data: roomData
      });

      try {
        await wx.cloud.database().collection('users').doc(openId).update({
          data: {
            nickName: this.data.userInfo.nickName || '用户',
            avatarUrl: this.data.userInfo.avatarUrl || '',
            lastActiveTime: new Date(),
            largeTextEnabled: this.data.largeTextEnabled
          }
        });
      } catch (error) {
        await wx.cloud.database().collection('users').add({
          data: {
            _id: openId,
            openId: openId,
            nickName: this.data.userInfo.nickName || '用户',
            avatarUrl: this.data.userInfo.avatarUrl || '',
            gamemate: [],
            gamedata: [],
            statistics: {
              totalGames: 0,
              totalScore: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              winRate: 0,
              netScore: 0
            },
            lastActiveTime: new Date(),
            largeTextEnabled: this.data.largeTextEnabled
          }
        });
      }

      this.setData({
        roomId: roomId,
        roomData: roomData,
        isCreating: false
      });
      
      // 通知home页面刷新活跃房间状态
      const pages = getCurrentPages();
      const homePage = pages.find(page => page.route === 'pages/home/home');
      if (homePage) {
        // 如果home页面已经注册了roomCreated事件，触发该事件
        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel) {
          eventChannel.emit('roomCreated');
        }
      }
      
      // 检查是否存在台位/茶水玩家
      await this.checkTeaServiceStatus(roomData);
      
      // 只有在还没有监听器的情况下才开始监听房间数据
      if (!this.watcher) {
        this.watchRoomData();
      }
    } catch (error) {
      console.error('创建房间失败:', error);
      wx.showToast({
        title: error.message || '创建房间失败',
        icon: 'error',
        duration: 2000
      });
      this.setData({ isCreating: false });
      
      // 延迟返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }
  },

  /**
   * 加入房间
   */
  async joinRoom(roomId) {
    try {
      const goHomeWithDeletedTip = () => {
        wx.showToast({
          title: '房间已删除',
          icon: 'none'
        });
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/home/home'
          });
        }, 1500);
      };

      const goSettlementWithRoomId = (room) => {
        wx.redirectTo({
          url: `/pages/settlement/settlement?data=${encodeURIComponent(JSON.stringify({
            roomId: room._id,
            roomNumber: room.roomNumber,
            players: room.players,
            rate: room.rate || 1,
            settlementTime: room.settlementTime || room.closeTime || new Date()
          }))}`
        });
      };

      // 尝试从缓存获取openId
      const app = getApp();
      const cacheManager = app.globalData.cacheManager;
      let openId = cacheManager.getOpenId();
      
      if (!openId) {
        // 缓存中没有openid，调用云函数获取
        const { result: userInfoResult } = await wx.cloud.callFunction({
          name: 'getOpenId'
        });
        openId = userInfoResult.openId;
        // 将openid存入缓存
        cacheManager.setOpenId(openId);
      } else {
      }
      
      // 更新currentUserOpenId
      this.setData({
        currentUserOpenId: openId
      });

      // 查找房间
      let roomResult;
      try {
        roomResult = await wx.cloud.database().collection('rooms').doc(roomId).get();
      } catch (error) {
        if (error.errMsg && error.errMsg.includes('permission denied')) {
          goHomeWithDeletedTip();
          return;
        }
        throw error;
      }
      
      if (!roomResult.data) {
        throw new Error('房间不存在');
      }

      const room = roomResult.data;
      
      // 检查房间状态是否为inactive
      if (room.status === 'inactive') {
        goSettlementWithRoomId(room);
        return;
      }



      // 检查房间人数限制
      if (room.players.length >= 30) {
        throw new Error('房间已满（最多30人）');
      }

      // 检查用户是否已在房间中
      const existingPlayer = room.players.find(player => player.openId === openId);
      if (existingPlayer) {
        this.setData({
          roomId: roomId,
          roomData: room
        });
        // 检查是否存在台位/茶水玩家
        await this.checkTeaServiceStatus(room);
        // 只有在还没有监听器的情况下才开始监听房间数据
        if (!this.watcher) {
          this.watchRoomData();
        }
        return;
      }
      
      // 确保用户信息完整 - 解决邀请加入房间后图标名字不显示的问题
      // 先尝试从数据库获取用户信息
      let userInfoFromDb = null;
      try {
        const userResult = await wx.cloud.database().collection('users').doc(openId).get();
        userInfoFromDb = userResult.data;
      } catch (e) {
      }
      
      // 合并用户信息 - 优先使用数据库信息，如果没有则使用本地信息或默认值
      let userInfo = app.globalData.userInfo || {};
      
      // 如果数据库有用户信息，则优先使用
      if (userInfoFromDb) {
        userInfo = {
          ...userInfo,
          nickName: userInfoFromDb.nickName || userInfo.nickName || '玩家' + Math.floor(Math.random() * 900) + 100,
          avatarUrl: userInfoFromDb.avatarUrl || userInfo.avatarUrl || '/images/default-avatar.png'
        };
      } else {
        // 确保有默认的昵称和头像
        userInfo = {
          ...userInfo,
          nickName: userInfo.nickName || '玩家' + Math.floor(Math.random() * 900) + 100,
          avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
        };
      }
      
      // 更新全局用户信息
      app.globalData.userInfo = userInfo;

      // 添加用户到房间
      const newPlayer = {
        openId: openId,
        nickName: userInfo.nickName || '玩家',
        avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png', // 确保有默认头像
        score: 0,
        joinTime: new Date()
      };

      await wx.cloud.database().collection('rooms').doc(roomId).update({
        data: {
          players: wx.cloud.database().command.push(newPlayer)
        }
      });

      // 更新用户信息到数据库
      try {
        await wx.cloud.database().collection('users').doc(openId).update({
          data: {
            nickName: userInfo.nickName || '用户',
            avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
            lastActiveTime: new Date()
          }
        });
      } catch (error) {
        await wx.cloud.database().collection('users').add({
          data: {
            _id: openId,
            openId: openId,
            nickName: userInfo.nickName || '用户',
            avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
            gamemate: [],
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
            lastActiveTime: new Date()
          }
        });
      }

      // 获取更新后的房间数据
      const updatedRoomResult = await wx.cloud.database().collection('rooms').doc(roomId).get();
      
      // 确保玩家信息完整
      const updatedRoomData = updatedRoomResult.data;
      const currentPlayer = updatedRoomData.players.find(p => p.openId === openId);
      if (currentPlayer) {
        // 确保玩家头像和昵称不为空
        if (!currentPlayer.avatarUrl) {
          currentPlayer.avatarUrl = '/images/default-avatar.png';
        }
        if (!currentPlayer.nickName) {
          currentPlayer.nickName = '玩家' + Math.floor(Math.random() * 900) + 100;
        }
      }
      
      // 使用setData更新UI，确保正确显示用户信息
      this.setData({
        roomId: roomId,
        roomData: updatedRoomData,
        userInfo: userInfo // 同时更新页面用户信息
      });
      
      // 添加延迟确保UI正确刷新
      setTimeout(() => {
        // 检查是否存在台位/茶水玩家
        this.checkTeaServiceStatus(updatedRoomData);
        // 只有在还没有监听器的情况下才开始监听房间数据
        if (!this.watcher) {
          this.watchRoomData();
        }
      }, 100);
    } catch (error) {
      console.error('加入房间失败:', error);
      
      // 检查是否是因为房间状态为inactive导致的错误
      if (error.errMsg && (error.errMsg.includes('permission denied') || error.errMsg.includes('文档不存在'))) {
        try {
          const inactiveRoomResult = await wx.cloud.database().collection('rooms').doc(roomId).get();
          if (inactiveRoomResult.data && inactiveRoomResult.data.status === 'inactive') {
            goSettlementWithRoomId(inactiveRoomResult.data);
            return;
          }
        } catch (checkError) {
        }
        wx.showToast({
          title: '房间已删除',
          icon: 'none'
        });
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/home/home'
          });
        }, 1500);
        return;
      }
      
      // 检查是否是因为房间不存在导致的错误
      if (error.message && (error.message.includes('房间不存在') || error.message.includes('文档不存在'))) {
        wx.showToast({
          title: '房间已删除',
          icon: 'none'
        });
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/home/home'
          });
        }, 1500);
        return;
      }
      
      // 其他错误显示通用错误信息
      let errorMessage = '加入房间失败';
      if (error.message) {
        if (error.message.includes('房间已满')) {
          errorMessage = '房间已满（最多30人）';
        } else if (error.message.includes('权限') || error.message.includes('permission')) {
          errorMessage = '房间权限不足';
        } else {
          errorMessage = error.message;
        }
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 切换台位/茶水开关
   */
  async toggleTeaService() {
    try {
      const newState = !this.data.isTeaServiceEnabled;
      const roomId = this.data.roomId;
      if (!roomId) {
        return;
      }

      if (newState) {
        const teaServicePlayer = {
          nickName: '台位/茶水',
          avatarUrl: '/images/default-avatar.png',
          openId: 'tea_service_' + Date.now(),
          score: this.data.roomData.teaServiceScore || 0 // 恢复之前记忆的分数
        };

        await db.collection('rooms').doc(roomId).update({
          data: {
            players: db.command.push(teaServicePlayer),
            teaServiceScore: teaServicePlayer.score
          }
        });
        
        this.setData({
          isTeaServiceEnabled: true,
          teaServicePlayerId: teaServicePlayer.openId
        });
      } else {
        const roomResult = await db.collection('rooms').doc(roomId).get();
        const roomData = roomResult.data || {};
        const teaServicePlayer = (roomData.players || []).find(
          player => player.openId === this.data.teaServicePlayerId
        );
        const teaServiceScore = teaServicePlayer ? teaServicePlayer.score : 0;
        const teaServiceOpenId = teaServicePlayer ? teaServicePlayer.openId : this.data.teaServicePlayerId;
        const updateData = {
          teaServiceScore: teaServiceScore
        };
        if (teaServiceOpenId) {
          updateData.players = db.command.pull({ openId: teaServiceOpenId });
        }
        await db.collection('rooms').doc(roomId).update({
          data: updateData
        });
        
        this.setData({
          isTeaServiceEnabled: false,
          teaServicePlayerId: null
        });
      }
    } catch (error) {
      console.error('切换台位/茶水开关失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    }
  },

  /**
   * 检查台位/茶水玩家状态
   */
  async checkTeaServiceStatus(roomData) {
    if (!roomData || !roomData.players) return;
    
    // 查找台位/茶水玩家（通过nickName或openId前缀识别）
    const teaServicePlayer = roomData.players.find(player => 
      player.nickName === '台位/茶水' || player.openId.startsWith('tea_service_')
    );
    
    if (teaServicePlayer) {
      this.setData({
        isTeaServiceEnabled: true,
        teaServicePlayerId: teaServicePlayer.openId
      });
    } else {
      this.setData({
        isTeaServiceEnabled: false,
        teaServicePlayerId: null
      });
    }
  },

  /**
   * 监听房间数据变化
   */
  watchRoomData() {
    // 清除之前的监听
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    
    // 添加重试机制
    let retryCount = 0;
    const maxRetries = 3;
    
    const startWatcher = () => {
      const watcher = db.collection('rooms').doc(this.data.roomId).watch({
        onChange: async (snapshot) => {
          if (this.data.isExitingRoom) {
            return;
          }
          // 检查房间是否被删除或状态变为inactive（docs长度为0表示文档被删除）
          if (snapshot.docs.length === 0) {
            // 房间已被删除，直接跳转到结算页面
            wx.redirectTo({
              url: `/pages/settlement/settlement?roomClosed=true`
            });
            return;
          }
          
          // 检查房间状态是否为inactive
          if (snapshot.docs.length > 0 && snapshot.docs[0].status === 'inactive') {
            // 房间已结算，跳转到结算页面
            const roomData = snapshot.docs[0];
            wx.redirectTo({
              url: `/pages/settlement/settlement?data=${encodeURIComponent(JSON.stringify({
                roomId: roomData._id,
                roomNumber: roomData.roomNumber,
                players: roomData.players,
                rate: 1, // 默认倍率
                settlementTime: roomData.settlementTime
              }))}`
            });
            return;
          }
          
          if (snapshot.docs.length > 0) {
            const updatedRoomData = snapshot.docs[0];
            
            // 保存当前的transferModal状态，特别是targetPlayer
            // 这样在房间数据更新时，可以保留targetPlayer，避免给分弹窗状态丢失
            const currentTransferModal = this.data.transferModal;
            
            // 如果弹窗正在显示，确保保留targetPlayer和score状态
            if (currentTransferModal.show) {
              this.setData({
                roomData: updatedRoomData,
                'transferModal.targetPlayer': currentTransferModal.targetPlayer,
                'transferModal.score': currentTransferModal.score,
                'transferModal.focusTrigger': currentTransferModal.focusTrigger
              });
            } else {
              // 如果弹窗没有显示，可以重置transferModal
              this.setData({
                roomData: updatedRoomData
              });
            }
            
            // 检查台位/茶水状态
            await this.checkTeaServiceStatus(updatedRoomData);
          }
        },
        onError: async (error) => {
          if (this.data.isExitingRoom) {
            return;
          }
          console.error('监听房间数据失败:', error);
          
          // 统一处理房间已结算或已删除的情况
          const handleRoomInactive = async () => {
            try {
              // 尝试获取房间数据，检查状态
              const roomResult = await db.collection('rooms').doc(this.data.roomId).get();
              if (roomResult.data) {
                if (roomResult.data.status === 'inactive') {
                  // 房间已结算，跳转到结算页面
                  wx.redirectTo({
                    url: `/pages/settlement/settlement?data=${encodeURIComponent(JSON.stringify({
                      roomId: roomResult.data._id,
                      roomNumber: roomResult.data.roomNumber,
                      players: roomResult.data.players,
                      rate: 1, // 默认倍率
                      settlementTime: roomResult.data.settlementTime
                    }))}`
                  });
                  return true;
                }
              } else {
                // 房间不存在，跳转到结算页面
                wx.redirectTo({
                  url: `/pages/settlement/settlement?roomClosed=true`
                });
                return true;
              }
            } catch (checkError) {
              // 如果检查失败，假设房间已结算，跳转到结算页面
              wx.redirectTo({
                url: `/pages/settlement/settlement?roomClosed=true`
              });
              return true;
            }
            return false;
          };
          
          // 检查错误类型，统一处理房间已结算的情况
          if (error.errMsg && (
            error.errMsg.includes('document not exist') || 
            error.errMsg.includes('找不到该记录') ||
            error.errMsg.includes('permission denied') ||
            error.errMsg.includes('权限不足') ||
            error.errMsg.includes('document is deleted')
          )) {
            await handleRoomInactive();
            return;
          }
          
          // 添加重试机制
          if (retryCount < maxRetries) {
            retryCount++;
            // 延迟一段时间后重新启动监听器
            setTimeout(() => {
              if (this.watcher) {
                this.watcher.close();
              }
              startWatcher();
            }, 2000 * retryCount); // 递增延迟
          } else {
            // 重试次数用完，尝试最后检查一次房间状态
            const handled = await handleRoomInactive();
            if (!handled) {
              wx.showToast({
                title: '数据同步异常，请刷新页面',
                icon: 'none'
              });
            }
          }
        }
      });

      // 页面卸载时关闭监听
      this.watcher = watcher;
    };
    
    // 启动监听器
    startWatcher();
  },

  /**
   * 显示给分弹窗 - 优化版，提高响应速度
   */
  showTransferModal(e) {
    try {
      const { player } = e.currentTarget.dataset;
      
      // 不能给自己给分
      if (player && player.openId === this.data.currentUserOpenId) {
        wx.showToast({
          title: '不能给自己给分',
          icon: 'none'
        });
        return;
      }
      
      // 保存当前玩家的临时引用，确保在后续设置过程中不会丢失
      const tempPlayer = player;
      
      // 设置弹窗状态，先清空其他属性但保留targetPlayer
      this.setData({
        'transferModal.targetPlayer': tempPlayer,
        'transferModal.score': '',
        'transferModal.focusTrigger': false
      }, () => {
        // 显示弹窗
        this.setData({
          'transferModal.show': true
        }, () => {
          // 延迟聚焦输入框
          setTimeout(() => {
            this.setData({
              'transferModal.focusTrigger': true
            });
          }, 200);
        });
      });
    } catch (error) {
      console.error('显示给分弹窗失败:', error);
    }
  },

  /**
   * 隐藏给分弹窗
   */
  hideTransferModal() {
    // 检查是否真的需要隐藏弹窗
    if (!this.data.transferModal.show) {
      return;
    }
    if (this.data.isTransferring) {
      return;
    }
    
    // 仅在用户主动点击取消或关闭按钮时清空targetPlayer
    const currentStack = new Error().stack;
    // 检查调用栈中是否有"取消"按钮或"×"按钮的事件监听器
    const isUserInitiatedCancel = currentStack.includes('hideTransferModal@') && 
                                 (currentStack.includes('cancel') || 
                                  currentStack.includes('close') ||
                                  currentStack.includes('modal-close'));
    
    // 如果不是用户主动取消，保持targetPlayer状态
    if (!isUserInitiatedCancel) {
      this.setData({
        'transferModal.show': false,
        'transferModal.score': '',
        'transferModal.focusTrigger': false
      });
    } else {
      // 如果是用户主动取消，清空所有状态
      this.setData({
        'transferModal.show': false,
        'transferModal.targetPlayer': null,
        'transferModal.score': '',
        'transferModal.focusTrigger': false
      });
    }
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
    const { targetPlayer, score } = this.data.transferModal;
    if (this.data.isTransferring) {
      return;
    }
    
    // 检查目标玩家是否有效
    if (!targetPlayer) {
      wx.showToast({
        title: '请选择要给分的玩家',
        icon: 'none'
      });
      return;
    }
    
    // 检查目标玩家ID是否有效
    if (!targetPlayer.openId) {
      wx.showToast({
        title: '玩家信息不完整，请重新选择',
        icon: 'none'
      });
      return;
    }
    
    const parsedScore = parseInt(score, 10);
    if (!parsedScore || parsedScore <= 0) {
      wx.showToast({
        title: '请输入有效分数',
        icon: 'none'
      });
      return;
    }

    // 显示加载提示
    wx.showLoading({
      title: '处理中...',
      mask: true
    });
    this.setData({ isTransferring: true });

    try {
      let result;
      let attempt = 0;
      const maxAttempts = 5;
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          result = await wx.cloud.callFunction({
            name: 'transferScore',
            data: {
              roomId: this.data.roomId,
              toPlayerOpenId: targetPlayer.openId,
              score: parsedScore
            }
          });
          break;
        } catch (error) {
          if (attempt >= maxAttempts) {
            throw error;
          }
          // 指数退避，降低连续失败时的瞬时压力
          const delay = 200 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (result && result.result && result.result.success) {
        wx.showToast({
          title: '给分成功',
          icon: 'success'
        });
        wx.hideKeyboard();
        this.setData({
          'transferModal.show': false,
          'transferModal.score': '',
          'transferModal.focusTrigger': false
        });
        // 给分成功后主动刷新房间数据
        await this.refreshRoomDataAfterTransfer();
      } else {
        const errorMessage = result && result.result && result.result.error ? result.result.error : '给分失败，请重试';
        wx.showToast({
          title: errorMessage,
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('给分失败:', error);
      
      wx.showToast({
        title: '给分失败，请重试',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
      this.setData({ isTransferring: false });
    }
  },

  /**
   * 给分成功后刷新房间数据
   */
  async refreshRoomDataAfterTransfer(retryCount = 0) {
    try {
      // 延迟一小段时间确保数据库更新完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 保存当前的transferModal状态，特别是targetPlayer
      // 这样在刷新房间数据后，可以保留targetPlayer，避免给分弹窗状态丢失
      const currentTransferModal = this.data.transferModal;
      
      // 如果弹窗正在显示，保留完整的transferModal状态
      let modalStateToRestore = {};
      if (currentTransferModal.show) {
        modalStateToRestore = {
          'transferModal.targetPlayer': currentTransferModal.targetPlayer,
          'transferModal.score': currentTransferModal.score,
          'transferModal.focusTrigger': currentTransferModal.focusTrigger
        };
      }
      
      // 获取最新的房间数据
      const result = await db.collection('rooms').doc(this.data.roomId).get();
      
      if (result.data) {
        // 更新房间数据，并保留transferModal状态
        this.setData({
          roomData: result.data,
          ...modalStateToRestore
        });
      }
    } catch (error) {
      console.error('刷新房间数据失败:', error);
      // 最多重试3次
      if (retryCount < 3) {
        // 清除之前的定时器（如果有的话）
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
        }
        // 设置1秒后重试
        this.retryTimer = setTimeout(() => {
          this.refreshRoomDataAfterTransfer(retryCount + 1);
        }, 1000);
      }
    }
  },

  /**
   * 分享房间
   */
  onShareAppMessage() {
    return {
      title: `房间 ${this.data.roomData?.roomNumber || this.data.roomId} - 可乐计分器`,
      path: `/pages/room/room?roomId=${this.data.roomId}`,
      imageUrl: '/images/小程序码.jpg'
    };
  },

  /**
   * 分享房间到朋友圈
   */
  onShareTimeline() {
    return {
      title: `房间 ${this.data.roomData?.roomNumber || this.data.roomId} - 可乐计分器`,
      imageUrl: '/images/小程序码.jpg'
    };
  },

  /**
   * 生成房间ID
   * @returns {string} 房间ID
   */
  generateRoomId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 6);
    return `${timestamp}${random}`.toUpperCase();
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
   * 跳转到给分详情页面
   */
  navigateToScoreDetails() {
    if (!this.data.roomId || !this.data.roomData) {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/score-details/score-details?roomId=${this.data.roomId}&roomNumber=${this.data.roomData.roomNumber || ''}`
    });
  },

  /**
   * 退出房间
   */
  async exitRoom() {
    if (!this.data.roomId || !this.data.roomData) {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      });
      return;
    }

    if (this.data.isSettling) {
      wx.showToast({
        title: '结算进行中，暂时无法退出',
        icon: 'none'
      });
      return;
    }

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '退出房间',
        content: '确定要退出当前房间吗？',
        confirmText: '退出',
        cancelText: '取消',
        success: (res) => {
          resolve(res.confirm);
        },
        fail: () => {
          resolve(false);
        }
      });
    });

    if (!confirm) {
      return;
    }

    this.setData({
      isExitingRoom: true
    });

    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (e) {
      }
      this.watcher = null;
    }

    try {
      wx.showLoading({
        title: '正在退出...',
        mask: true
      });

      const roomId = this.data.roomId;
      const currentUserOpenId = this.data.currentUserOpenId;

      const roomDoc = await db.collection('rooms').doc(roomId).get();
      const room = roomDoc.data;

      if (!room || !Array.isArray(room.players)) {
        wx.hideLoading();
        wx.switchTab({
          url: '/pages/home/home'
        });
        return;
      }

      const isTeaServicePlayer = (player) =>
        player.nickName === '台位/茶水' || (typeof player.openId === 'string' && player.openId.startsWith('tea_service_'));

      const realPlayers = room.players.filter((p) => !isTeaServicePlayer(p));

      const stillInRoom = realPlayers.some((p) => p.openId === currentUserOpenId);

      if (!stillInRoom) {
        wx.hideLoading();
        wx.switchTab({
          url: '/pages/home/home'
        });
        return;
      }

      if (realPlayers.length <= 1) {
        try {
          await db.collection('rooms').doc(roomId).remove();
        } catch (removeError) {
          console.error('删除房间失败:', removeError);
          wx.hideLoading();
          wx.showToast({
            title: '退出房间失败，请重试',
            icon: 'none'
          });
          return;
        }
      } else {
        const updatedPlayers = room.players.filter((p) => p.openId !== currentUserOpenId);
        try {
          await db.collection('rooms').doc(roomId).update({
            data: {
              players: updatedPlayers
            }
          });
        } catch (updateError) {
          console.error('更新房间玩家失败:', updateError);
          wx.hideLoading();
          wx.showToast({
            title: '退出房间失败，请重试',
            icon: 'none'
          });
          return;
        }
      }

      wx.hideLoading();

      try {
        const pages = getCurrentPages();
        for (const page of pages) {
          if (page.route === 'pages/home/home' && typeof page.checkActiveRoom === 'function') {
            page.checkActiveRoom();
            break;
          }
        }
      } catch (e) {
      }

      wx.switchTab({
        url: '/pages/home/home'
      });
    } catch (error) {
      console.error('退出房间失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '退出房间失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({
        isExitingRoom: false
      });
    }
  },

  /**
   * 显示结算弹窗
   */
  showSettlementModal() {
    if (!this.data.roomId || !this.data.roomData) {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      });
      return;
    }

    this.setData({
      'settlementModal.show': true,
      'settlementModal.rate': '1'
    });
  },

  /**
   * 隐藏结算弹窗
   */
  hideSettlementModal() {
    this.setData({
      'settlementModal.show': false,
      'settlementModal.rate': '1'
    });
  },

  /**
   * 处理倍率输入
   */
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

  /**
   * 确认结算
   */
  async confirmSettlement() {
    try {
      const { rate } = this.data.settlementModal;
      
      // 防重复结算检查
      if (this.data.isSettling) {
        wx.showToast({
          title: '结算正在进行中...',
          icon: 'none'
        });
        return;
      }
      
      // 设置结算状态为进行中
      this.setData({ isSettling: true });
      
      // 验证倍率输入
      let rateValue = parseFloat(rate);
      if (!rate || isNaN(rateValue) || rateValue <= 0) {
        this.setData({ isSettling: false });
        wx.showToast({
          title: '请输入有效倍率',
          icon: 'none'
        });
        return;
      }

      // 准备结算数据
      const settlementData = {
        roomId: this.data.roomId,
        roomNumber: this.data.roomData.roomNumber,
        createTime: this.data.roomData.createTime,
        settlementTime: new Date(),
        players: this.data.roomData.players,
        rate: rateValue,
        teaServiceScore: this.data.roomData.teaServiceScore || 0
      };

      // 显示加载提示
      wx.showLoading({
        title: '正在结算...',
        mask: true
      });

      // 记录游戏结算数据到用户个人数据
      await this.recordGameResults(settlementData);
      
      // 2. 隐藏结算弹窗
      this.hideSettlementModal();
      
      // 3. 结算核心操作：将房间状态更新为inactive，并添加结算时间标记
      try {
      await db.collection('rooms').doc(this.data.roomId).update({
        data: {
          closeTime: new Date(),
          status: 'inactive', // 将房间状态设置为inactive，通知所有用户跳转到结算页面
          settlementTime: new Date() // 添加结算时间标记
        }
      });
      } catch (roomError) {
        console.error('处理房间状态失败:', roomError);
        // 继续执行后续操作，不影响结算流程
      }
      
      wx.hideLoading();
      
      // 2. 跳转到结算页面（先跳转，确保数据传递成功）
      wx.redirectTo({
        url: `/pages/settlement/settlement?data=${encodeURIComponent(JSON.stringify({
            roomId: settlementData.roomId,
            roomName: settlementData.roomName,
            players: settlementData.players,
            rate: settlementData.rate,
            settlementTime: settlementData.settlementTime // 传递结算时间用于验证
          }))}`,
          success: () => {
            // 移除立即删除房间的逻辑，改为在room页面onShow时检查是否需要删除
          },
          fail: (redirectError) => {
            console.error('跳转结算页面失败:', redirectError);
            // 如果跳转失败，尝试使用reLaunch强制跳转
            wx.reLaunch({
              url: `/pages/settlement/settlement?data=${encodeURIComponent(JSON.stringify({
                roomId: settlementData.roomId,
                roomName: settlementData.roomName,
                players: settlementData.players,
                rate: settlementData.rate,
                settlementTime: settlementData.settlementTime // 传递结算时间用于验证
              }))}`,
              success: () => {
                // 移除立即删除房间的逻辑
              }
            });
          }
      });
    } catch (error) {
      console.error('结算操作失败:', error);
      this.setData({ isSettling: false }); // 重置结算状态
      
      // 根据不同错误类型显示不同提示
      if (error.errMsg && error.errMsg.includes('document.remove')) {
        wx.showToast({
          title: '删除房间记录失败',
          icon: 'error'
        });
      } else {
        wx.showToast({
          title: '结算失败，请重试',
          icon: 'error'
        });
      }
    } finally {
      // 确保在任何情况下都重置结算状态
      setTimeout(() => {
        this.setData({ isSettling: false });
      }, 2000);
    }
  },

  /**
   * 监听用户点击左上角返回按钮的事件
   */
  onBackPress() {
    // 返回主页而不是直接退出小程序
    wx.switchTab({
      url: '/pages/home/home'
    });
    return true; // 阻止默认返回行为
  },

  /**
   * 记录游戏结算数据到所有参与者个人数据
   */
  async recordGameResults(settlementData) {
    try {
      const db = wx.cloud.database();
      
      // 验证数据库连接
      
      // 处理每个玩家的结算数据
      const playerResults = settlementData.players.map(player => {
        const finalScore = (player.score || 0) * settlementData.rate;
        let result = '平局';
        if (finalScore > 0) {
          result = '胜利';
        } else if (finalScore < 0) {
          result = '失败';
        }
        
        return {
          openId: player.openId,
          nickName: player.nickName || '玩家',
          score: player.score || 0,
          finalScore: finalScore,
          result: result
        };
      });
      
      // 为每个参与者更新数据
      for (const playerResult of playerResults) {
        
        // 检查是否为茶水玩家（茶水玩家不需要创建或更新用户记录）
        const isTeaServicePlayer = playerResult.nickName === '台位/茶水' || playerResult.openId.startsWith('tea_service_');
        
        if (isTeaServicePlayer) {
          continue; // 跳过茶水玩家，处理下一个玩家
        }
        
        try {
          // 获取同房间其他玩家的openid（排除当前玩家和茶位/茶水玩家）
          const gamemates = playerResults
            .filter(p => p.openId !== playerResult.openId && 
                       p.nickName !== '台位/茶水' && 
                       !p.openId.startsWith('tea_service_'))
            .map(p => ({
              openId: p.openId,
              gameCount: 1 // 新增对局计数字段
            }));
          
          // 获取用户当前数据
          let currentUserData = {};
          try {
            const userDoc = await db.collection('users').doc(playerResult.openId).get();
            currentUserData = userDoc.data || {};
            // 从正确的数据结构获取最新统计数据
            let latestStats;
            if (currentUserData.statistics) {
              // 新的数据结构：直接从根级别获取statistics
              latestStats = currentUserData.statistics;
            } else if (currentUserData.gamedata && !Array.isArray(currentUserData.gamedata) && currentUserData.gamedata.statistics) {
              // 过渡数据结构：从gamedata对象获取statistics
              latestStats = currentUserData.gamedata.statistics;
            } else {
              // 旧数据结构：从gamedata数组最后一个元素获取statistics
              const latestGameData = currentUserData.gamedata && currentUserData.gamedata.length > 0 
                ? currentUserData.gamedata[currentUserData.gamedata.length - 1] 
                : {};
              latestStats = latestGameData.statistics || {};
            }
          } catch (userError) {
            
            // 如果用户不存在，创建新的用户记录
            const newUserData = {
              _id: playerResult.openId,
              openId: playerResult.openId,
              nickName: playerResult.nickName || '玩家',
              avatarUrl: '',
              gamemate: [],
              gamedata: [],
              statistics: {
                totalGames: 0,
                totalScore: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                winRate: 0,
                netScore: 0
              },
              lastActiveTime: new Date(),
              createdAt: new Date(),
              fromDatabase: true,
              largeTextEnabled: false
            };
            
            // 创建用户记录
            try {
              await db.collection('users').add({
                data: newUserData
              });
            } catch (createError) {
              console.error(`创建用户记录失败:`, createError);
              // 跳过这个用户，继续处理其他玩家
              continue;
            }
            
            // 重新获取用户数据
            currentUserData = newUserData;
          }
          
          // 计算更新后的统计数据
          // 检查是否为新数据结构（包含根级别的statistics）
          let currentStats;
          if (currentUserData.statistics) {
            // 新的数据结构：直接从根级别获取statistics
            currentStats = currentUserData.statistics;
          } else if (currentUserData.gamedata && !Array.isArray(currentUserData.gamedata) && currentUserData.gamedata.statistics) {
            // 过渡数据结构：从gamedata对象获取statistics
            currentStats = currentUserData.gamedata.statistics;
          } else {
            // 旧数据结构：从gamedata数组最后一个元素获取statistics
            const latestGameData = currentUserData.gamedata && currentUserData.gamedata.length > 0 
              ? currentUserData.gamedata[currentUserData.gamedata.length - 1] 
              : {};
            currentStats = latestGameData.statistics || {
              totalGames: 0,
              totalScore: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              winRate: 0,
              netScore: 0
            };
          }
          
          // 计算新的统计数据
          const totalGames = currentStats.totalGames + 1;
          const totalScore = currentStats.totalScore + playerResult.finalScore;
          
          // 统计胜负平数据
          const wins = currentStats.wins + (playerResult.result === '胜利' ? 1 : 0);
          const losses = currentStats.losses + (playerResult.result === '失败' ? 1 : 0);
          const draws = currentStats.draws + (playerResult.result === '平局' ? 1 : 0);
          const winRate = totalGames > 0 ? wins / totalGames : 0;
          const netScore = totalScore; // 净胜分等于总分
          
          // 处理gamemate数据，合并对局计数
          const currentGamemates = currentUserData.gamemate || [];
          const updatedGamemates = [...currentGamemates];
          
          // 更新或添加gamemate信息
          for (const gamemate of gamemates) {
            const existingIndex = updatedGamemates.findIndex(g => g.openId === gamemate.openId);
            if (existingIndex >= 0) {
              // 已存在，增加对局计数
              updatedGamemates[existingIndex].gameCount = 
                (updatedGamemates[existingIndex].gameCount || 0) + gamemate.gameCount;
            } else {
              // 不存在，添加新记录
              updatedGamemates.push(gamemate);
            }
          }
          
          // 创建精简的历史结算记录（只记录当前用户信息）
          const settlementRecord = {
            totalGames: 1, // 总局数
            roomId: settlementData.roomId,
            roomNumber: settlementData.roomNumber,
            settlementTime: settlementData.settlementTime,
            rate: settlementData.rate,
            // 当前用户的得分信息
            myScore: playerResult.score || 0,
            myFinalScore: playerResult.finalScore,
            myResult: playerResult.result,
            // 同局人信息
            gamemates: playerResults
              .filter(p => p.openId !== playerResult.openId && 
                         p.nickName !== '台位/茶水' && 
                         !p.openId.startsWith('tea_service_'))
              .map(p => ({
                nickName: p.nickName,
                score: p.score || 0,
                result: p.result,
                finalScore: p.finalScore
              }))
          };
          
          // 创建gamedata记录，包含游戏结算信息（不包含statistics）
          const gameDataRecord = {
            // gameId: settlementData.roomId, // 移除gameId字段，不需要保存在数据库中
            roomNumber: settlementData.roomNumber,
            endTime: settlementData.settlementTime,
            rate: settlementData.rate,
            myScore: playerResult.score || 0,
            myFinalScore: playerResult.finalScore,
            myResult: playerResult.result,
            players: playerResults
              .map(p => ({
                openId: p.openId,
                nickName: p.nickName,
                score: p.score || 0,
                finalScore: p.finalScore,
                result: p.result
              }))
            // 移除了statistics字段，统计数据现在存储在根级别
          };
          
          // 创建新的gamedata结构（直接使用数组）
          let newGameData = [];
          
          // 检查现有数据结构类型
          const currentGamedata = currentUserData.gamedata;
          
          if (!currentGamedata) {
            // 旧用户完全没有gamedata字段
            newGameData = [gameDataRecord];
          } else if (Array.isArray(currentGamedata)) {
            // 已有数组结构，添加新记录
            newGameData = [...currentGamedata, gameDataRecord];
          } else {
            // 旧对象结构，需要转换到数组
            let existingRecords = [];
            if (currentGamedata && typeof currentGamedata === 'object' && !Array.isArray(currentGamedata)) {
              if (Array.isArray(currentGamedata.records)) {
                // 旧对象结构，包含records数组
                existingRecords = currentGamedata.records;
              } else {
                // 旧对象结构，不包含records数组，可能是单个游戏记录对象
                // 保留该对象作为一条记录
                existingRecords = [currentGamedata];
              }
            }
            newGameData = [...existingRecords, gameDataRecord];
          }
          
          // 准备更新数据
          let updateResult;
          try {
            // 先验证数据库操作
            if (!playerResult.openId || typeof playerResult.openId !== 'string') {
              throw new Error(`无效的用户openId: ${playerResult.openId}`);
            }
            
            // 统一使用update操作更新数据库，包含统计数据
            updateResult = await db.collection('users').doc(playerResult.openId).update({
              data: {
                gamemate: updatedGamemates, // 更新gamemate数组（包含对局计数）
                gamedata: newGameData, // 将新的游戏数据数组存储到gamedata字段中
                statistics: { // 更新根级别的统计数据
                  totalGames,
                  totalScore,
                  wins,
                  losses,
                  draws,
                  winRate,
                  netScore
                },
                lastActiveTime: new Date()
              }
            });
            
            // 验证更新结果
            if (!updateResult) {
              throw new Error('数据库更新返回空结果');
            }
            
          } catch (updateError) {
            console.error(`❌ 数据库更新失败 - ${playerResult.nickName}:`, {
              openId: playerResult.openId,
              errorCode: updateError.code,
              errorMessage: updateError.message,
              errorStack: updateError.stack,
              updateDataStructure: {
                gamemateCount: updatedGamemates ? updatedGamemates.length : 0,
                recordsCount: newGameData.length
              }
            });
            throw new Error(`用户 ${playerResult.nickName} 数据更新失败: ${updateError.message}`); // 抛出新错误
          }
        } catch (playerError) {
          console.error(`=== 更新玩家 ${playerResult.nickName} (${playerResult.openId}) 数据失败 ===`, {
            error: playerError,
            stack: playerError.stack || 'no stack info',
            code: playerError.code || 'unknown code',
            message: playerError.message || 'unknown message'
          });
          // 继续处理其他玩家，不中断流程
        } finally {
        }
      }
      
      
    } catch (error) {
      console.error('记录游戏结算数据失败:', error);
      // 不影响主流程，只记录错误
    }
  },

  /**
   * 页面卸载时清除监听器和定时器
   */
  onUnload() {
    // 关闭数据库监听
    if (this.watcher) {
      this.watcher.close();
    }
    
    // 清理可能存在的定时器
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    
    // 通知home页面刷新活跃房间状态
    try {
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel && typeof eventChannel.emit === 'function') {
        eventChannel.emit('roomUpdated');
      }
    } catch (error) {
      console.error('通知home页面刷新活跃房间失败:', error);
    }
  }
});
