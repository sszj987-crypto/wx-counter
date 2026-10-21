/**
 * 排行榜页面逻辑
 * 使用服务端汇总统计显示本人和曾同局的玩家
 */
const counter = require('../../utils/counter-service.js')

Page({
  data: { sortType: 'winRate', rankingList: [], loading: false },

  onShow() { this.loadRankingData() },

  async loadRankingData() {
    this.setData({ loading: true })
    try {
      const response = await counter.call('getRanking')
      const rankingList = response.items.map(item => {
        const stats = item.statistics
        return {
          ...item,
          totalGames: stats.totalGames,
          wins: stats.wins, losses: stats.losses, draws: stats.draws,
          totalScore: (stats.totalScoreHundredths / 100).toFixed(2),
          netScore: Number((stats.netScoreHundredths / 100).toFixed(2)),
          winRate: stats.winRate,
          winRateDisplay: (stats.winRate * 100).toFixed(1) + '%'
        }
      })
      this.setData({ rankingList })
      this.sortRanking()
    } catch (error) {
      console.error('加载排行榜数据失败:', error)
      wx.showToast({ title: error.message || '加载排行榜失败', icon: 'none' })
    } finally { this.setData({ loading: false }) }
  },

  changeSortType(e) {
    this.setData({ sortType: e.currentTarget.dataset.type })
    this.sortRanking()
  },

  sortRanking() {
    const { sortType } = this.data
    const rankingList = [...this.data.rankingList].sort((a, b) =>
      sortType === 'winRate'
        ? b.winRate - a.winRate || b.netScore - a.netScore
        : b.netScore - a.netScore || b.winRate - a.winRate)
    this.setData({ rankingList })
  },

  onShareAppMessage() {
    return { title: '查看可乐计分器排行榜', path: '/pages/ranking/ranking',
      imageUrl: '/images/小程序码.jpg' }
  },

  onShareTimeline() {
    return { title: '查看可乐计分器排行榜', imageUrl: '/images/小程序码.jpg' }
  }
})
