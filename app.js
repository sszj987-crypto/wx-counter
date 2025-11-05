// app.js

App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        env: 'cloud1-5gh1bbz293882237',
        traceUser: true,
      });
    }

    // 初始化缓存管理器
    const cacheManager = require('./utils/cache.js');
    cacheManager.loadFromStorage();

    this.globalData = {
      // 全局变量
      cacheManager: cacheManager
    };
  },
  
  onShow: function() {
    // 小程序从后台进入前台时，重新加载缓存
    if (this.globalData.cacheManager) {
      this.globalData.cacheManager.loadFromStorage();
    }
  }
});
