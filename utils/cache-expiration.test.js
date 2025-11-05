// 缓存过期机制测试脚本
console.log('开始测试缓存过期机制...');

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

// 重置缓存
cacheManager.clearAll();

// 测试1: 测试通用二维码过期机制
console.log('\n=== 测试通用二维码过期机制 ===');
const testGeneralQRCode = 'https://example.com/general_qrcode_expired_test.jpg';

// 设置一个模拟的过期时间（1小时前的时间戳）
const expiredTimestamp = Date.now() - (60 * 60 * 1000) - 1000; // 1小时1秒前

// 直接操作缓存对象来模拟过期数据
cacheManager.cache.qrcode.general = {
  value: testGeneralQRCode,
  timestamp: expiredTimestamp
};

console.log(`设置过期的通用二维码，时间戳: ${expiredTimestamp} (当前时间: ${Date.now()})`);

// 尝试获取过期的二维码
const expiredQRCode = cacheManager.getGeneralQRCode();
console.log(`获取过期二维码的结果: ${expiredQRCode}`);
console.log(`过期二维码缓存测试${expiredQRCode === null ? '通过' : '失败'}`);

// 测试2: 测试房间二维码过期机制
console.log('\n=== 测试房间二维码过期机制 ===');
const testRoomId = 'room_expired_test';
const testRoomQRCode = 'https://example.com/room_qrcode_expired_test.jpg';

// 设置一个模拟的过期时间（1小时前的时间戳）
cacheManager.cache.qrcode.rooms[testRoomId] = {
  value: testRoomQRCode,
  timestamp: expiredTimestamp
};

console.log(`设置过期的房间二维码，时间戳: ${expiredTimestamp} (当前时间: ${Date.now()})`);

// 尝试获取过期的房间二维码
const expiredRoomQRCode = cacheManager.getRoomQRCode(testRoomId);
console.log(`获取过期房间二维码的结果: ${expiredRoomQRCode}`);
console.log(`过期房间二维码缓存测试${expiredRoomQRCode === null ? '通过' : '失败'}`);

// 测试3: 测试有效的二维码不会过期
console.log('\n=== 测试有效的二维码不会过期 ===');
const testValidQRCode = 'https://example.com/general_qrcode_valid_test.jpg';

// 设置一个有效的时间戳（1分钟前）
const validTimestamp = Date.now() - (60 * 1000); // 1分钟前

cacheManager.cache.qrcode.general = {
  value: testValidQRCode,
  timestamp: validTimestamp
};

console.log(`设置有效的通用二维码，时间戳: ${validTimestamp} (当前时间: ${Date.now()})`);

// 尝试获取有效的二维码
const validQRCode = cacheManager.getGeneralQRCode();
console.log(`获取有效二维码的结果: ${validQRCode}`);
console.log(`有效二维码缓存测试${validQRCode === testValidQRCode ? '通过' : '失败'}`);

console.log('\n=== 缓存过期机制测试完成 ===');