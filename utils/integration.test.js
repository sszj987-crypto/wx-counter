// 集成测试脚本 - 模拟真实的小程序使用场景
console.log('开始集成测试...');

// 模拟微信存储API
const mockStorage = {};

wx = {
  setStorageSync: (key, value) => {
    mockStorage[key] = value;
    // console.log(`设置缓存: ${key} = ${JSON.stringify(value)}`);
  },
  getStorageSync: (key) => {
    const value = mockStorage[key];
    // console.log(`获取缓存: ${key} = ${JSON.stringify(value)}`);
    return value || '';
  }
};

// 模拟云函数调用
const mockCloudCalls = {
  getOpenId: 0,
  generateQRCode: 0
};

const wxCloud = {
  callFunction: async (options) => {
    if (options.name === 'getOpenId') {
      mockCloudCalls.getOpenId++;
      console.log(`调用getOpenId云函数 (第${mockCloudCalls.getOpenId}次)`);
      return {
        result: {
          openId: 'openid_' + Date.now()
        }
      };
    } else if (options.name === 'generateQRCode') {
      mockCloudCalls.generateQRCode++;
      console.log(`调用generateQRCode云函数 (第${mockCloudCalls.generateQRCode}次)`);
      if (options.data.roomId) {
        return {
          result: {
            success: true,
            qrcodeUrl: `https://example.com/room_qrcode_${options.data.roomId}.jpg`
          }
        };
      } else {
        return {
          result: {
            success: true,
            qrcodeUrl: 'https://example.com/general_qrcode.jpg'
          }
        };
      }
    }
  }
};

// 模拟getApp()
global.getApp = function() {
  return {
    globalData: {
      cacheManager: require('./cache.js')
    }
  };
};

// 模拟页面逻辑
class MockPage {
  constructor() {
    this.data = {};
  }
  
  setData(obj) {
    Object.assign(this.data, obj);
  }
}

// 模拟room.js中的逻辑
class RoomPage extends MockPage {
  async joinRoom() {
    const app = getApp();
    const cacheManager = app.globalData.cacheManager;
    
    // 尝试从缓存获取openid
    let openId = cacheManager.getOpenId();
    
    if (!openId) {
      // 缓存中没有openid，调用云函数获取
      const { result } = await wxCloud.callFunction({
        name: 'getOpenId'
      });
      openId = result.openId;
      // 将openid存入缓存
      cacheManager.setOpenId(openId);
    }
    
    console.log('获取到的openid:', openId);
    return openId;
  }
  
  async showQRCodeModal(roomId) {
    const app = getApp();
    const cacheManager = app.globalData.cacheManager;
    
    // 尝试从缓存获取房间二维码
    let qrcodeUrl = cacheManager.getRoomQRCode(roomId);
    
    if (!qrcodeUrl) {
      // 缓存中没有二维码，调用云函数生成
      const result = await wxCloud.callFunction({
        name: 'generateQRCode',
        data: {
          roomId: roomId
        }
      });
      
      if (result.result.success) {
        qrcodeUrl = result.result.qrcodeUrl;
        // 将二维码存入缓存
        cacheManager.setRoomQRCode(roomId, qrcodeUrl);
      }
    }
    
    this.setData({
      qrcodeUrl: qrcodeUrl,
      showQrcode: true
    });
    
    console.log(`房间${roomId}二维码已显示:`, qrcodeUrl);
    return qrcodeUrl;
  }
  
  createRoom() {
    // 模拟创建房间后清除所有房间二维码缓存
    const app = getApp();
    const cacheManager = app.globalData.cacheManager;
    cacheManager.clearAllRoomQRCodes();
    console.log('创建房间后清除所有房间二维码缓存');
  }
}

// 模拟settings.js中的逻辑
class SettingsPage extends MockPage {
  async onShareTap() {
    const app = getApp();
    const cacheManager = app.globalData.cacheManager;
    
    // 尝试从缓存获取通用二维码
    let qrcodeUrl = cacheManager.getGeneralQRCode();
    
    if (!qrcodeUrl) {
      // 缓存中没有二维码，调用云函数生成
      const result = await wxCloud.callFunction({
        name: 'generateQRCode',
        data: {
          page: 'pages/home/home'
        }
      });
      
      if (result.result.success) {
        qrcodeUrl = result.result.qrcodeUrl;
        // 将二维码存入缓存
        cacheManager.setGeneralQRCode(qrcodeUrl);
      }
    }
    
    this.setData({
      qrcodeUrl: qrcodeUrl,
      showQrcode: true
    });
    
    console.log('通用二维码已显示:', qrcodeUrl);
    return qrcodeUrl;
  }
}

// 开始测试
async function runIntegrationTest() {
  console.log('\n=== 测试场景1: 首次使用小程序 ===');
  const roomPage = new RoomPage();
  
  // 第一次加入房间，应该调用云函数获取openid
  await roomPage.joinRoom();
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  // 显示房间二维码，应该调用云函数生成
  await roomPage.showQRCodeModal('room_001');
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  console.log('\n=== 测试场景2: 重新进入小程序 ===');
  const newRoomPage = new RoomPage();
  
  // 第二次加入房间，应该使用缓存的openid
  await newRoomPage.joinRoom();
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  // 显示相同的房间二维码，应该使用缓存
  await newRoomPage.showQRCodeModal('room_001');
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  console.log('\n=== 测试场景3: 创建新房间 ===');
  newRoomPage.createRoom();
  
  // 显示房间二维码，应该重新调用云函数生成（因为缓存已清除）
  await newRoomPage.showQRCodeModal('room_001');
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  console.log('\n=== 测试场景4: 分享小程序 ===');
  const settingsPage = new SettingsPage();
  
  // 第一次分享，应该调用云函数生成通用二维码
  await settingsPage.onShareTap();
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  // 第二次分享，应该使用缓存的通用二维码
  await settingsPage.onShareTap();
  console.log(`云函数调用次数 - getOpenId: ${mockCloudCalls.getOpenId}, generateQRCode: ${mockCloudCalls.generateQRCode}`);
  
  console.log('\n=== 测试结果分析 ===');
  console.log(`getOpenId云函数调用次数: ${mockCloudCalls.getOpenId} (期望值: 1)`);
  console.log(`generateQRCode云函数调用次数: ${mockCloudCalls.generateQRCode} (期望值: 3)`);
  
  if (mockCloudCalls.getOpenId === 1 && mockCloudCalls.generateQRCode === 3) {
    console.log('\n🎉 集成测试通过！缓存优化功能正常工作。');
    console.log('   - OpenID只在首次使用时调用云函数获取');
    console.log('   - 二维码在首次生成后会被缓存，避免重复调用');
    console.log('   - 创建新房间后会清除房间二维码缓存，确保数据新鲜');
  } else {
    console.log('\n❌ 集成测试失败！请检查缓存逻辑。');
  }
}

// 运行测试
runIntegrationTest();