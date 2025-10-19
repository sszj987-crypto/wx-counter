/**
 * 更新用户信息云函数
 * 处理用户昵称和头像的更新
 */
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('updateUserInfo 云函数被调用，参数:', event)
  const { userInfo } = event
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID
  console.log('用户 openId:', openId)

  try {
    // 验证参数
    if (!userInfo || !userInfo.nickName) {
      return { success: false, error: '用户信息不完整' }
    }

    const userRef = db.collection('users').doc(openId)
    const userDoc = await userRef.get().catch(() => ({ data: null }))

    if (userDoc.data) {
      console.log('更新现有用户信息')
      await userRef.update({
        data: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl || '',
          updateTime: new Date()
        }
      })
    } else {
      console.log('创建新用户信息')
      await db.collection('users').add({
        data: {
          _id: openId,
          openId: openId,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl || '',
          totalGames: 0,
          totalScore: 0,
          createTime: new Date(),
          updateTime: new Date()
        }
      })
    }

    console.log('用户信息更新/创建成功')
    return { success: true }
  } catch (error) {
    console.error('更新用户信息失败:', error)
    return { success: false, error: error.message }
  }
}
