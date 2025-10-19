/**
 * 检查活跃房间云函数
 * 查找用户创建或参与的活跃房间
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 检查活跃房间
 */
exports.main = async (event, context) => {
  console.log('检查活跃房间云函数被调用')
  const wxContext = cloud.getWXContext()
  console.log('微信上下文:', { OPENID: wxContext.OPENID, APPID: wxContext.APPID })
  
  try {
    const openId = wxContext.OPENID
    console.log('用户openId:', openId)
    
    // 查找用户创建或参与的活跃房间
    const result = await db.collection('rooms')
      .where({
        status: 'active',
        players: db.command.elemMatch({
          openId: openId
        })
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()
    
    console.log('查找结果:', result)
    
    if (result.data && result.data.length > 0) {
      const room = result.data[0]
      console.log('找到房间:', room._id)
      
      // 检查房间是否超时（超过24小时）
      const now = new Date()
      const roomTime = new Date(room.createTime)
      const hoursDiff = (now - roomTime) / (1000 * 60 * 60)
      
      console.log('房间时间差（小时）:', hoursDiff)
      
      if (hoursDiff < 24) {
        console.log('房间未超时，返回房间信息')
        return {
          success: true,
          room: room
        }
      } else {
        console.log('房间已超时，关闭房间')
        // 关闭超时的房间
        await db.collection('rooms').doc(room._id).update({
          data: { status: 'closed' }
        })
        return {
          success: false,
          message: '房间已超时'
        }
      }
    }
    
    console.log('未找到活跃房间')
    return {
      success: false,
      message: '未找到活跃房间'
    }
  } catch (error) {
    console.error('检查活跃房间失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
