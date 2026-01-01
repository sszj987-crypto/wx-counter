// history.js
Page({
  data: {
    historyData: {
      records: [],
      statistics: {
        totalGames: 0,
        wins: 0,
        losses: 0,
        totalScore: 0
      }
    },
    expandedRecordIndex: -1,
    // 分页相关
    pageSize: 20, // 每页加载的数据量
    currentPage: 0, // 当前页码
    hasMoreData: true, // 是否还有更多数据
    loadingMore: false // 是否正在加载更多数据
  },

  onLoad: function () {
    this.loadHistoryData();
  },

  onShow: function () {
    // 每次显示页面时重置分页并重新加载数据
    this.resetPageData();
    this.loadHistoryData();
  },

  loadHistoryData: function (isLoadMore = false) {
    // 从数据库获取历史结算数据
    if (isLoadMore) {
      this.setData({
        loadingMore: true
      });
    } else {
      wx.showLoading({
        title: '加载中...',
      });
    }
    
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
              if (!isLoadMore) {
                wx.hideLoading();
              } else {
                this.setData({
                  loadingMore: false
                });
              }
              
              // 获取gamedata数据（已经是数组格式）
              const gameData = Array.isArray(res.data.gamedata) ? res.data.gamedata : [];
              const records = gameData.slice().sort((a, b) => {
                const ta = a && a.endTime ? new Date(a.endTime).getTime() : 0;
                const tb = b && b.endTime ? new Date(b.endTime).getTime() : 0;
                return tb - ta;
              });
              const statistics = res.data.statistics || {}; // 获取statistics统计信息
              
              // 计算总数据量
              const totalCount = records.length;
              
              // 根据当前页码和每页大小计算数据范围
              const { currentPage, pageSize } = this.data;
              const startIndex = currentPage * pageSize;
              const endIndex = startIndex + pageSize;
              
              // 获取当前页的数据
              const currentPageData = records.slice(startIndex, endIndex);
              
              // 判断是否还有更多数据
              const hasMoreData = endIndex < totalCount;
              
              if (currentPageData && currentPageData.length > 0) {
                // 为每条记录添加_index属性和格式化时间
                const formattedHistory = currentPageData.map((item, index) => {
                  // 将endTime转换为紧凑的可读时间，保留年份信息避免重叠
                  const date = new Date(item.endTime);
                  const year = String(date.getFullYear()).slice(-2); // 截取年份后两位，如"23"
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const hours = String(date.getHours()).padStart(2, '0');
                  const minutes = String(date.getMinutes()).padStart(2, '0');
                  const formattedTime = `${year}.${month}/${day} ${hours}:${minutes}`;
                  
                  // 格式化details数据，确保与WXML中使用的属性名一致
                  const details = (item.players || []).map(player => ({
                    playerId: player.nickName, // 使用nickName作为临时的playerId
                    nickname: player.nickName,
                    avatar: '/images/default-avatar.png', // 使用默认头像
                    score: player.score
                  }));
                  
                  return {
                    ...item,
                    _index: startIndex + index,
                    formattedTime: formattedTime,
                    details: details // 格式化后的details数据
                  };
                });
                
                // 更新数据
                const newHistorySettlements = isLoadMore ? 
                  [...this.data.historyData.records, ...formattedHistory] : 
                  formattedHistory;
                
                this.setData({
                  historyData: {
                    records: newHistorySettlements,
                    statistics: statistics // 使用数据库中的统计数据
                  },
                  hasMoreData: hasMoreData
                });
                
                // 如果是首次加载，从数据库统计数据更新
                if (!isLoadMore) {
                  // 统计信息从数据库直接获取，无需重新计算
                  this.setData({
                    historyData: {
                      records: newHistorySettlements,
                      statistics: statistics
                    }
                  });
                }
              } else {
                // 如果没有历史记录，设置为空
                if (!isLoadMore) {
                  this.setData({
                    historyData: {
                      records: [],
                      statistics: statistics
                    },
                    hasMoreData: false
                  });
                } else {
                  this.setData({
                    hasMoreData: false
                  });
                }
              }
            })
            .catch(err => {
              if (!isLoadMore) {
                wx.hideLoading();
              } else {
                this.setData({
                  loadingMore: false
                });
              }
              console.error('获取用户历史记录失败', err);
              if (!isLoadMore) {
                this.setData({
                  historyData: {
                    records: [],
                    statistics: {
                      totalGames: 0,
                      wins: 0,
                      losses: 0,
                      totalScore: 0
                    }
                  },
                  hasMoreData: false
                });
              }
            });
        },
        fail: (err) => {
          if (!isLoadMore) {
            wx.hideLoading();
          } else {
            this.setData({
              loadingMore: false
            });
          }
          console.error('获取openId失败', err);
          if (!isLoadMore) {
            this.setData({
              historyData: {
                records: [],
                statistics: {
                  totalGames: 0,
                  wins: 0,
                  losses: 0,
                  totalScore: 0
                }
              },
              hasMoreData: false
            });
          }
        }
      });
    } catch (e) {
      if (!isLoadMore) {
        wx.hideLoading();
      } else {
        this.setData({
          loadingMore: false
        });
      }
      // 处理异常情况
      console.error('获取历史结算数据失败', e);
      if (!isLoadMore) {
        this.setData({
          historyData: {
            records: [],
            statistics: {
              totalGames: 0,
              wins: 0,
              losses: 0,
              totalScore: 0
            }
          },
          hasMoreData: false
        });
      }
    }
  },

  /**
   * 重置分页数据
   */
  resetPageData: function () {
    this.setData({
      currentPage: 0,
      hasMoreData: true,
      historyData: {
        records: [],
        statistics: {
          totalGames: 0,
          wins: 0,
          losses: 0,
          totalScore: 0
        }
      }
    });
  },

  toggleRecordDetail: function (e) {
    const index = e.currentTarget.dataset.index;
    const expandedIndex = this.data.expandedRecordIndex === index ? -1 : index;
    this.setData({
      expandedRecordIndex: expandedIndex
    });
  },

  /**
   * 加载更多数据
   */
  loadMoreData: function () {
    // 如果还有更多数据且不在加载中，则加载更多
    if (this.data.hasMoreData && !this.data.loadingMore) {
      this.setData({
        currentPage: this.data.currentPage + 1,
        loadingMore: true
      });
      this.loadHistoryData(true);
    }
  }
});
