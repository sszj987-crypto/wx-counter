/**
 * 获取用户openId云函数
 * 用于前端获取当前用户的openId
 */
const cloud = require('wx-server-sdk')
cloud.init()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openId = wxContext.OPENID

  return {
    openId: openId
  }
}

