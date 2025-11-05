# 缓存管理模块使用说明

## 概述

本模块提供了一个缓存管理器，用于缓存openid和二维码数据，以减少云函数调用次数，提升小程序性能和用户体验。

## 功能特性

1. **OpenID缓存**：缓存用户OpenID，避免重复调用getOpenId云函数
2. **二维码缓存**：
   - 通用二维码缓存（不带roomId）
   - 房间二维码缓存（带roomId，按房间ID分别缓存）
3. **智能过期机制**：缓存数据具有过期时间，确保数据新鲜度
4. **本地存储持久化**：缓存数据会保存到本地存储，即使小程序重启也能继续使用

## 使用方法

### 1. 引入缓存管理器

```javascript
const cacheManager = require('../utils/cache.js');
```

### 2. 获取OpenID缓存

```javascript
// 尝试从缓存获取openid
let openId = cacheManager.getOpenId();

if (!openId) {
  // 缓存中没有openid，调用云函数获取
  const { result } = await wx.cloud.callFunction({
    name: 'getOpenId'
  });
  openId = result.openId;
  // 将openid存入缓存
  cacheManager.setOpenId(openId);
}
```

### 3. 获取通用二维码缓存

```javascript
// 尝试从缓存获取通用二维码
let qrcodeUrl = cacheManager.getGeneralQRCode();

if (!qrcodeUrl) {
  // 缓存中没有二维码，调用云函数生成
  const result = await wx.cloud.callFunction({
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
```

### 4. 获取房间二维码缓存

```javascript
// 尝试从缓存获取房间二维码
let qrcodeUrl = cacheManager.getRoomQRCode(roomId);

if (!qrcodeUrl) {
  // 缓存中没有二维码，调用云函数生成
  const result = await wx.cloud.callFunction({
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
```

### 5. 清除缓存

```javascript
// 清除指定房间的二维码缓存
cacheManager.clearRoomQRCode(roomId);

// 清除所有房间二维码缓存（用于重新创建房间后）
cacheManager.clearAllRoomQRCodes();

// 清除所有缓存
cacheManager.clearAll();
```

## 缓存策略

1. **OpenID缓存**：永不过期（在小程序生命周期内）
2. **二维码缓存**：默认1小时过期
3. **存储方式**：使用wx.setStorageSync/wx.getStorageSync进行本地存储

## 优势

1. **减少云函数调用**：避免重复调用getOpenId和generateQRCode云函数
2. **提升响应速度**：从本地缓存读取数据比调用云函数更快
3. **节省云资源**：减少云函数调用次数，节省云资源消耗
4. **改善用户体验**：加快页面加载速度，提升用户体验