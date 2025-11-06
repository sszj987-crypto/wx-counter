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
  async onLoad(options) {
    console.log('房间页面加载，参数:', options);
    const { roomId, mode } = options;
    const app = getApp();
    
    // 先获取最新用户信息
    await this.updateUserInfoFromDatabase();
    
    // 然后处理房间逻辑
    if (mode === 'create') {
      console.log('创建房间模式');
      this.createRoom();
    } else if (roomId) {
      console.log('加入房间模式，房间ID:', roomId);
      this.joinRoom(roomId);
    } else {
      console.log('房间信息错误');
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
          updatedRoomData.players[currentPlayerIndex] = {
            ...updatedRoomData.players[currentPlayerIndex],
            nickName: this.data.userInfo.nickName,
            avatarUrl: this.data.userInfo.avatarUrl
          };
          
          // 更新数据库中的玩家信息
          await db.collection('rooms').doc(this.data.roomId).update({
            data: {
              players: updatedRoomData.players
            }
          });
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
          console.log('从数据库获取到最新用户信息:', userDoc.data);
          // 更新用户信息
          userInfo = {
            nickName: userDoc.data.nickName || '玩家',
            avatarUrl: userDoc.data.avatarUrl || '/images/default-avatar.png'
          };
          // 更新全局用户信息
          app.globalData.userInfo = userInfo;
        }
      } catch (dbError) {
        console.log('从数据库获取用户信息失败，使用本地信息', dbError);
      }
      
      // 如果仍然没有用户信息，生成默认信息
      if (!userInfo.nickName) {
        console.log('没有用户信息，生成默认信息');
        userInfo = {
          nickName: '玩家' + Math.floor(Math.random() * 900) + 100,
          avatarUrl: '/images/default-avatar.png'
        };
        app.globalData.userInfo = userInfo;
      }
      
      console.log('最终用户信息:', userInfo);
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
    console.log('开始创建房间');
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
      console.log('当前用户openId:', openId);
      
      // 检查用户已创建的房间数量
      try {
        const db = wx.cloud.database()
        const result = await db.collection('rooms')
          .where({
            _openid: openId
          })
          .get()
          
        console.log('用户已创建的房间数量:', result.data.length)
        
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
      console.log('生成的房间ID:', roomId);
      
      // 生成房间编号（纯数字）
      const roomNumber = Math.floor(Math.random() * 9000) + 1000;
      
      // 房间数据
      const roomData = {
        _id: roomId,
        _openid: openId, // 使用_openid替代creatorOpenId
        roomNumber: roomNumber,
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
      console.log('房间数据:', roomData);

      // 创建房间
      console.log('开始创建房间到数据库');
      await wx.cloud.database().collection('rooms').add({
        data: roomData
      });
      console.log('房间创建成功');

      // 更新用户信息
      console.log('开始更新用户信息');
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
        });
        console.log('用户信息更新成功');
      } catch (error) {
        console.log('用户信息更新失败，尝试创建新用户:', error);
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
        });
        console.log('新用户创建成功');
      }

      console.log('房间创建成功，房间ID:', roomId, '房间数据:', roomData);
      this.setData({
        roomId: roomId,
        roomData: roomData,
        isCreating: false
      });
      
      // 通知home页面刷新活跃房间状态
      const pages = getCurrentPages();
      const homePage = pages.find(page => page.route === 'pages/home/home');
      if (homePage) {
        console.log('通知home页面刷新活跃房间');
        // 如果home页面已经注册了roomCreated事件，触发该事件
        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel) {
          eventChannel.emit('roomCreated');
        }
      }
      
      // 清除所有房间二维码缓存（创建新房间后）
      const app = getApp();
      const cacheManager = app.globalData.cacheManager;
      cacheManager.clearAllRoomQRCodes();
      
      // 生成小程序码
      this.generateQRCode().then(() => {
        // 自动显示二维码弹窗
        this.showQRCodeModal();
      });
      
      // 生成小程序码（加入房间时不自动显示弹窗）
      this.generateQRCode();
      
      // 检查台位状态
      await this.checkTeaServiceStatus(roomData);
      
      // 开始监听房间数据
      this.watchRoomData();
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
        console.log('通过云函数获取用户openId:', openId);
      } else {
        console.log('使用缓存的用户openId:', openId);
      }
      
      // 更新currentUserOpenId
      this.setData({
        currentUserOpenId: openId
      });

      // 查找房间
      console.log('查找房间，房间ID:', roomId);
      const roomResult = await wx.cloud.database().collection('rooms').doc(roomId).get();
      
      if (!roomResult.data) {
        throw new Error('房间不存在');
      }

      const room = roomResult.data;
      console.log('找到房间:', room);



      // 检查房间人数限制
      if (room.players.length >= 30) {
        throw new Error('房间已满（最多30人）');
      }

      // 检查用户是否已在房间中
      const existingPlayer = room.players.find(player => player.openId === openId);
      if (existingPlayer) {
        console.log('用户已在房间中');
        this.setData({
          roomId: roomId,
          roomData: room
        });
        // 检查是否存在台位/茶水玩家
        await this.checkTeaServiceStatus(room);
        this.watchRoomData();
        return;
      }
      
      // 确保用户信息完整 - 解决邀请加入房间后图标名字不显示的问题
      // 先尝试从数据库获取用户信息
      let userInfoFromDb = null;
      try {
        const userResult = await wx.cloud.database().collection('users').doc(openId).get();
        userInfoFromDb = userResult.data;
        console.log('从数据库获取的用户信息:', userInfoFromDb);
      } catch (e) {
        console.log('数据库中未找到用户信息:', e);
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
      console.log('合并后的用户信息:', userInfo);

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
        await wx.cloud.database().collection('users').doc(openId).set({
          data: {
            openId: openId,
            nickName: userInfo.nickName || '用户',
            avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
            totalGames: 0,
            totalScore: 0,
            lastActiveTime: new Date()
          }
        });
      } catch (error) {
        console.log('用户信息更新失败，尝试创建新用户:', error);
        await wx.cloud.database().collection('users').add({
          data: {
            _id: openId,
            openId: openId,
            nickName: userInfo.nickName || '用户',
            avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
            totalGames: 0,
            totalScore: 0,
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
        // 开始监听房间数据
        this.watchRoomData();
      }, 100);
    } catch (error) {
      console.error('加入房间失败:', error);
      wx.showToast({
        title: '加入房间失败',
        icon: 'error'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 生成小程序码 - 简化实现，直接使用本地默认图片
   * @returns {Promise} 操作完成的Promise
   */
  generateQRCode() {
    return new Promise((resolve) => {
      try {
        // 如果没有roomId，不执行生成
        if (!this.data.roomId) {
          console.error('房间ID未设置');
          wx.showToast({
            title: '房间ID未设置，无法生成二维码',
            icon: 'none'
          });
          resolve(false);
          return;
        }
        
        // 直接使用本地默认二维码图片作为解决方案
        this.setData({
          qrcodeUrl: '/images/小程序码.jpg',
          // 存储房间ID，用于在弹窗中显示
          currentRoomId: this.data.roomId
        });
        
        console.log('使用本地默认二维码图片');
        resolve(true);
        
      } catch (error) {
        console.error('生成小程序码失败:', error);
        // 出错时使用默认图片
        this.setData({
          qrcodeUrl: '/images/小程序码.jpg',
          currentRoomId: this.data.roomId || ''
        });
        wx.showToast({
          title: '二维码生成失败，显示备用图片',
          icon: 'none'
        });
        resolve(false);
      }
    });
  },

  /**
   * 显示二维码弹窗 - 修复版，添加详细的错误处理
   */
  async showQRCodeModal() {
    try {
      // 尝试从缓存获取二维码
      const app = getApp();
      const cacheManager = app.globalData.cacheManager;
      let qrcodeUrl = cacheManager.getRoomQRCode(this.data.roomId);
      
      if (!qrcodeUrl) {
        // 缓存中没有二维码，调用云函数生成
        wx.showLoading({
          title: '生成房间二维码...',
        });
        
        // 调用云函数生成房间二维码
        const result = await wx.cloud.callFunction({
          name: 'generateQRCode',
          data: {
            roomId: this.data.roomId
          }
        });
        
        wx.hideLoading();
        
        // 详细检查返回结果
        if (result && result.result) {
          if (result.result.success) {
            qrcodeUrl = result.result.qrcodeUrl;
            // 将二维码存入缓存
            cacheManager.setRoomQRCode(this.data.roomId, qrcodeUrl);
            console.log('通过云函数生成房间二维码');
          } else {
            // 使用云函数返回的详细错误信息
            throw new Error(result.result.error || '生成房间二维码失败');
          }
        } else {
          throw new Error('云函数调用失败，未返回预期结果');
        }
      } else {
        console.log('使用缓存的房间二维码');
      }
      
      // 更新二维码URL并显示弹窗
      this.setData({
        qrcodeUrl: qrcodeUrl,
        currentRoomId: this.data.roomId,
        'qrcodeModal.show': true,
        // 开发环境提示信息
        qrcodeEnvironmentInfo: '开发环境中，二维码会先跳转至首页再自动转跳至房间页面'
      });
    } catch (error) {
      wx.hideLoading();
      console.error('生成房间二维码失败:', error);
      
      // 提供详细的错误信息，特别是针对41030（页面路径无效）错误
      let errorMessage = '生成二维码失败';
      if (error && error.errCode === 41030) {
        errorMessage = '页面路径无效，请检查页面配置或确认已发布';
      } else if (error && error.errCode === -604101) {
        errorMessage = '权限错误，请重新部署云函数并检查权限配置';
      } else if (error && error.message) {
        errorMessage = error.message;
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000 // 增加显示时间，让用户有足够时间阅读详细错误
      });
    }
  },

  /**
   * 隐藏二维码弹窗
   */
  hideQRCodeModal() {
    this.setData({
      'qrcodeModal.show': false
    });
  },

  /**
   * 切换台位/茶水开关
   */
  async toggleTeaService() {
    try {
      const newState = !this.data.isTeaServiceEnabled;
      
      if (newState) {
        // 打开开关，添加台位/茶水玩家
        const teaServicePlayer = {
          nickName: '台位/茶水',
          avatarUrl: '/images/default-avatar.png',
          openId: 'tea_service_' + Date.now(),
          score: this.data.roomData.teaServiceScore || 0 // 恢复之前记忆的分数
        };
        
        const players = [...this.data.roomData.players, teaServicePlayer];
        
        await db.collection('rooms').doc(this.data.roomId).update({
          data: {
            players: players
          }
        });
        
        this.setData({
          isTeaServiceEnabled: true,
          teaServicePlayerId: teaServicePlayer.openId
        });
      } else {
        // 关闭开关，先保存当前台位分数，再移除台位/茶水玩家
        const teaServicePlayer = this.data.roomData.players.find(
          player => player.openId === this.data.teaServicePlayerId
        );
        
        // 记忆当前台位分数
        const teaServiceScore = teaServicePlayer ? teaServicePlayer.score : 0;
        
        const players = this.data.roomData.players.filter(
          player => player.openId !== this.data.teaServicePlayerId
        );
        
        await db.collection('rooms').doc(this.data.roomId).update({
          data: {
            players: players,
            teaServiceScore: teaServiceScore // 保存分数到房间数据中
          }
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
    
    // 初始化teaServiceScore字段（如果不存在）
    if (roomData.teaServiceScore === undefined) {
      try {
        await db.collection('rooms').doc(this.data.roomId).update({
          data: {
            teaServiceScore: 0
          }
        });
      } catch (error) {
        console.error('初始化台位分数字段失败:', error);
      }
    }
    
    // 查找台位/茶水玩家（通过nickName或openId前缀识别）
    const teaServicePlayer = roomData.players.find(player => 
      player.nickName === '台位/茶水' || player.openId.startsWith('tea_service_')
    );
    
    if (teaServicePlayer) {
      console.log('检测到台位/茶水玩家');
      this.setData({
        isTeaServiceEnabled: true,
        teaServicePlayerId: teaServicePlayer.openId
      });
      
      // 确保teaServiceScore与台位玩家当前分数同步
      if (teaServicePlayer.score !== roomData.teaServiceScore) {
        try {
          await db.collection('rooms').doc(this.data.roomId).update({
            data: {
              teaServiceScore: teaServicePlayer.score
            }
          });
        } catch (error) {
          console.error('同步台位分数失败:', error);
        }
      }
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
    
    const watcher = db.collection('rooms').doc(this.data.roomId).watch({
      onChange: async (snapshot) => {
        console.log('房间数据更新:', snapshot.docs);
        
        // 检查房间是否被删除（docs长度为0表示文档被删除）
        if (snapshot.docs.length === 0) {
          console.log('房间已被结算删除');
          // 房间已被删除，直接跳转到结算页面
          wx.redirectTo({
            url: `/pages/settlement/settlement?roomClosed=true`
          });
          return;
        }
        
        if (snapshot.docs.length > 0) {
          const updatedRoomData = snapshot.docs[0];
          this.setData({
            roomData: updatedRoomData
          });
          // 检查台位/茶水状态
          await this.checkTeaServiceStatus(updatedRoomData);
          
          // 如果台位/茶水玩家存在，且分数发生变化，同步更新teaServiceScore
          if (updatedRoomData.isTeaServiceEnabled || this.data.isTeaServiceEnabled) {
            const teaServicePlayer = updatedRoomData.players.find(
              player => player.nickName === '台位/茶水' || player.openId.startsWith('tea_service_')
            );
            
            if (teaServicePlayer && teaServicePlayer.score !== updatedRoomData.teaServiceScore) {
              try {
                await db.collection('rooms').doc(this.data.roomId).update({
                  data: {
                    teaServiceScore: teaServicePlayer.score
                  }
                });
              } catch (error) {
                console.error('同步台位分数失败:', error);
              }
            }
          }
        }
      },
      onError: async (error) => {
        console.error('监听房间数据失败:', error);
        // 检查错误类型，如果是因为房间不存在导致的错误，可能是房间已被删除
        if (error.errMsg && (error.errMsg.includes('document not exist') || error.errMsg.includes('找不到该记录'))) {
          console.log('房间可能已被结算删除');
          // 房间不存在，直接跳转到结算页面
          wx.redirectTo({
            url: `/pages/settlement/settlement?roomClosed=true`
          });
          return;
        }
      }
    });

    // 页面卸载时关闭监听
    this.watcher = watcher;
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

      // 重置弹窗状态，设置为不可见
      this.setData({
        'transferModal.show': false,
        'transferModal.targetPlayer': player,
        'transferModal.score': '',
        'transferModal.focusTrigger': false
      });
      
      // 强制下一个事件循环再显示弹窗，确保DOM完全重置
      setTimeout(() => {
        // 显示弹窗
        this.setData({
          'transferModal.show': true
        }, () => {
          console.log('弹窗已显示，开始聚焦输入框');
          
          // 在弹窗完全渲染后，使用较长延迟确保DOM更新完成
          setTimeout(() => {
            console.log('触发输入框聚焦');
            // 通过切换focusTrigger状态来强制触发input的focus属性
            this.setData({
              'transferModal.focusTrigger': true
            });
          }, 300); // 使用300ms确保在各种设备上都有足够时间渲染
        });
      }, 100);
    } catch (error) {
      console.error('显示给分弹窗失败:', error);
    }
  },

  /**
   * 隐藏给分弹窗
   */
  hideTransferModal() {
    this.setData({
      'transferModal.show': false,
      'transferModal.targetPlayer': null,
      'transferModal.score': '',
      'transferModal.focusTrigger': false
    });
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
    
    if (!score || score <= 0) {
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

    try {
      const result = await wx.cloud.callFunction({
        name: 'transferScore',
        data: {
          roomId: this.data.roomId,
          toPlayerOpenId: targetPlayer.openId,
          score: parseInt(score)
        }
      });

      // 隐藏加载提示
      wx.hideLoading();

      if (result.result.success) {
        wx.showToast({
          title: '给分成功',
          icon: 'success'
        });
        this.hideTransferModal();
      } else {
        wx.showToast({
          title: result.result.error,
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('给分失败:', error);
      // 隐藏加载提示
      wx.hideLoading();
      
      wx.showToast({
        title: '给分失败，请重试',
        icon: 'error'
      });
    }
  },

  /**
   * 分享房间
   */
  onShareAppMessage() {
    return {
      title: `房间 ${this.data.roomData?.roomNumber || this.data.roomId} - 可乐计分器`,
      path: `/pages/room/room?roomId=${this.data.roomId}`,
      imageUrl: this.data.qrcodeUrl
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
      
      // 验证倍率输入
      let rateValue = parseFloat(rate);
      if (!rate || isNaN(rateValue) || rateValue <= 0) {
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

      // 结算数据已包含在房间记录中，无需单独保存到records集合
      console.log('结算数据将保存在房间记录中');
      
      // 2. 隐藏结算弹窗
      this.hideSettlementModal();
      
      // 3. 结算核心操作：先将房间状态更新为closed，然后删除记录
      try {
        // 添加结算时间标记（不更新status字段）
      await db.collection('rooms').doc(this.data.roomId).update({
        data: {
          closeTime: new Date()
        }
      });
      console.log('房间已标记结算时间');
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
            rate: settlementData.rate
          }))}`,
          success: () => {
            console.log('跳转结算页面成功');
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
                rate: settlementData.rate
              }))}`,
              success: () => {
                console.log('使用reLaunch跳转结算页面成功');
                // 移除立即删除房间的逻辑
              }
            });
          }
      });
    } catch (error) {
      console.error('结算操作失败:', error);
      wx.hideLoading();
      
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
    }
  },

  /**
   * 监听用户点击左上角返回按钮的事件
   */
  onBackPress() {
    console.log('房间页面返回按钮点击');
    // 返回主页而不是直接退出小程序
    wx.switchTab({
      url: '/pages/home/home'
    });
    return true; // 阻止默认返回行为
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 关闭数据监听
    if (this.watcher) {
      this.watcher.close();
    }
    
    // 通知home页面刷新活跃房间状态
    const eventChannel = this.getOpenerEventChannel();
    if (eventChannel) {
      console.log('页面卸载，通知home页面刷新活跃房间');
      eventChannel.emit('roomUpdated');
    }
  }
});
