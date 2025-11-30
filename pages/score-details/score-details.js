// score-details.js
const db = wx.cloud.database()

Page({
  data: {
    roomId: '',
    roomNumber: '',
    scoreRecords: [],
    isLoading: true
  },

  // 格式化时间函数 - 直接定义在Page对象中
  formatTime(time) {
    if (!time) {
      return '';
    }
    
    try {
      const date = new Date(time);
      if (isNaN(date.getTime())) {
        return '';
      }
      
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hour = String(date.getHours()).padStart(2, '0');
      const minute = String(date.getMinutes()).padStart(2, '0');
      
      return `${month}-${day} ${hour}:${minute}`;
    } catch (error) {
      return '';
    }
  },
  
  /**
   * 页面生命周期 - 监听页面卸载
   * 添加返回功能，确保用户可以正常返回上一页
   */
  onUnload() {
    // 可以在这里添加一些清理逻辑
  },
  
  /**
   * 监听用户点击左上角返回按钮的事件
   */
  onBackPress() {
    wx.navigateBack({
      delta: 1
    });
    return true;
  },

  onLoad(options) {
    const { roomId, roomNumber } = options
    
    if (!roomId) {
      wx.showToast({
        title: '房间信息错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    // 优化解码逻辑，简单处理房间号
    const processedRoomNumber = roomNumber ? String(roomNumber).trim() : '房间'
    
    this.setData({
      roomId: roomId,
      roomNumber: processedRoomNumber
    })

    this.getScoreRecords()
  },

  // 获取给分记录
  async getScoreRecords() {
    try {
      this.setData({ isLoading: true })
      
      // 查询rooms集合中的records字段，按时间倒序排列
      const roomResult = await db.collection('rooms')
        .doc(this.data.roomId)
        .get();

      // 从房间数据中提取records字段，如果不存在则使用空数组
      const scoreRecords = roomResult.data?.records || [];
      
      // 预处理每条记录，添加格式化后的时间显示
      const processedRecords = scoreRecords.map(record => {
        const formattedTime = this.formatTime(record.createTime);
        return {
          ...record,
          displayTime: formattedTime  // 添加预格式化的显示时间
        };
      });
      
      // 按时间倒序排序
      processedRecords.sort((a, b) => b.createTime - a.createTime);
      
      this.setData({
        scoreRecords: processedRecords,
        isLoading: false
      })
    } catch (error) {
      console.error('获取给分记录失败:', error)
      wx.showToast({
        title: '获取记录失败',
        icon: 'error'
      })
      this.setData({ isLoading: false })
    }
  }
})