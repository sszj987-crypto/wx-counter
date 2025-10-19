/**
 * 使用说明页面
 * 展示小程序使用方法
 */
Page({
  /**
   * 页面的初始数据
   */
  data: {
    helpItems: [
      {
        title: '如何创建房间？',
        content: '1. 点击主页面的"开始计分 - 各记各的"按钮\n2. 系统会自动创建一个房间并生成二维码\n3. 其他玩家可以扫码加入房间'
      },
      {
        title: '如何加入房间？',
        content: '1. 扫描房间二维码\n2. 或者点击分享链接进入房间\n3. 首次使用需要设置头像和昵称'
      },
      {
        title: '如何进行计分？',
        content: '1. 在房间页面查看所有玩家列表\n2. 点击"给分"按钮\n3. 输入要给对方的分数\n4. 确认后分数会自动转移并实时同步给所有人'
      },
      {
        title: '分数规则说明',
        content: '• 每次给分时，您的分数会减少对应数值\n• 对方的分数会增加对应数值\n• 分数可以实时查看，支持负数\n• 所有操作都有记录，可在统计页面查看'
      },
      {
        title: '如何查看数据统计？',
        content: '1. 进入设置页面\n2. 点击"数据统计"按钮\n3. 可以查看总游戏次数、累计得分、胜率等信息'
      },
      {
        title: '如何分享给好友？',
        content: '1. 在房间页面点击"邀请好友"按钮\n2. 选择要分享的好友\n3. 好友点击链接即可直接加入房间'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    // 页面加载完成
  },

  /**
   * 展开/收起帮助项
   */
  toggleHelpItem(e) {
    const { index } = e.currentTarget.dataset
    const key = `helpItems[${index}].expanded`
    const currentExpanded = this.data.helpItems[index].expanded
    
    this.setData({
      [key]: !currentExpanded
    })
  },

  /**
   * 页面分享
   */
  onShareAppMessage() {
    return {
      title: '可乐计分器小程序使用说明',
      path: '/pages/home/home'
    }
  }
})

