// 云函数入口
const cloud = require('wx-server-sdk')

cloud.init()

// 获取当前时间
const now = new Date()
const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000)  // 24小时之前的时间

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database()

  try {
    // 查询 rooms 表中 createTime 小于 24 小时前的数据
    const res = await db.collection('rooms')
      .where({
        createTime: db.command.lt(twentyFourHoursAgo)  // 使用小于操作符
      })
      .get()

    // 如果查询到数据，执行删除操作
    if (res.data.length > 0) {
      const deletePromises = res.data.map(room => {
        return db.collection('rooms').doc(room._id).remove()
      })

      // 等待所有删除操作完成
      await Promise.all(deletePromises)

      return {
        success: true,
        message: `成功删除 ${res.data.length} 条数据`
      }
    } else {
      return {
        success: false,
        message: '没有符合条件的数据'
      }
    }
  } catch (e) {
    return {
      success: false,
      message: `删除失败: ${e.message}`
    }
  }
}