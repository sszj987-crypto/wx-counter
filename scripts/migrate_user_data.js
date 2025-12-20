// 数据迁移脚本 - 修复用户数据结构问题
// 用于修复gamedata和statistics字段不匹配的情况

const cloudbase = require('@cloudbase/js-sdk');

// 初始化云开发环境
const app = cloudbase.init({
  env: '你的云开发环境ID'
});

async function migrateUserData() {
  try {
    console.log('🔄 开始数据迁移...');
    
    // 获取所有用户数据
    const usersSnapshot = await app.database().collection('users').get();
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const user of usersSnapshot.data) {
      try {
        const { openId, gamedata, statistics, gamemate } = user;
        let needsUpdate = false;
        let updates = {};
        
        console.log(`\n👤 检查用户: ${user.nickName || 'Unknown'} (${openId})`);
        
        // 检查gamedata结构
        if (gamedata === undefined || gamedata === null) {
          console.log(`  ❌ 缺少gamedata字段，设置为空数组`);
          updates.gamedata = [];
          needsUpdate = true;
        } else if (typeof gamedata === 'object' && !Array.isArray(gamedata)) {
          if (gamedata.records && Array.isArray(gamedata.records)) {
            console.log(`  🔄 gamedata为旧对象结构，迁移为数组`);
            updates.gamedata = gamedata.records;
            needsUpdate = true;
          } else {
            // 如果gamedata是对象但没有records属性，保留其结构
            console.log(`  ⚠️  gamedata为对象但没有records属性，保留其结构`);
            // 不修改gamedata字段，避免数据丢失
          }
        } else if (Array.isArray(gamedata)) {
          console.log(`  ✅ gamedata为正确数组结构，长度: ${gamedata.length}`);
        } else {
          console.log(`  ❌ gamedata类型异常: ${typeof gamedata}，设置为空数组`);
          updates.gamedata = [];
          needsUpdate = true;
        }
        
        // 检查statistics字段
        if (statistics === undefined || statistics === null) {
          console.log(`  ❌ 缺少statistics字段，需要重新计算`);
          // 重新计算统计数据
          const stats = calculateStatsFromGamedata(updates.gamedata || gamedata || []);
          updates.statistics = stats;
          needsUpdate = true;
        } else {
          // 验证statistics字段的完整性
          const expectedStats = ['totalGames', 'totalScore', 'wins', 'losses', 'draws', 'winRate', 'netScore'];
          const missingStats = expectedStats.filter(key => statistics[key] === undefined);
          
          if (missingStats.length > 0) {
            console.log(`  ⚠️  statistics缺少字段: ${missingStats.join(', ')}`);
            const currentStats = { ...statistics };
            // 补充缺少的字段
            for (const key of missingStats) {
              currentStats[key] = 0;
            }
            updates.statistics = currentStats;
            needsUpdate = true;
          } else {
            console.log(`  ✅ statistics字段完整`);
          }
        }
        
        // 检查gamemate字段
        if (gamemate === undefined || gamemate === null) {
          console.log(`  ❌ 缺少gamemate字段，设置为空数组`);
          updates.gamemate = [];
          needsUpdate = true;
        } else if (!Array.isArray(gamemate)) {
          console.log(`  ⚠️  gamemate不是数组，设置为空数组`);
          updates.gamemate = [];
          needsUpdate = true;
        } else {
          console.log(`  ✅ gamemate为数组，长度: ${gamemate.length}`);
        }
        
        // 执行更新
        if (needsUpdate) {
          await app.database().collection('users').doc(openId).update(updates);
          migratedCount++;
          console.log(`  ✅ 数据更新成功`);
        } else {
          console.log(`  ✅ 数据结构正确，无需更新`);
        }
        
      } catch (userError) {
        console.error(`  ❌ 处理用户 ${user.openId} 时出错:`, userError.message);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 数据迁移完成！`);
    console.log(`📊 迁移统计:`);
    console.log(`   - 迁移用户数: ${migratedCount}`);
    console.log(`   - 错误数: ${errorCount}`);
    console.log(`   - 总用户数: ${usersSnapshot.data.length}`);
    
  } catch (error) {
    console.error('❌ 数据迁移失败:', error.message);
  }
}

// 从gamedata计算统计数据的函数
function calculateStatsFromGamedata(gamedataArray) {
  if (!Array.isArray(gamedataArray)) {
    return {
      totalGames: 0,
      totalScore: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      netScore: 0
    };
  }
  
  const stats = {
    totalGames: gamedataArray.length,
    totalScore: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    netScore: 0
  };
  
  let totalScore = 0;
  let netScore = 0;
  
  for (const record of gamedataArray) {
    if (record && typeof record === 'object') {
      const score = record.score || 0;
      totalScore += score;
      netScore += score;
      
      if (score > 0) {
        stats.wins++;
      } else if (score < 0) {
        stats.losses++;
      } else {
        stats.draws++;
      }
    }
  }
  
  stats.totalScore = totalScore;
  stats.netScore = netScore;
  stats.winRate = stats.totalGames > 0 ? (stats.wins / stats.totalGames * 100).toFixed(1) : 0;
  
  return stats;
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('请在微信开发者工具的控制台中运行此脚本');
  console.log('或者通过以下命令: node scripts/migrate_user_data.js');
}

// 导出函数供其他模块使用
module.exports = {
  migrateUserData,
  calculateStatsFromGamedata
};