// 个人历史由 user_game_records 游标分页；汇总统计直接取 users.statistics。
const counter = require('../../utils/counter-service.js')

const emptyStatistics = () => ({ totalGames: 0, wins: 0, losses: 0, draws: 0, totalScore: '0.00' })

Page({
  data: {
    historyData: { records: [], statistics: emptyStatistics() },
    expandedRecordIndex: -1,
    hasMoreData: true, loadingMore: false, isSyncing: false
  },

  onShow() {
    this.nextCursor = null
    this.setData({ historyData: { records: [], statistics: emptyStatistics() },
      hasMoreData: true, expandedRecordIndex: -1 })
    this.loadHistoryData()
  },

  async loadHistoryData(loadMore = false) {
    if (this.loading || (loadMore && !this.data.hasMoreData)) return
    this.loading = true
    if (loadMore) this.setData({ loadingMore: true })
    else wx.showLoading({ title: '加载中...' })
    try {
      const response = await counter.call('listUserGameRecords', { cursor: loadMore ? this.nextCursor : null })
      const startIndex = loadMore ? this.data.historyData.records.length : 0
      const records = response.items.map((item, index) => {
        const date = new Date(item.settlementTime)
        const two = value => String(value).padStart(2, '0')
        return {
          ...item,
          _index: startIndex + index,
          myResult: item.result,
          myScore: (item.myFinalScoreHundredths / 100).toFixed(2),
          formattedTime: `${String(date.getFullYear()).slice(-2)}.${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`,
          details: item.players.map((player, playerIndex) => ({
            playerId: `${player.openId}_${playerIndex}`, nickname: player.nickName,
            avatar: player.avatarUrl || '/images/default-avatar.png',
            score: `${player.score} × ${(item.rateHundredths / 100).toFixed(2)} = ${(player.finalScoreHundredths / 100).toFixed(2)}`
          }))
        }
      })
      const statistics = response.statistics || {}
      this.nextCursor = response.nextCursor
      this.setData({
        historyData: {
          records: loadMore ? [...this.data.historyData.records, ...records] : records,
          statistics: { ...statistics,
            totalScore: ((statistics.totalScoreHundredths || 0) / 100).toFixed(2) }
        },
        hasMoreData: !!response.nextCursor,
        isSyncing: !!response.isSyncing
      })
    } catch (error) {
      console.error('获取历史记录失败:', error)
      wx.showToast({ title: error.message || '获取历史失败', icon: 'none' })
    } finally {
      this.loading = false
      if (!loadMore) wx.hideLoading()
      this.setData({ loadingMore: false })
    }
  },

  toggleRecordDetail(e) {
    const index = e.currentTarget.dataset.index
    this.setData({ expandedRecordIndex: this.data.expandedRecordIndex === index ? -1 : index })
  },

  loadMoreData() { this.loadHistoryData(true) }
})
