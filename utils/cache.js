/**
 * 缓存管理模块
 * 用于处理openid和qrcode的本地缓存，减少云函数调用次数
 */

class CacheManager {
  constructor() {
    // 初始化缓存对象
    this.cache = {
      openid: null,
      qrcode: {
        // 不带roomId的二维码缓存
        general: null,
        // 带roomId的二维码缓存，以roomId为key存储
        rooms: {}
      }
    };
    
    // 缓存过期时间（毫秒），设置为1小时
    this.expirationTime = 60 * 60 * 1000;
    
    // 从本地存储加载缓存
    this.loadFromStorage();
  }
  
  /**
   * 从本地存储加载缓存
   */
  loadFromStorage() {
    try {
      const cachedData = wx.getStorageSync('cache_manager_data');
      if (cachedData) {
        this.cache = cachedData;
        console.log('缓存数据加载成功');
      }
    } catch (e) {
      console.error('加载缓存数据失败:', e);
    }
  }
  
  /**
   * 将缓存保存到本地存储
   */
  saveToStorage() {
    try {
      wx.setStorageSync('cache_manager_data', this.cache);
      console.log('缓存数据保存成功');
    } catch (e) {
      console.error('保存缓存数据失败:', e);
    }
  }
  
  /**
   * 获取openid缓存
   * @returns {string|null} openid或null
   */
  getOpenId() {
    if (this.cache.openid && this.cache.openid.value) {
      const now = Date.now();
      // 检查是否过期（openid缓存永不过期）
      if (now - this.cache.openid.timestamp < this.expirationTime || true) {
        console.log('使用缓存的openid:', this.cache.openid.value);
        return this.cache.openid.value;
      } else {
        // 过期则清除
        this.cache.openid = null;
        this.saveToStorage();
      }
    }
    return null;
  }
  
  /**
   * 设置openid缓存
   * @param {string} openid 用户openid
   */
  setOpenId(openid) {
    this.cache.openid = {
      value: openid,
      timestamp: Date.now()
    };
    this.saveToStorage();
    console.log('openid缓存已设置:', openid);
  }
  
  /**
   * 获取通用二维码缓存（不带roomId）
   * @returns {string|null} 二维码URL或null
   */
  getGeneralQRCode() {
    if (this.cache.qrcode.general && this.cache.qrcode.general.value) {
      const now = Date.now();
      // 检查是否过期
      if (now - this.cache.qrcode.general.timestamp < this.expirationTime) {
        console.log('使用缓存的通用二维码');
        return this.cache.qrcode.general.value;
      } else {
        // 过期则清除
        this.cache.qrcode.general = null;
        this.saveToStorage();
      }
    }
    return null;
  }
  
  /**
   * 设置通用二维码缓存（不带roomId）
   * @param {string} qrcodeUrl 二维码URL
   */
  setGeneralQRCode(qrcodeUrl) {
    this.cache.qrcode.general = {
      value: qrcodeUrl,
      timestamp: Date.now()
    };
    this.saveToStorage();
    console.log('通用二维码缓存已设置');
  }
  
  /**
   * 获取房间二维码缓存（带roomId）
   * @param {string} roomId 房间ID
   * @returns {string|null} 二维码URL或null
   */
  getRoomQRCode(roomId) {
    if (this.cache.qrcode.rooms[roomId] && this.cache.qrcode.rooms[roomId].value) {
      const now = Date.now();
      // 检查是否过期
      if (now - this.cache.qrcode.rooms[roomId].timestamp < this.expirationTime) {
        console.log(`使用缓存的房间${roomId}二维码`);
        return this.cache.qrcode.rooms[roomId].value;
      } else {
        // 过期则清除
        delete this.cache.qrcode.rooms[roomId];
        this.saveToStorage();
      }
    }
    return null;
  }
  
  /**
   * 设置房间二维码缓存（带roomId）
   * @param {string} roomId 房间ID
   * @param {string} qrcodeUrl 二维码URL
   */
  setRoomQRCode(roomId, qrcodeUrl) {
    this.cache.qrcode.rooms[roomId] = {
      value: qrcodeUrl,
      timestamp: Date.now()
    };
    this.saveToStorage();
    console.log(`房间${roomId}二维码缓存已设置`);
  }
  
  /**
   * 清除指定房间的二维码缓存
   * @param {string} roomId 房间ID
   */
  clearRoomQRCode(roomId) {
    if (this.cache.qrcode.rooms[roomId]) {
      delete this.cache.qrcode.rooms[roomId];
      this.saveToStorage();
      console.log(`房间${roomId}二维码缓存已清除`);
    }
  }
  
  /**
   * 清除所有房间二维码缓存（用于重新创建房间后）
   */
  clearAllRoomQRCodes() {
    this.cache.qrcode.rooms = {};
    this.saveToStorage();
    console.log('所有房间二维码缓存已清除');
  }
  
  /**
   * 清除所有缓存
   */
  clearAll() {
    this.cache = {
      openid: null,
      qrcode: {
        general: null,
        rooms: {}
      }
    };
    this.saveToStorage();
    console.log('所有缓存已清除');
  }
}

// 导出单例实例
const cacheManager = new CacheManager();
module.exports = cacheManager;