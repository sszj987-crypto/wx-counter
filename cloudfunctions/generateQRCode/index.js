/**
 * 生成小程序码云函数
 * 支持两种生成方式：
 * 1. 生成进入小程序主页的二维码（当没有roomId时）
 * 2. 生成进入特定房间的二维码（当提供roomId时）
 */
const cloud = require('wx-server-sdk')
cloud.init()
/**
 * 生成小程序码
 * @param {Object} event - 事件参数
 * @param {string} event.roomId - 可选，房间ID
 */
exports.main = async (event, context) => {
  const { roomId } = event
  
  try {
    // 确保参数格式完全正确，页面路径不能以/开头
    const params = {
      width: 430,
      autoColor: false,
      lineColor: { "r": 0, "g": 0, "b": 0 },
      isHyaline: false
    }
    
    // 开发环境降级方案：默认使用首页路径，因为wxacode.getUnlimited要求页面必须已发布
    // 但保留场景参数，这样用户扫描后仍可以获取roomId信息
    params.scene = roomId ? `roomId=${roomId}` : ''
    params.page = 'pages/home/home' // 使用首页作为统一页面路径
    
    console.log('生成小程序码参数:', params)

    // 调用小程序码生成API
    const result = await cloud.openapi.wxacode.getUnlimited(params)

    // 将图片上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: roomId ? 
        `qrcodes/room_${roomId}_${Date.now()}.jpg` : 
        `qrcodes/app_${Date.now()}.jpg`,
      fileContent: result.buffer
    })

    return {
      success: true,
      qrcodeUrl: uploadResult.fileID,
      roomId: roomId
    }
  } catch (error) {
    console.error('生成小程序码失败:', error)
    // 提供详细的错误信息
    let errorMessage = error.message || '生成小程序码失败'
    
    if (error.errCode === 41030) {
      errorMessage = '页面路径无效，请检查页面是否已发布到线上版本'
    } else if (error.errCode === -604101) {
      errorMessage = '权限错误，请检查云函数权限配置'
    }
    
    return {
      success: false,
      error: errorMessage,
      originalError: error
    }
  }
}

