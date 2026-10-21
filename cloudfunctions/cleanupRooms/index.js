// 旧清理入口已停用；超时房间由 counterService 的定时结算任务处理。
exports.main = async () => ({ success: false, error: '请部署 counterService 定时结算任务' })
