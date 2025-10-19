/**
 * 生成小程序码云函数
 * 用于房间分享
 */
const cloud = require('wx-server-sdk')
cloud.init()
/**
 * 生成小程序码
 * @param {Object} event - 事件参数
 * @param {string} event.roomId - 房间ID
 * @param {string} event.page - 页面路径
 */
exports.main = async (event, context) => {
  const { roomId, page = 'pages/room/room' } = event
  
  try {
    // 调用小程序码生成API
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: `roomId=${roomId}`,
      page: page,
      width: 430,
      autoColor: false,
      lineColor: { "r": 0, "g": 0, "b": 0 },
      isHyaline: false
    })

    // 将图片上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: `qrcodes/room_${roomId}_${Date.now()}.jpg`,
      fileContent: result.buffer
    })

    return {
      success: true,
      qrcodeUrl: uploadResult.fileID,
      roomId: roomId
    }
  } catch (error) {
    console.error('生成小程序码失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
