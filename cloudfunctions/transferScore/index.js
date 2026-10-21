/**
 * 旧计分入口已停用。新客户端使用 counterService 的 transferScore 动作，
 * 以便操作 ID、房间余额与独立流水在同一事务中提交。
 */
exports.main = async () => ({ success: false, error: '请更新小程序后重试给分' })
