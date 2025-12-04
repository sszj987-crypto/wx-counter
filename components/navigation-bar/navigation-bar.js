Component({
  options: {
    multipleSlots: true // 在组件定义时的选项中启用多slot支持
  },
  /**
   * 组件的属性列表
   */
  properties: {
    extClass: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    background: {
      type: String,
      value: ''
    },
    color: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    homeButton: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    },
    animated: {
      // 显示隐藏的时候opacity动画效果
      type: Boolean,
      value: true
    },
    show: {
      // 显示隐藏导航，隐藏的时候navigation-bar的高度占位还在
      type: Boolean,
      value: true,
      observer: '_showChange'
    },
    // back为true的时候，返回的页面深度
    delta: {
      type: Number,
      value: 1
    },
  },
  /**
   * 组件的初始数据
   */
  data: {
    displayStyle: ''
  },
  lifetimes: {
    attached() {
      const rect = wx.getMenuButtonBoundingClientRect()
      const platform = (wx.getDeviceInfo() || wx.getSystemInfoSync()).platform
      const isAndroid = platform === 'android'
      const isDevtools = platform === 'devtools'
      const { windowWidth, safeArea: { top = 0, bottom = 0 } = {} } = wx.getWindowInfo() || wx.getSystemInfoSync()
      
      // 添加对rect的检查，防止获取不到菜单按钮边界信息导致组件渲染异常
      let innerPaddingRight = ''
      let leftWidth = ''
      if (rect) {
        innerPaddingRight = `padding-right: ${windowWidth - rect.left}px`
        leftWidth = `width: ${windowWidth - rect.left}px`
      } else {
        // 如果获取不到菜单按钮边界信息，使用默认值
        innerPaddingRight = `padding-right: 15px`
        leftWidth = `width: 15px`
      }
      
      this.setData({
        ios: !isAndroid,
        innerPaddingRight,
        leftWidth,
        safeAreaTop: isDevtools || isAndroid ? `height: calc(var(--height) + ${top}px); padding-top: ${top}px` : ``
      })
    },
  },
  /**
   * 组件的方法列表
   */
  methods: {
    _showChange(show) {
      const animated = this.data.animated
      let displayStyle = ''
      if (animated) {
        displayStyle = `opacity: ${show ? '1' : '0'
          };transition:opacity 0.5s;`
      } else {
        displayStyle = `display: ${show ? '' : 'none'}`
      }
      this.setData({
        displayStyle
      })
    },
    back() {
      const data = this.data
      // 获取当前页面路径
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const pagePath = currentPage.route
      
      // 根据不同页面类型进行不同的返回处理
      if (pagePath === 'pages/settlement/settlement') {
        // 结算页面：跳转到主页而不是返回
        wx.switchTab({
          url: '/pages/home/home'
        })
      } else if (pagePath === 'pages/room/room') {
        // 房间页面：如果是分享进入的，直接跳转到首页而不是返回
        wx.switchTab({
          url: '/pages/home/home'
        })
      } else if (data.delta) {
        // 默认返回行为
        wx.navigateBack({ delta: data.delta })
      }
      
      this.triggerEvent('back', { delta: data.delta }, {})
    }
  },
  
  /**
   * 回到首页
   */
  home() {
    wx.switchTab({
      url: '/pages/home/home'
    });
    
    this.triggerEvent('home', {}, {});
  }
})
