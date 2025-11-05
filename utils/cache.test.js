// 缓存管理器测试脚本
console.log('开始测试缓存管理器...');

// 模拟微信存储API
const mockStorage = {};

wx = {
  setStorageSync: (key, value) => {
    mockStorage[key] = value;
    console.log(`设置缓存: ${key} = ${JSON.stringify(value)}`);
  },
  getStorageSync: (key) => {
    const value = mockStorage[key];
    console.log(`获取缓存: ${key} = ${JSON.stringify(value)}`);
    return value || '';
  }
};

// 引入缓存管理器
const cacheManager = require('./cache.js');

// 测试1: 测试OpenID缓存
console.log('\n=== 测试OpenID缓存 ===');
const testOpenId = 'test_openid_12345';
cacheManager.setOpenId(testOpenId);
const cachedOpenId = cacheManager.getOpenId();
console.log(`缓存的OpenID: ${cachedOpenId}`);
console.log(`OpenID缓存测试${cachedOpenId === testOpenId ? '通过' : '失败'}`);

// 测试2: 测试通用二维码缓存
console.log('\n=== 测试通用二维码缓存 ===');
const testGeneralQRCode = 'https://example.com/general_qrcode.jpg';
cacheManager.setGeneralQRCode(testGeneralQRCode);
const cachedGeneralQRCode = cacheManager.getGeneralQRCode();
console.log(`缓存的通用二维码: ${cachedGeneralQRCode}`);
console.log(`通用二维码缓存测试${cachedGeneralQRCode === testGeneralQRCode ? '通过' : '失败'}`);

// 测试3: 测试房间二维码缓存
console.log('\n=== 测试房间二维码缓存 ===');
const testRoomId = 'room_001';
const testRoomQRCode = 'https://example.com/room_qrcode_001.jpg';
cacheManager.setRoomQRCode(testRoomId, testRoomQRCode);
const cachedRoomQRCode = cacheManager.getRoomQRCode(testRoomId);
console.log(`缓存的房间二维码: ${cachedRoomQRCode}`);
console.log(`房间二维码缓存测试${cachedRoomQRCode === testRoomQRCode ? '通过' : '失败'}`);

// 测试4: 测试本地存储
console.log('\n=== 测试本地存储 ===');
cacheManager.saveToStorage();
console.log('缓存已保存到本地存储');

// 创建新的缓存管理器实例来模拟小程序重启
console.log('\n=== 模拟小程序重启 ===');
const newCacheManager = require('./cache.js');
newCacheManager.loadFromStorage();
const restoredOpenId = newCacheManager.getOpenId();
const restoredGeneralQRCode = newCacheManager.getGeneralQRCode();
const restoredRoomQRCode = newCacheManager.getRoomQRCode(testRoomId);
console.log(`从本地存储恢复的OpenID: ${restoredOpenId}`);
console.log(`从本地存储恢复的通用二维码: ${restoredGeneralQRCode}`);
console.log(`从本地存储恢复的房间二维码: ${restoredRoomQRCode}`);
console.log(`本地存储测试${restoredOpenId === testOpenId && restoredGeneralQRCode === testGeneralQRCode && restoredRoomQRCode === testRoomQRCode ? '通过' : '失败'}`);

// 测试5: 测试缓存清除
console.log('\n=== 测试缓存清除 ===');
newCacheManager.clearRoomQRCode(testRoomId);
const clearedRoomQRCode = newCacheManager.getRoomQRCode(testRoomId);
console.log(`清除后的房间二维码: ${clearedRoomQRCode}`);
console.log(`缓存清除测试${clearedRoomQRCode === null ? '通过' : '失败'}`);

console.log('\n=== 所有测试完成 ===');