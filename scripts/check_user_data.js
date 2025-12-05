// 数据库用户数据检查脚本
// 检查users表中哪些用户缺少statistics字段

const cloudbase = require('@cloudbase/js-sdk');

// 初始化云开发环境
const app = cloudbase.init({
  env: '你的云开发环境ID'
});

async function checkUserData() {
  try {
    console.log('开始检查用户数据...');
    
    // 获取所有用户数据
    const usersSnapshot = await app.database().collection('users').get();
    console.log('总用户数:', usersSnapshot.data.length);
    
    let missingStatsCount = 0;
    let hasStatsCount = 0;
    let noGamedataCount = 0;
    let hasGamedataArrayCount = 0;
    
    for (const user of usersSnapshot.data) {
      const { openId, nickName, statistics, gamedata } = user;
      
      if (!statistics) {
        console.log('缺少statistics字段:', {
          openId: openId,
          nickName: nickName,
          gamedataType: typeof gamedata,
          isArray: Array.isArray(gamedata)
        });
        missingStatsCount++;
      } else {
        hasStatsCount++;
      }
      
      if (!gamedata) {
        console.log('缺少gamedata字段:', {
          openId: openId,
          nickName: nickName
        });
        noGamedataCount++;
      } else if (Array.isArray(gamedata)) {
        hasGamedataArrayCount++;
      } else {
        console.log('gamedata不是数组类型:', {
          openId: openId,
          nickName: nickName,
          gamedataType: typeof gamedata
        });
      }
    }
    
    console.log('\n检查结果:');
    console.log('- 总用户数:', usersSnapshot.data.length);
    console.log('- 有statistics字段的用户:', hasStatsCount);
    console.log('- 缺少statistics字段的用户:', missingStatsCount);
    console.log('- 有gamedata数组的用户:', hasGamedataArrayCount);
    console.log('- 缺少gamedata字段的用户:', noGamedataCount);
    
    if (missingStatsCount > 0) {
      console.log('\n需要修复这些用户的数据结构');
    }
    
  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

// 运行检查
checkUserData();