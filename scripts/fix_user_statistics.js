// 用户统计数据修复脚本
// 确保所有用户都有正确的statistics字段

const cloudbase = require('@cloudbase/js-sdk');

// 初始化云开发环境
const app = cloudbase.init({
  env: '你的云开发环境ID'
});

async function fixUserStatistics() {
  try {
    console.log('🔧 开始修复用户统计数据...');
    
    // 获取所有用户数据
    const usersSnapshot = await app.database().collection('users').get();
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const user of usersSnapshot.data) {
      try {
        const { openId, gamedata, statistics } = user;
        
        console.log(`\n👤 检查用户: ${user.nickName || 'Unknown'} (${openId})`);
        
        // 检查是否需要修复statistics
        let needsUpdate = false;
        let newStatistics = {};
        
        // 如果没有statistics字段，重新计算
        if (!statistics || typeof statistics !== 'object') {
          console.log(`  ❌ 缺少或无效的statistics字段`);
          newStatistics = calculateStatsFromGamedata(gamedata || []);
          needsUpdate = true;
        } else {
          // 验证现有statistics字段
          const expectedFields = ['totalGames', 'totalScore', 'wins', 'losses', 'draws', 'winRate', 'netScore'];
          let missingFields = [];
          let incorrectFields = [];
          
          for (const field of expectedFields) {
            if (statistics[field] === undefined || statistics[field] === null) {
              missingFields.push(field);
            }
          }
          
          // 检查数据一致性
          const calculatedStats = calculateStatsFromGamedata(gamedata || []);
          for (const field of expectedFields) {
            if (statistics[field] !== calculatedStats[field]) {
              incorrectFields.push(field);
            }
          }
          
          if (missingFields.length > 0) {
            console.log(`  ⚠️  statistics缺少字段: ${missingFields.join(', ')}`);
            newStatistics = { ...statistics };
            for (const field of missingFields) {
              newStatistics[field] = calculatedStats[field];
            }
            needsUpdate = true;
          }
          
          if (incorrectFields.length > 0) {
            console.log(`  ⚠️  statistics字段数据不一致: ${incorrectFields.join(', ')}`);
            console.log(`     当前值:`, JSON.stringify(statistics));
            console.log(`     应该为:`, JSON.stringify(calculatedStats));
            newStatistics = calculatedStats;
            needsUpdate = true;
          }
          
          if (!needsUpdate) {
            console.log(`  ✅ statistics字段正确`);
          }
        }
        
        // 执行更新
        if (needsUpdate) {
          await app.database().collection('users').doc(openId).update({
            statistics: newStatistics
          });
          fixedCount++;
          console.log(`     统计数据修复成功`);
          console.log(`     新统计数据:`, JSON.stringify(newStatistics));
        }
        
      } catch (userError) {
        console.error(`  ❌ 处理用户 ${user.openId} 时出错:`, userError.message);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 统计数据修复完成！`);
    console.log(`📊 修复统计:`);
    console.log(`   - 修复用户数: ${fixedCount}`);
    console.log(`   - 错误数: ${errorCount}`);
    console.log(`   - 总用户数: ${usersSnapshot.data.length}`);
    
    return {
      totalUsers: usersSnapshot.data.length,
      fixedUsers: fixedCount,
      errorCount: errorCount
    };
    
  } catch (error) {
    console.error('❌ 统计数据修复失败:', error.message);
    throw error;
  }
}

// 从gamedata计算统计数据的函数（与ranking.js中的逻辑保持一致）
function calculateStatsFromGamedata(gamedata) {
  if (!Array.isArray(gamedata)) {
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
  
  let totalGames = 0;
  let totalScore = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  
  // 遍历用户的所有游戏记录
  gamedata.forEach(game => {
    // 根据新的gamedata结构，score信息在myScore字段
    let score = 0;
    if (game && typeof game === 'object') {
      score = game.myScore || game.score || 0;
    }
    
    totalGames += 1;
    totalScore += score;
    
    if (score > 0) {
      wins++;
    } else if (score < 0) {
      losses++;
    } else {
      draws++;
    }
  });
  
  // 计算胜率
  const winRate = totalGames > 0 ? (wins / totalGames) : 0;
  // 计算净胜分
  const netScore = totalScore;
  
  return {
    totalGames,
    totalScore,
    wins,
    losses,
    draws,
    winRate,
    netScore
  };
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('请在微信开发者工具的控制台中运行此脚本');
  console.log('或者通过以下命令: node scripts/fix_user_statistics.js');
}

// 导出函数供其他模块使用
module.exports = {
  fixUserStatistics,
  calculateStatsFromGamedata
};