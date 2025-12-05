// history.js
Page({
  data: {
    historySettlements: [],
    statistics: {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalScore: 0
    },
    expandedRecordIndex: -1
  },

  onLoad: function () {
    this.loadHistoryData();
  },

  onShow: function () {
    // 每次显示页面时重新加载数据
    this.loadHistoryData();
  },

  loadHistoryData: function () {
    // 从数据库获取历史结算数据
    wx.showLoading({
      title: '加载中...',
    });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 调用云函数获取用户openId
      wx.cloud.callFunction({
        name: 'getOpenId',
        success: (res) => {
          const openId = res.result.openId;
          
          // 从users集合获取当前用户的历史结算记录
          db.collection('users').doc(openId).get()
            .then(res => {
              wx.hideLoading();
              
              const historySettlements = res.data.historySettlements || [];
              
              if (historySettlements && historySettlements.length > 0) {
                // 为每条记录添加_index属性和格式化时间
                const formattedHistory = historySettlements.map((item, index) => {
                  // 将settlementTime转换为可读时间
                  const date = new Date(item.settlementTime);
                  const formattedTime = `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                  
                  // 格式化details数据，确保与WXML中使用的属性名一致
                  const details = (item.gamemates || []).map(gamemate => ({
                    playerId: gamemate.nickName, // 使用nickName作为临时的playerId
                    nickname: gamemate.nickName,
                    avatar: '/images/default-avatar.png', // 使用默认头像
                    score: gamemate.score
                  }));
                  
                  // 添加当前用户到details列表
                  details.unshift({
                    playerId: 'me',
                    nickname: '我', // 使用默认昵称，可后续替换为真实用户昵称
                    avatar: '/images/default-avatar.png',
                    score: item.myScore
                  });
                  
                  return {
                    ...item,
                    _index: index,
                    formattedTime: formattedTime,
                    details: details // 格式化后的details数据
                  };
                });
                
                this.setData({
                  historySettlements: formattedHistory
                });

                this.calculateStatistics(formattedHistory);
              } else {
                // 如果没有历史记录，设置为空数组
                this.setData({
                  historySettlements: []
                });
                this.calculateStatistics([]);
              }
            })
            .catch(err => {
              wx.hideLoading();
              console.error('获取用户历史记录失败', err);
              this.setData({
                historySettlements: []
              });
              this.calculateStatistics([]);
            });
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('获取openId失败', err);
          this.setData({
            historySettlements: []
          });
          this.calculateStatistics([]);
        }
      });
    } catch (e) {
      wx.hideLoading();
      // 处理异常情况
      console.error('获取历史结算数据失败', e);
      this.setData({
        historySettlements: []
      });
      this.calculateStatistics([]);
    }
  },

  calculateStatistics: function (historySettlements) {
    const stats = {
      totalGames: historySettlements.length,
      wins: 0,
      losses: 0,
      totalScore: 0
    };

    historySettlements.forEach(settlement => {
      if (settlement.myResult === '胜利') {
        stats.wins++;
      } else if (settlement.myResult === '失败') {
        stats.losses++;
      }
      stats.totalScore += settlement.myScore || 0;
    });

    this.setData({
      statistics: stats
    });
  },

  toggleRecordDetail: function (e) {
    const index = e.currentTarget.dataset.index;
    const expandedIndex = this.data.expandedRecordIndex === index ? -1 : index;
    this.setData({
      expandedRecordIndex: expandedIndex
    });
  }
});