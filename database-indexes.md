# 数据库索引建议

## rooms 集合

### 推荐索引

1. **活跃房间查询索引**
   - 用途: 优化用户活跃房间查询
   - 查询语句:
     ```javascript
     db.collection('rooms')
       .where({
         players: db.command.elemMatch({
           openId: '用户openId'
         }),
         _id: db.command.exists(true)
       })
       .orderBy('createTime', 'desc')
       .limit(1)
     ```
   - 推荐索引配置:
     - createTime: 降序
     - _id: 升序
     - players: 升序

## users 集合

### 推荐索引

1. **用户信息查询索引**
   - 用途: 优化用户信息查询
   - 查询语句:
     ```javascript
     db.collection('users')
       .where({ 
         _id: '用户ID', 
         _openid: '用户openId' 
       }) 
       .get()
     ```
   - 推荐索引配置:
     - _id: 升序
     - _openid: 升序

### 创建索引的方法

在微信小程序云开发控制台中，可以通过以下方式创建索引:

1. 进入云开发控制台
2. 选择数据库
3. 选择对应的集合(rooms或users)
4. 点击"索引"标签页
5. 点击"新建索引"
6. 添加字段和排序规则:
   - 对于rooms集合:
     - createTime: -1 (降序)
     - _id: 1 (升序)
     - players: 1 (升序)
   - 对于users集合:
     - _id: 1 (升序)
     - _openid: 1 (升序)
7. 保存索引

### 注意事项

1. 索引会占用存储空间并可能影响写入性能
2. 建议根据实际查询需求创建必要的索引
3. 定期检查和优化索引使用情况