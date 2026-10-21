// 给分详情按操作分页，批量给分的明细在页面展开。
const counter = require('../../utils/counter-service.js')

Page({
  data: {
    roomId: '', roomNumber: '', scoreRecords: [], recordCount: 0,
    isLoading: true, loadingMore: false, hasMore: true,
    largeTextEnabled: false
  },

  onLoad(options) {
    this.setData({
      roomId: options.roomId || '',
      roomNumber: options.roomNumber || '房间',
      largeTextEnabled: !!wx.getStorageSync('largeTextEnabled')
    })
    if (options.roomId) this.getScoreRecords()
  },

  onShow() { this.setData({ largeTextEnabled: !!wx.getStorageSync('largeTextEnabled') }) },

  formatTime(time) {
    const date = new Date(time)
    if (Number.isNaN(date.getTime())) return ''
    const two = value => String(value).padStart(2, '0')
    return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
  },

  async getScoreRecords(loadMore = false) {
    if (this.loading || (loadMore && !this.data.hasMore)) return
    this.loading = true
    this.setData(loadMore ? { loadingMore: true } : { isLoading: true })
    try {
      const [page, snapshot] = await Promise.all([
        counter.call('listScoreOperations', { roomId: this.data.roomId,
          cursor: loadMore ? this.nextCursor : null }),
        loadMore ? Promise.resolve(null) : counter.call('getRoomSnapshot', { roomId: this.data.roomId })
      ])
      const records = page.items.flatMap(operation => operation.transfers.map(transfer => ({
        ...transfer,
        fromPlayerNickName: transfer.fromNickName,
        toPlayerNickName: transfer.toNickName,
        createTime: operation.createdAt,
        displayTime: this.formatTime(operation.createdAt),
        operationId: operation._id
      })))
      this.nextCursor = page.nextCursor
      this.setData({
        scoreRecords: loadMore ? [...this.data.scoreRecords, ...records] : records,
        recordCount: snapshot ? snapshot.room.transferCount || 0 : this.data.recordCount,
        hasMore: !!page.nextCursor
      })
    } catch (error) {
      console.error('获取给分记录失败:', error)
      wx.showToast({ title: error.message || '获取记录失败', icon: 'none' })
    } finally {
      this.loading = false
      this.setData({ isLoading: false, loadingMore: false })
    }
  },

  loadMoreData() { this.getScoreRecords(true) },
  onBackPress() { wx.navigateBack(); return true }
})
