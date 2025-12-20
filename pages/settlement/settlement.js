// settlement.js
const db = wx.cloud.database();

Page({
  data: {
    roomId: '',
    roomNumber: '',
    players: [],
    rate: 1,
    roomClosed: false,
    isCreatingNewRoom: false,
    settlementTime: '' // 结算时间，用于验证
  },

  async onLoad(options) {
    
    // 检查房间是否已关闭
    if (options.roomClosed) {
      this.setData({ roomClosed: true });
      
      // 如果有关闭原因，显示相应提示
      wx.showToast({
        title: '房间已结算',
        icon: 'none'
      });
      
      // 如果有记录ID，可以尝试加载结算数据
      if (options.recordId) {
        this.loadSettlementData(options.recordId);
      }
      return;
    }
    
    try {
      const decodedData = decodeURIComponent(options.data || '');
      const data = JSON.parse(decodedData || '{}');
      let { roomId, roomNumber, players, rate, settlementTime } = data;
    
      if (!players || !Array.isArray(players)) {
        // 如果没有完整的结算数据，但有roomId，尝试从数据库加载已结算房间的数据
        if (roomId) {
          try {
            const roomResult = await db.collection('rooms').doc(roomId).get();
            if (roomResult && roomResult.data) {
              const roomData = roomResult.data;
              
              if (roomData.status === 'inactive' && roomData.players) {
                // 房间已结算，直接加载数据
                const settlementAllowed = await this.checkAndLockSettlement(roomId, true);
                if (settlementAllowed) {
                  return; // checkAndLockSettlement 内部已经设置了数据
                }
              }
            }
          } catch (dbError) {
            console.error('获取房间信息失败:', dbError);
          }
        }
        
        wx.showToast({
          title: '结算信息错误',
          icon: 'error'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // 如果roomNumber为空但roomId存在，尝试从数据库获取房间信息
      if ((!roomNumber || roomNumber === '') && roomId) {
        try {
          const roomResult = await db.collection('rooms').doc(roomId).get();
          if (roomResult && roomResult.data) {
            roomNumber = roomResult.data.roomNumber;
          }
        } catch (dbError) {
          console.error('获取房间信息失败:', dbError);
        }
      }

      // 结算前防重复结算检查（使用正常结算模式）
      if (roomId) {
        const settlementAllowed = await this.checkAndLockSettlement(roomId, false);
        if (!settlementAllowed) {
          wx.showToast({
            title: '房间正在结算中，请稍候...',
            icon: 'none',
            duration: 2000
          });
          setTimeout(() => {
            wx.navigateBack();
          }, 2000);
          return;
        }
      }

      // 计算倍率分并排序（按倍率分降序）
      const playersWithRateScore = players.map(player => ({
        ...player,
        rateScore: Math.round(player.score * rate)
      })).sort((a, b) => b.rateScore - a.rateScore);

      this.setData({
        roomId: roomId || '',
        roomNumber: roomNumber || '',
        players: playersWithRateScore,
        rate: rate || 1,
        settlementTime: settlementTime || new Date().toISOString() // 设置结算时间用于验证
      });
      
      // 验证结算数据是否正确保存到数据库
      setTimeout(() => {
        this.validateSettlementData();
      }, 2000); // 延迟2秒执行，确保房间页面的数据保存操作已完成
    } catch (error) {
      console.error('解析结算数据失败:', error);
      this.setData({ roomClosed: true });
      wx.showToast({
        title: '数据解析失败',
        icon: 'error'
      });
    }
  },

  /**
   * 检查并锁定结算状态，防止重复结算
   * @param {string} roomId 房间ID
   * @param {boolean} isViewOnly 是否只是查看模式（默认false）
   * @returns {Promise<boolean>} 是否允许继续结算
   */
  async checkAndLockSettlement(roomId, isViewOnly = false) {
    try {
      
      // 尝试获取房间当前状态
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      const roomData = roomDoc.data;
      
      if (!roomData) {

        return false;
      }
      
      // 如果是查看模式或房间已经结算，允许访问但不设置锁定
      if (roomData.status === 'inactive' || isViewOnly) {

        
        // 如果房间已经结算，尝试加载结算数据
        if (roomData.status === 'inactive') {
  
          await this.loadExistingSettlementData(roomId);
        }
        
        return true;
      }
      
      // 检查是否有其他用户正在结算（使用临时字段标记）
      const now = new Date();
      const lockTime = roomData.settlementLockTime;
      
      if (lockTime) {
        // 检查锁定是否超时（防止死锁）
        const lockAge = now - new Date(lockTime);
        const lockTimeout = 30000; // 30秒超时
        
        if (lockAge < lockTimeout) {

          return false;
        } else {

        }
      }
      
      // 只有在非查看模式下才设置结算锁定
      if (!isViewOnly) {
        // 设置结算锁定（原子操作）
        const updateResult = await db.collection('rooms').doc(roomId).update({
          data: {
            settlementLockTime: now,
            settlementLocker: await this.getCurrentUserOpenId(),
            status: 'pending_settlement' // 临时状态
          }
        });
        

        
        // 启动锁定超时清理机制
        setTimeout(() => {
          this.clearSettlementLock(roomId);
        }, 30000); // 30秒后自动清理锁定
      }
      
      return true;
      
    } catch (error) {
      console.error('检查结算锁定失败:', error);
      return false;
    }
  },

  /**
   * 加载已结算房间的结算数据
   * @param {string} roomId 房间ID
   */
  async loadExistingSettlementData(roomId) {
    try {
      
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      const roomData = roomDoc.data;
      
      if (!roomData) {
        return;
      }
      
      // 从房间数据中提取结算信息
      const { roomNumber, players, rate } = roomData;
      
      if (players && Array.isArray(players)) {
        // 计算倍率分并排序（按倍率分降序）
        const playersWithRateScore = players.map(player => ({
          ...player,
          rateScore: Math.round((player.score || 0) * (rate || 1))
        })).sort((a, b) => b.rateScore - a.rateScore);

        this.setData({
          roomId: roomId,
          roomNumber: roomNumber || '',
          players: playersWithRateScore,
          rate: rate || 1,
          roomClosed: true, // 标记房间已关闭
          settlementTime: roomData.closeTime ? new Date(roomData.closeTime).toISOString() : new Date().toISOString()
        });
        

      }
    } catch (error) {
      console.error('加载已结算房间数据失败:', error);
    }
  },

  /**
   * 获取当前用户OpenID
   * @returns {Promise<string>} 用户OpenID
   */
  async getCurrentUserOpenId() {
    try {
      const app = getApp();
      const cacheManager = app.globalData.cacheManager;
      let openId = cacheManager.getOpenId();
      
      if (!openId) {
        const cloudFunctionResult = await wx.cloud.callFunction({
          name: 'getOpenId'
        });
        openId = cloudFunctionResult.result.openId;
        cacheManager.setOpenId(openId);
      }
      
      return openId;
    } catch (error) {
      console.error('获取用户OpenID失败:', error);
      return '';
    }
  },

  /**
   * 清理结算锁定
   * @param {string} roomId 房间ID
   * 注意：此方法只清理锁定相关字段，不会修改房间的status状态
   * 房间的最终状态应该在finalizeSettlement方法中统一处理
   */
  async clearSettlementLock(roomId) {
    try {
      // 只清理锁定相关字段，不修改房间状态
      await db.collection('rooms').doc(roomId).update({
        data: {
          settlementLockTime: null,
          settlementLocker: null
          // 注意：这里不设置status字段，避免意外改变房间状态
          // 结算完成后房间应该保持inactive状态，不应该重新激活
        }
      });
      

    } catch (error) {
      console.error('清理结算锁定失败:', error);
    }
  },
  
  /**
   * 加载结算数据
   */
  async loadSettlementData(recordId) {
    try {
      // 由于不再使用records表，这里改为从roomId直接获取
      // 注意：如果房间已被删除，这里将无法获取数据
      // 在这种情况下，我们保留recordId作为roomId的可能性
      const roomId = recordId; // 假设recordId现在实际上是roomId
      
      const result = await db.collection('rooms').doc(roomId).get();
      const { _id, roomNumber, players, rate } = result.data;
      
      const playersWithRateScore = players.map(player => ({
        ...player,
        rateScore: Math.round(player.score * rate)
      })).sort((a, b) => b.rateScore - a.rateScore);

      this.setData({
        roomId: _id,
        roomNumber: roomNumber || '',
        players: playersWithRateScore,
        rate: rate || 1
      });
    } catch (error) {
      console.error('加载结算数据失败:', error);
      // 即使加载失败，也要确保界面能正常显示
      wx.showToast({
        title: '加载数据失败',
        icon: 'error'
      });
    }
  },
  
  /**
   * 开始新局
   */
  async startNewGame() {
    try {
      this.setData({ isCreatingNewRoom: true });
      
      // 获取用户信息 - 确保有默认值
      const app = getApp();
      let userInfo = app.globalData.userInfo || {};
      if (!userInfo || !userInfo.nickName) {
        userInfo = {
          ...userInfo,
          nickName: '玩家' + Math.floor(Math.random() * 900) + 100,
          avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png'
        };
        app.globalData.userInfo = userInfo;
      }
      
      // 获取当前用户openId - 添加额外错误处理
      let openId;
      try {
        // 尝试从缓存获取openId
        const app = getApp();
        const cacheManager = app.globalData.cacheManager;
        openId = cacheManager.getOpenId();
        
        if (!openId) {
          // 缓存中没有openid，调用云函数获取
          const cloudFunctionResult = await wx.cloud.callFunction({
            name: 'getOpenId'
          });
          
          if (!cloudFunctionResult || !cloudFunctionResult.result) {
            throw new Error('云函数调用返回无效结果');
          }
          
          openId = cloudFunctionResult.result.openId;
          if (!openId) {
            throw new Error('未获取到用户openId');
          }
          // 将openid存入缓存
          cacheManager.setOpenId(openId);
        } else {
        }
      } catch (openIdError) {
        console.error('获取用户openId失败:', openIdError);
        throw new Error('无法获取用户身份信息');
      }
      
      // 生成唯一房间ID（使用时间戳和随机数）
      const roomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      
      // 生成房间编号（纯数字）
      const roomNumber = Math.floor(Math.random() * 9000) + 1000;
      
      // 创建新房间 - 确保所有字段都有默认值
      const newRoomData = {
        _id: roomId,
        _openid: openId,
        roomNumber: roomNumber,
        createTime: new Date(),
        players: [{
          openId: openId,
          nickName: userInfo.nickName || '房主',
          avatarUrl: userInfo.avatarUrl || '/images/default-avatar.png',
          score: 0,
          joinTime: new Date()
        }],

        totalRounds: 0,
        teaServiceScore: 0
      };
      
      // 保存到数据库 - 改进错误处理和Promise链
      const addResult = await db.collection('rooms').add({
        data: newRoomData
      });
      
      // 跳转到新房间 - 使用try-catch保护
      try {
        wx.reLaunch({
          url: `/pages/room/room?mode=create&roomId=${encodeURIComponent(roomId)}`,
          success: () => {
            // 跳转成功后重置创建状态（虽然通常不会执行到这里）
            this.setData({ isCreatingNewRoom: false });
          },
          fail: (redirectError) => {
            console.error('跳转新房间失败:', redirectError);
            this.setData({ isCreatingNewRoom: false });
            throw new Error('跳转房间失败');
          }
        });
      } catch (redirectError) {
        console.error('执行房间跳转时出错:', redirectError);
        throw redirectError;
      }
    } catch (error) {
      console.error('创建新房间失败:', error);
      // 确保重置创建状态
      this.setData({ isCreatingNewRoom: false });
      
      wx.showToast({
        title: error.message || '创建房间失败，请重试',
        icon: 'error',
        duration: 2000
      });
    } finally {
      // 确保在任何情况下都重置创建状态
      setTimeout(() => {
        this.setData({ isCreatingNewRoom: false });
      }, 2000);
    }
  },
  
  /**
   * 返回首页
   */
 goToHome() {
    try {
      // 直接使用switchTab跳转到首页，避免页面堆栈问题
      wx.switchTab({
        url: '/pages/home/home',
        success: () => {
        },
        fail: (error) => {
          console.error('switchTab跳转首页失败:', error);
          // 如果switchTab失败，尝试reLaunch
          wx.reLaunch({
            url: '/pages/home/home',
            success: () => {
            },
            fail: (reLaunchError) => {
              console.error('reLaunch跳转首页也失败:', reLaunchError);
              // 最后尝试index页面
              wx.reLaunch({
                url: '/pages/index/index',
                success: () => {
                }
              });
            }
          });
        }
      });
    } catch (e) {
      console.error('返回首页方法执行异常:', e);
    }
  },

  /**
   * 验证结算数据是否正确保存到数据库
   */
  async validateSettlementData() {
    try {
      if (!this.data.roomId) {
        return;
      }
      
      // 获取当前用户openId
      let openId;
      try {
        const { result: userInfoResult } = await wx.cloud.callFunction({
          name: 'getOpenId'
        });
        openId = userInfoResult.openId;
      } catch (openIdError) {
        console.error('❌ 获取用户openId失败:', openIdError);
        wx.showToast({
          title: '获取用户信息失败',
          icon: 'error',
          duration: 2000
        });
        return;
      }
      
      // 验证用户数据是否包含最新的结算记录
      let userDoc;
      try {
      userDoc = await db.collection('users').doc(openId).get();
      } catch (getUserError) {
        console.error('❌ 获取用户文档失败:', getUserError);
        wx.showToast({
          title: '获取用户数据失败',
          icon: 'error',
          duration: 2000
        });
        return;
      }
      
      const userData = userDoc.data || {};
      
      // 兼容新旧数据结构
      let gamedata = [];
      let latestRecord = null;
      let dataStructure = 'unknown';
      
      // 检查数据结构：优先检查数组格式
      if (Array.isArray(userData.gamedata)) {
        dataStructure = 'array';
        gamedata = userData.gamedata;
        
        if (gamedata.length > 0) {
            latestRecord = gamedata[gamedata.length - 1];
        }
      } else {
      }
      
      if (latestRecord) {
        // 验证最新记录是否匹配当前房间（通过roomNumber和时间）
        // 对于时间验证，允许一定误差（因为页面加载和实际保存有时间差）
        const roomNumberMatch = latestRecord.roomNumber === this.data.roomNumber;
        let timeMatch = false;
        
        if (this.data.settlementTime && latestRecord.endTime) {
          // 将时间转换为毫秒数字进行比较，允许3秒误差
          const expectedTime = new Date(this.data.settlementTime).getTime();
          const actualTime = new Date(latestRecord.endTime).getTime();
          const timeDiff = Math.abs(expectedTime - actualTime);
          timeMatch = timeDiff <= 3000; // 允许3秒误差
        } else {
          // 如果没有时间数据，只验证房间编号
          timeMatch = true;
        }
        
        const isMatch = roomNumberMatch && timeMatch;
        
        if (isMatch) {
          
          wx.showToast({
            title: '✅ 数据保存成功',
            icon: 'success',
            duration: 2000
          });
          
          // 显示成功统计信息
          const successMessage = `🏆 结算完成！记录数: ${gamedata.length}`;
          setTimeout(() => {
            wx.showToast({
              title: successMessage,
              icon: 'none',
              duration: 3000
            });
          }, 1500);
          
        } else {
          console.warn('结算数据验证失败:', {
            roomNumberMatch,
            timeMatch,
            expectedTime: this.data.settlementTime,
            actualTime: latestRecord.endTime,
            expectedRoomNumber: this.data.roomNumber,
            actualRoomNumber: latestRecord.roomNumber,
            timeDiff: this.data.settlementTime && latestRecord.endTime ? 
              Math.abs(new Date(this.data.settlementTime).getTime() - new Date(latestRecord.endTime).getTime()) : 'N/A'
          });
          
          wx.showToast({
            title: `⚠️ 数据保存异常（房间ID不匹配）`,
            icon: 'error',
            duration: 3000
          });
        }
      } else {
        
        wx.showToast({
          title: '❌ 数据保存失败（无记录）',
          icon: 'error',
          duration: 3000
        });
      }
      
    } catch (error) {
      console.error('❌ === 验证结算数据时出错 ===', error);
      
      // 详细的错误信息
      let errorMessage = '数据验证失败';
      if (error.errCode) {
        errorMessage += ` (${error.errCode})`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      });
    }
  },

  /**
   * 页面卸载时触发
   * 将房间状态改为inactive而不是直接删除，确保可以查看历史结算数据
   */
  async onUnload() {
    if (this.data.roomId) {
      try {
        // 清理结算锁定并设置最终结算状态
        await this.finalizeSettlement(this.data.roomId);
        
  
        
        // 通知home页面刷新活跃房间列表
        const pages = getCurrentPages();
        if (pages.length > 0) {
          // 尝试在页面栈中找到home页
          for (const page of pages) {
            if (page.route === 'pages/home/home' && typeof page.checkActiveRoom === 'function') {
              page.checkActiveRoom();
              break;
            }
          }
        }
      } catch (error) {
        console.error('完成结算状态更新失败:', error);
        // 即使出错也要清理锁定
        try {
          await this.clearSettlementLock(this.data.roomId);
        } catch (clearError) {
          console.error('清理结算锁定失败:', clearError);
        }
      }
    }
  },

  /**
   * 完成结算流程，设置最终状态
   * @param {string} roomId 房间ID
   */
  async finalizeSettlement(roomId) {
    try {
      
      // 更新房间状态为已结算，并清理可能存在的pending_settlement状态
      await db.collection('rooms').doc(roomId).update({
        data: {
          status: 'inactive', // 确保房间状态为inactive，而不是pending_settlement
          closeTime: new Date(),
          settlementCompleted: true,
          settlementCompletedAt: new Date(),
          settlementCompletedBy: await this.getCurrentUserOpenId(),
          // 确保清理可能存在的pending_settlement状态
          settlementLockTime: null,
          settlementLocker: null
        }
      });
      

    } catch (error) {
      console.error('完成结算流程失败:', error);
      throw error;
    }
  },
})