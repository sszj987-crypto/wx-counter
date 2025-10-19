# 图片资源说明

此目录用于存放小程序所需的图片资源。

## 🚨 临时解决方案

由于图标文件缺失，我已经暂时移除了 TabBar 的图标配置，只保留文字标签。这样小程序可以正常运行。

## 需要的图片文件

### TabBar 图标（可选）
- `home.png` - 主页未选中图标
- `home-active.png` - 主页选中图标  
- `settings.png` - 设置未选中图标
- `settings-active.png` - 设置选中图标

### 其他图片
- `default-avatar.png` - 默认头像
- `share-banner.png` - 分享卡片图片

## 图标规格要求

### TabBar 图标
- 尺寸：81px × 81px
- 格式：PNG
- 背景：透明
- 颜色：灰色（未选中）/ 蓝色（选中）

### 其他图片
- 默认头像：建议 200px × 200px
- 分享图片：建议 500px × 400px

## 快速获取图标的方法

### 方法1：使用在线图标生成器
1. 访问 https://iconfont.cn/ 或 https://www.iconfinder.com/
2. 搜索"home"和"settings"图标
3. 下载PNG格式，调整尺寸为81×81px

### 方法2：使用字体图标
1. 下载Font Awesome或其他图标字体
2. 转换为PNG格式
3. 调整尺寸和颜色

### 方法3：使用AI生成
1. 使用ChatGPT、Claude等AI工具
2. 生成简单的SVG图标
3. 转换为PNG格式

## 添加图标的步骤

1. 将图标文件放入 `images/` 目录
2. 在 `app.json` 中恢复图标配置：
```json
{
  "pagePath": "pages/home/home",
  "text": "主页",
  "iconPath": "images/home.png",
  "selectedIconPath": "images/home-active.png"
}
```

## 注意事项

1. 所有图片都应该使用 PNG 格式以保证透明度和清晰度
2. 图标应该简洁明了，符合小程序设计规范
3. 建议使用矢量图标转换为位图，确保在不同分辨率下都有良好显示效果
4. 如果没有图标，小程序仍然可以正常运行，只是TabBar只显示文字




