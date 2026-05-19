# 房费功能设计文档

## 概述
将现有的"台位/茶水"功能改造为"房费"功能，支持自动抽水规则。

## 数据结构

### room文档新增字段
```javascript
{
  roomFeeConfig: {
    total: 100,      // 房费总额目标（默认100）
    fullX: 10,       // 满X元（默认10）
    drawY: 1,        // 抽Y元（默认1）
    enabled: false   // 是否开启抽水
  }
}
```

### 房费玩家
- nickName: '房费'（原'台位/茶水'）
- openId: 'room_fee_' + roomId
- score: 累计收取的房费

## UI变更

### 设置面板
- "台位/茶水" → "房费"
- 新增"房费设置"按钮

### 房费设置弹窗
- 房费总额输入框（默认100）
- "满X元"输入框（默认10）
- "抽Y元"输入框（默认1）
- 保存按钮

## 云函数变更（transferScore）

### 抽水逻辑
1. 检查roomFeeConfig.enabled是否为true
2. 判断给分金额是否 >= fullX
3. 如果满足且房费玩家score < total：
   - 接收方实际得分 = 给分 - drawY
   - 房费玩家得分 += drawY
4. 发送方扣分 = 给分金额

## 兼容性
- 保留teaServiceScore字段
- 结算时房费玩家分数计入统计
- 给分详情中显示房费记录

## 默认值
- 房费总额：100
- 满X抽Y：满10抽1
