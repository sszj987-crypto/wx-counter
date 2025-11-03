// settlement.js
const db = wx.cloud.database();

Page({
  data: {
    roomId: '',
    roomName: '',
    players: [],
    rate: 1,
    roomClosed: false,
    isCreatingNewRoom: false
  },

  onLoad(options) {
    console.log('结算页面加载，参数:', options);
    
    // 检查房间是否已关闭
    if (options.roomClosed) {
      console.log('房间已被结算关闭');
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
      const { roomId, roomName, players, rate } = data;
    
      if (!players || !Array.isArray(players)) {
        wx.showToast({
          title: '结算信息错误',
          icon: 'error'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // 计算倍率分并排序（按倍率分降序）
      const playersWithRateScore = players.map(player => ({
        ...player,
        rateScore: Math.round(player.score * rate)
      })).sort((a, b) => b.rateScore - a.rateScore);

      this.setData({
        roomId: roomId || '',
        roomName: roomName || '房间',
        players: playersWithRateScore,
        rate: rate || 1
      });
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
   * 加载结算数据
   */
  async loadSettlementData(recordId) {
    try {
      // 由于不再使用records表，这里改为从roomId直接获取
      // 注意：如果房间已被删除，这里将无法获取数据
      // 在这种情况下，我们保留recordId作为roomId的可能性
      const roomId = recordId; // 假设recordId现在实际上是roomId
      
      const result = await db.collection('rooms').doc(roomId).get();
      const { _id, roomName, players, rate } = result.data;
      
      const playersWithRateScore = players.map(player => ({
        ...player,
        rateScore: Math.round(player.score * rate)
      })).sort((a, b) => b.rateScore - a.rateScore);

      this.setData({
        roomId: _id,
        roomName: roomName || '房间',
        players: playersWithRateScore,
        rate: rate || 1
      });
    } catch (error) {
      console.error('加载结算数据失败:', error);
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
        console.log('没有完整用户信息，生成默认信息');
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
        console.log('当前用户openId:', openId);
      } catch (openIdError) {
        console.error('获取用户openId失败:', openIdError);
        throw new Error('无法获取用户身份信息');
      }
      
      // 生成唯一房间ID（使用时间戳和随机数）
      const roomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      console.log('生成的新房间ID:', roomId);
      
      // 生成房间编号（纯数字）
      const roomNumber = Math.floor(Math.random() * 9000) + 1000;
      
      // 创建新房间 - 确保所有字段都有默认值
      const newRoomData = {
        _id: roomId,
        roomName: `房间${roomNumber}`,
        roomNumber: roomNumber,
        creatorOpenId: openId,
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
      console.log('准备保存新房间到数据库');
      const addResult = await db.collection('rooms').add({
        data: newRoomData
      });
      
      console.log('新房间创建成功，结果:', addResult);
      
      // 跳转到新房间 - 使用try-catch保护
      try {
        wx.reLaunch({
          url: `/pages/room/room?mode=create&roomId=${encodeURIComponent(roomId)}`,
          success: () => {
            console.log('成功跳转至新房间');
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
    console.log('返回首页按钮被点击');
    try {
      // 直接使用reLaunch跳转到首页，并尝试正确的首页路径
      wx.reLaunch({
        url: '/pages/home/home', // 根据项目结构修改为home页面
        success: () => {
          console.log('成功跳转至首页');
        },
        fail: (error) => {
          console.error('跳转首页失败:', error);
          // 如果home页面不存在，尝试index页面
          wx.reLaunch({
            url: '/pages/index/index',
            success: () => {
              console.log('使用index页面成功跳转至首页');
            },
            fail: (reLaunchError) => {
              console.error('使用index页面跳转首页也失败:', reLaunchError);
            }
          });
        }
      });
    } catch (e) {
      console.error('返回首页方法执行异常:', e);
    }
  }
})