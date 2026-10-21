/**
 * 可乐计分器房间页面
 * 支持实时同步、给分功能
 */
const db = wx.cloud.database();
const _ = db.command;
const counter = require('../../utils/counter-service.js');

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
    batchTransferModal: {
      show: false,
      players: [],
      keyboardHeight: 0
    },
    settlementModal: {
      show: false,
      rate: '1'
    },
    roomFeeSettingsModal: {
      show: false,
      total: '100',
      fullX: '10',
      drawY: '1'
    },
    isRoomFeeEnabled: false,
    roomFeeConfig: {
      total: 100,
      fullX: 10,
      drawY: 1,
      enabled: false
    },
    roomFeePlayerId: null,
    roomFeeCollected: 0,
    roomFeeWithdrawAmount: '',
    isSettling: false,
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
    
    if (openId && openId.startsWith('room_fee_')) {
      this.showRoomFeeSettings();
      return;
    }
    
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
    this.setData({ largeTextEnabled: enabled });
    try {
      await counter.call('updateProfile', {
        nickName: this.data.userInfo.nickName,
        avatarUrl: this.data.userInfo.avatarUrl,
        largeTextEnabled: enabled
      });
    } catch (error) { console.error('保存大字设置失败:', error); }
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
    if (!this.data.roomId) return;
    try {
      const result = await counter.call('getRoomSnapshot', { roomId: this.data.roomId });
      if (result.room.status !== 'active') {
        this.openSettlement(result.room);
        return;
      }
      this.setData({ roomData: result.room });
      this.checkRoomFeeStatus(result.room);
    } catch (error) { console.error('刷新房间数据失败:', error); }
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
      const result = await counter.call('createRoom', this.data.userInfo || {});
      this.setData({ roomId: result.room._id, roomData: result.room, isCreating: false });
      this.checkRoomFeeStatus(result.room);
      this.watchRoomData();
      const channel = this.getOpenerEventChannel();
      if (channel) channel.emit('roomCreated');
    } catch (error) {
      this.setData({ isCreating: false });
      wx.showToast({ title: error.message || '创建房间失败', icon: 'none' });
      wx.navigateBack();
    }
  },

  /**
   * 加入房间
   */
  async joinRoom(roomId) {
    try {
      const result = await counter.call('joinRoom', { roomId, ...(this.data.userInfo || {}) });
      const room = result.room;
      this.setData({ roomId, roomData: room });
      if (room.status !== 'active') {
        this.openSettlement(room);
        return;
      }
      this.checkRoomFeeStatus(room);
      this.watchRoomData();
    } catch (error) {
      wx.showToast({ title: error.message || '加入房间失败', icon: 'none' });
      wx.navigateBack();
    }
  },

  openSettlement(room) {
    if (this.settlementNavigating) return;
    this.settlementNavigating = true;
    wx.redirectTo({ url: `/pages/settlement/settlement?roomId=${encodeURIComponent(room._id)}` });
  },

  /**
   * 切换房费开关
   */
  async toggleRoomFee() {
    try {
      const config = this.data.roomFeeConfig;
      const result = await counter.call('updateRoomFeeConfig', {
        roomId: this.data.roomId, enabled: !this.data.isRoomFeeEnabled,
        total: config.total, fullX: config.fullX, drawY: config.drawY
      });
      this.setData({ roomData: result.room });
      this.checkRoomFeeStatus(result.room);
      if (result.room.roomFeeConfig.enabled) this.showRoomFeeSettings();
    } catch (error) { wx.showToast({ title: error.message || '操作失败', icon: 'none' }); }
  },

  /**
   * 显示房费设置弹窗
   */
  showRoomFeeSettings() {
    const config = this.data.roomFeeConfig;
    const roomFeePlayer = this.data.roomData?.players?.find(
      p => p.openId === `room_fee_${this.data.roomId}`
    );
    const roomFeeCollected = roomFeePlayer ? roomFeePlayer.score || 0 : 0;
    this.setData({
      'roomFeeSettingsModal.show': true,
      'roomFeeSettingsModal.total': String(config.total != null ? config.total : 100),
      'roomFeeSettingsModal.fullX': String(config.fullX != null ? config.fullX : 10),
      'roomFeeSettingsModal.drawY': String(config.drawY != null ? config.drawY : 1),
      roomFeeCollected: roomFeeCollected,
      roomFeeWithdrawAmount: ''
    });
  },

  /**
   * 隐藏房费设置弹窗
   */
  hideRoomFeeSettings() {
    wx.hideKeyboard();
    this.setData({
      'roomFeeSettingsModal.show': false
    });
  },

  /**
   * 阻止弹窗关闭
   */
  preventClose() {
    // 空函数，仅用于阻止事件冒泡
  },

  /**
   * 房费设置弹窗点击处理
   */
  onRoomFeeSettingsTap() {
    // 收起键盘
    wx.hideKeyboard();
  },

  /**
   * 房费总额输入
   */
  onRoomFeeTotalInput(e) {
    let value = e.detail.value.replace(/[^0-9]/g, '');
    this.setData({
      'roomFeeSettingsModal.total': value
    });
  },

  /**
   * 满X元输入
   */
  onRoomFeeFullXInput(e) {
    let value = e.detail.value.replace(/[^0-9]/g, '');
    this.setData({
      'roomFeeSettingsModal.fullX': value
    });
  },

  /**
   * 抽Y元输入
   */
  onRoomFeeDrawYInput(e) {
    let value = e.detail.value.replace(/[^0-9]/g, '');
    this.setData({
      'roomFeeSettingsModal.drawY': value
    });
  },

  /**
   * 保存房费设置
   */
  async saveRoomFeeSettings() {
    const { total, fullX, drawY } = this.data.roomFeeSettingsModal;
    try {
      const result = await counter.call('updateRoomFeeConfig', {
        roomId: this.data.roomId, enabled: this.data.isRoomFeeEnabled,
        total: Number(total), fullX: Number(fullX), drawY: Number(drawY)
      });
      this.setData({ roomData: result.room, 'roomFeeSettingsModal.show': false });
      this.checkRoomFeeStatus(result.room);
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }
  },

  /**
   * 取回金额输入
   */
  onRoomFeeWithdrawInput(e) {
    let value = e.detail.value.replace(/[^0-9]/g, '');
    this.setData({
      roomFeeWithdrawAmount: value
    });
  },

  /**
   * 取回房费
   */
  async withdrawRoomFee() {
    const amount = this.data.roomFeeWithdrawAmount
      ? Number(this.data.roomFeeWithdrawAmount) : this.data.roomFeeCollected;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > this.data.roomFeeCollected) {
      wx.showToast({ title: '取回金额无效', icon: 'none' });
      return;
    }
    const confirmation = await new Promise(resolve => wx.showModal({
      title: '取回房费', content: `确定要取回 ${amount} 元房费吗？`,
      success: result => resolve(result.confirm), fail: () => resolve(false)
    }));
    if (!confirmation) return;
    const payload = { roomId: this.data.roomId, amount };
    const operationId = counter.operationStore.get('fee_withdraw', payload);
    try {
      const result = await counter.callWithRetry('withdrawRoomFee', { ...payload, operationId });
      counter.operationStore.complete('fee_withdraw', payload);
      this.setData({ roomFeeWithdrawAmount: '' });
      this.refreshRoomDataAfterTransfer(result);
      wx.showToast({ title: '取回成功', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '取回失败', icon: 'none' }); }
  },

  /**
   * 检查房费玩家状态
   */
  async checkRoomFeeStatus(roomData) {
    if (!roomData || !roomData.players) return;
    
    const roomFeePlayer = roomData.players.find(player => 
      player.openId === `room_fee_${roomData._id}`
    );
    
    if (roomFeePlayer) {
      this.setData({
        isRoomFeeEnabled: roomData.roomFeeConfig?.enabled === true,
        roomFeePlayerId: roomFeePlayer.openId,
        roomFeeCollected: roomFeePlayer.score || 0
      });
      
      if (roomData.roomFeeConfig) {
        this.setData({
          roomFeeConfig: roomData.roomFeeConfig
        });
      }
    } else {
      this.setData({
        isRoomFeeEnabled: roomData.roomFeeConfig?.enabled === true,
        roomFeePlayerId: null
      });
      if (roomData.roomFeeConfig) this.setData({ roomFeeConfig: roomData.roomFeeConfig });
    }
  },

  /**
   * 监听房间数据变化
   */
  watchRoomData() {
    if (this.watcher) this.watcher.close();
    let retries = 0;
    const start = () => {
      this.watcher = db.collection('rooms').where({
        _id: this.data.roomId, memberOpenIds: db.command.in(['{openid}'])
      }).watch({
        onChange: snapshot => {
          if (this.data.isExitingRoom) return;
          const room = snapshot.docs && snapshot.docs[0];
          if (!room) return;
          if (room.status !== 'active') { this.openSettlement(room); return; }
          this.setData({ roomData: room });
          this.checkRoomFeeStatus(room);
          if (this.pendingRoomVersion && room.version >= this.pendingRoomVersion) {
            this.pendingRoomVersion = 0;
            if (this.syncTimer) clearTimeout(this.syncTimer);
          }
        },
        onError: error => {
          if (this.data.isExitingRoom) return;
          console.error('监听房间数据失败:', error);
          this.refreshRoomData();
          if (retries++ < 3) this.retryTimer = setTimeout(() => {
            if (this.watcher) this.watcher.close();
            start();
          }, retries * 2000);
          else wx.showToast({ title: '数据同步异常，请刷新页面', icon: 'none' });
        }
      });
    };
    start();
  },

  /**
   * 显示批量给分弹窗
   */
  showBatchTransferModal() {
    if (!this.data.roomData || !this.data.currentUserOpenId) {
      wx.showToast({
        title: '房间信息加载中',
        icon: 'none'
      });
      return;
    }

    const otherPlayers = this.data.roomData.players
      .filter(p => p.openId !== this.data.currentUserOpenId)
      .map(p => ({
        ...p,
        score: ''
      }));

    if (otherPlayers.length === 0) {
      wx.showToast({
        title: '没有其他玩家可给分',
        icon: 'none'
      });
      return;
    }

    this.setData({
      'batchTransferModal.show': true,
      'batchTransferModal.players': otherPlayers,
      'batchTransferModal.keyboardHeight': 0
    });
  },

  /**
   * 隐藏批量给分弹窗
   */
  hideBatchTransferModal() {
    if (this.data.isTransferring) return;
    
    this.setData({
      'batchTransferModal.show': false,
      'batchTransferModal.players': [],
      'batchTransferModal.keyboardHeight': 0
    });
  },

  /**
   * 批量给分输入处理
   */
  onBatchScoreInput(e) {
    const index = e.currentTarget.dataset.index;
    let value = e.detail.value;
    
    // 过滤非数字
    value = value.replace(/[^0-9]/g, '');
    
    // 限制最大值
    const MAX_SCORE = 100000;
    if (value && parseInt(value) > MAX_SCORE) {
      value = String(MAX_SCORE);
      wx.showToast({
        title: `最大值为${MAX_SCORE}`,
        icon: 'none'
      });
    }

    const key = `batchTransferModal.players[${index}].score`;
    this.setData({
      [key]: value
    });
  },

  onBatchInputFocus(e) {
    if (e && e.detail && e.detail.height) {
      this.setData({
        'batchTransferModal.keyboardHeight': e.detail.height
      });
    }
  },

  onBatchInputBlur() {
    this.setData({
      'batchTransferModal.keyboardHeight': 0
    });
  },

  /**
   * 确认批量给分
   */
  async confirmBatchTransfer() {
    if (this.data.isTransferring) return;
    const transfers = this.data.batchTransferModal.players
      .filter(player => player.score !== '')
      .map(player => ({ toPlayerOpenId: player.openId, score: Number(player.score) }));
    if (!transfers.length) { wx.showToast({ title: '请输入至少一个有效分数', icon: 'none' }); return; }
    const payload = { roomId: this.data.roomId, transfers };
    const operationId = counter.operationStore.get('transfer', payload);
    this.setData({ isTransferring: true });
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      const result = await counter.callWithRetry('transferScore', { ...payload, operationId });
      counter.operationStore.complete('transfer', payload);
      this.setData({ 'batchTransferModal.show': false, 'batchTransferModal.players': [] });
      this.refreshRoomDataAfterTransfer(result);
      wx.showToast({ title: '批量给分成功', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '给分失败', icon: 'none' }); }
    finally { wx.hideLoading(); this.setData({ isTransferring: false }); }
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

  onTransferInputFocus(e) {
    if (e && e.detail && e.detail.height) {
      this.setData({
        'transferModal.keyboardHeight': e.detail.height
      });
    }
  },

  onTransferInputBlur() {
    this.setData({
      'transferModal.keyboardHeight': 0
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
    if (this.data.isTransferring) return;
    const { targetPlayer, score } = this.data.transferModal;
    const amount = Number(score);
    if (!targetPlayer?.openId || !Number.isInteger(amount) || amount < 1 || amount > 100000) {
      wx.showToast({ title: '请输入1到100000的整数分数', icon: 'none' });
      return;
    }
    const payload = { roomId: this.data.roomId, transfers: [
      { toPlayerOpenId: targetPlayer.openId, score: amount }
    ] };
    const operationId = counter.operationStore.get('transfer', payload);
    this.setData({ isTransferring: true });
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      const result = await counter.callWithRetry('transferScore', { ...payload, operationId });
      counter.operationStore.complete('transfer', payload);
      wx.hideKeyboard();
      this.setData({ 'transferModal.show': false, 'transferModal.score': '' });
      this.refreshRoomDataAfterTransfer(result);
      wx.showToast({ title: '给分成功', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '给分失败', icon: 'none' }); }
    finally { wx.hideLoading(); this.setData({ isTransferring: false }); }
  },

  /**
   * 先应用云函数返回的事务快照；缺少快照时才等待监听并补读
   */
  refreshRoomDataAfterTransfer(result) {
    const roomVersion = result.roomVersion;
    if (result.players && this.data.roomData && roomVersion > (this.data.roomData.version || 0)) {
      const roomData = {
        ...this.data.roomData,
        players: result.players,
        version: roomVersion,
        transferCount: result.transferCount ?? this.data.roomData.transferCount
      };
      this.setData({ roomData });
      this.checkRoomFeeStatus(roomData);
    }
    if (this.data.roomData?.version >= roomVersion) {
      this.pendingRoomVersion = 0;
      if (this.syncTimer) clearTimeout(this.syncTimer);
      return;
    }
    this.pendingRoomVersion = Math.max(this.pendingRoomVersion || 0, roomVersion);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    // The room watch normally supplies the update; a single read covers delayed or failed watches.
    this.syncTimer = setTimeout(() => {
      if (this.data.roomData?.version < this.pendingRoomVersion) this.refreshRoomData();
      this.pendingRoomVersion = 0;
    }, 3000);
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
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '离开房间', content: '离开后分数和成员身份会保留，可从首页重新进入。',
      confirmText: '离开', success: result => resolve(result.confirm), fail: () => resolve(false)
    }));
    if (!confirmed) return;
    this.setData({ isExitingRoom: true });
    if (this.watcher) this.watcher.close();
    wx.switchTab({ url: '/pages/home/home' });
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
    if (this.data.isSettling) return;
    const rate = this.data.settlementModal.rate;
    if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/.test(rate) ||
        Number(rate) < 0.01 || Number(rate) > 10000) {
      wx.showToast({ title: '请输入0.01到10000.00的倍率', icon: 'none' });
      return;
    }
    this.setData({ isSettling: true });
    wx.showLoading({ title: '正在结算...', mask: true });
    try {
      const result = await counter.call('settleRoom', { roomId: this.data.roomId, rate });
      this.hideSettlementModal();
      this.openSettlement(result.room);
    } catch (error) {
      wx.showToast({ title: error.message || '结算失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isSettling: false });
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
   * 页面卸载时清除监听器和定时器
   */
  onUnload() {
    // 关闭数据库监听
    if (this.watcher) {
      this.watcher.close();
    }
    
    // 清理可能存在的定时器
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    
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
