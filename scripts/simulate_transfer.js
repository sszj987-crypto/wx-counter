function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}
function makeRoom() {
  return {
    players: [
      { openId: 'A', nickName: 'A', score: 0 },
      { openId: 'B', nickName: 'B', score: 0 },
      { openId: 'C', nickName: 'C', score: 0 }
    ],
    records: []
  };
}
function makeOps(n) {
  const ids = ['A', 'B', 'C'];
  const ops = [];
  for (let i = 0; i < n; i += 1) {
    let from = ids[Math.floor(Math.random() * ids.length)];
    let to = ids[Math.floor(Math.random() * ids.length)];
    while (to === from) {
      to = ids[Math.floor(Math.random() * ids.length)];
    }
    const score = 1 + Math.floor(Math.random() * 5);
    ops.push({ from, to, score });
  }
  return ops;
}
function applyRecordsToScores(basePlayers, records) {
  const map = {};
  for (const p of basePlayers) {
    map[p.openId] = 0;
  }
  for (const r of records) {
    map[r.fromPlayerOpenId] = (map[r.fromPlayerOpenId] || 0) - r.score;
    map[r.toPlayerOpenId] = (map[r.toPlayerOpenId] || 0) + r.score;
  }
  return basePlayers.map(p => ({ openId: p.openId, score: map[p.openId] || 0 }));
}
async function naiveSimulate(ops) {
  let state = makeRoom();
  const tasks = [];
  for (const op of ops) {
    const readSnap = deepClone(state);
    const delay = Math.floor(Math.random() * 10);
    tasks.push(new Promise(res => {
      setTimeout(() => {
        const fromIndex = readSnap.players.findIndex(p => p.openId === op.from);
        const toIndex = readSnap.players.findIndex(p => p.openId === op.to);
        if (fromIndex === -1 || toIndex === -1) {
          res();
          return;
        }
        readSnap.players[fromIndex].score -= op.score;
        readSnap.players[toIndex].score += op.score;
        const record = {
          fromPlayerOpenId: op.from,
          toPlayerOpenId: op.to,
          score: op.score,
          createTime: Date.now()
        };
        state = {
          players: deepClone(readSnap.players),
          records: [...state.records, record]
        };
        res();
      }, delay);
    }));
  }
  await Promise.all(tasks);
  return state;
}
async function atomicSimulate(ops) {
  let state = makeRoom();
  const tasks = [];
  let lock = Promise.resolve();
  for (const op of ops) {
    const delay = Math.floor(Math.random() * 10);
    tasks.push(new Promise(res => {
      setTimeout(() => {
        lock = lock.then(() => {
          const fromIndex = state.players.findIndex(p => p.openId === op.from);
          const toIndex = state.players.findIndex(p => p.openId === op.to);
          if (fromIndex === -1 || toIndex === -1) {
            return;
          }
          state.players[fromIndex].score -= op.score;
          state.players[toIndex].score += op.score;
          state.records.push({
            fromPlayerOpenId: op.from,
            toPlayerOpenId: op.to,
            score: op.score,
            createTime: Date.now()
          });
        }).catch(() => {}).then(res);
      }, delay);
    }));
  }
  await Promise.all(tasks);
  return state;
}

function naiveProfileUpdate(state, openId, nick, avatar) {
  const snap = deepClone(state);
  const idx = snap.players.findIndex(p => p.openId === openId);
  if (idx >= 0) {
    snap.players[idx].nickName = nick;
    snap.players[idx].avatarUrl = avatar;
  }
  return {
    players: deepClone(snap.players),
    records: [...state.records],
    teaServiceScore: state.teaServiceScore
  };
}

function safeProfileUpdate(state, openId, nick, avatar) {
  const idx = state.players.findIndex(p => p.openId === openId);
  if (idx >= 0) {
    if (nick !== undefined) state.players[idx].nickName = nick;
    if (avatar !== undefined) state.players[idx].avatarUrl = avatar;
  }
  return state;
}

function naiveToggleTea(state) {
  const snap = deepClone(state);
  const exists = snap.players.find(p => String(p.openId).startsWith('tea_service_'));
  if (!exists) {
    const tea = { openId: 'tea_service_' + Date.now(), nickName: '台位/茶水', avatarUrl: '', score: snap.teaServiceScore || 0 };
    snap.players.push(tea);
  } else {
    const teaScore = exists.score || 0;
    snap.teaServiceScore = teaScore;
    snap.players = snap.players.filter(p => p.openId !== exists.openId);
  }
  return {
    players: deepClone(snap.players),
    records: [...state.records],
    teaServiceScore: snap.teaServiceScore
  };
}

function safeToggleTea(state) {
  const hasTea = state.players.find(p => String(p.openId).startsWith('tea_service_'));
  if (!hasTea) {
    const tea = { openId: 'tea_service_' + Date.now(), nickName: '台位/茶水', avatarUrl: '', score: state.teaServiceScore || 0 };
    state.players.push(tea);
  } else {
    state.teaServiceScore = hasTea.score || 0;
    state.players = state.players.filter(p => p.openId !== hasTea.openId);
  }
  return state;
}

function applyStalePlayers(state, stale) {
  return {
    players: deepClone(stale.players),
    records: [...state.records],
    teaServiceScore: stale.teaServiceScore
  };
}

async function mixedScenario(mode = 'safe') {
  let state = makeRoom();
  state.teaServiceScore = 0;
  const tasks = [];
  let lock = Promise.resolve();
  const transfers = makeOps(200);
  for (const op of transfers) {
    const delay = Math.floor(Math.random() * 10);
    tasks.push(new Promise(res => {
      setTimeout(() => {
        if (mode === 'naive') {
          // read-modify-write with snapshot
          const snap = deepClone(state);
          const fi = snap.players.findIndex(p => p.openId === op.from);
          const ti = snap.players.findIndex(p => p.openId === op.to);
          if (fi !== -1 && ti !== -1) {
            snap.players[fi].score -= op.score;
            snap.players[ti].score += op.score;
            snap.records.push({ fromPlayerOpenId: op.from, toPlayerOpenId: op.to, score: op.score, createTime: Date.now() });
            state = deepClone(snap);
          }
          res();
        } else {
          lock = lock.then(() => {
            const fi = state.players.findIndex(p => p.openId === op.from);
            const ti = state.players.findIndex(p => p.openId === op.to);
            if (fi !== -1 && ti !== -1) {
              state.players[fi].score -= op.score;
              state.players[ti].score += op.score;
              state.records.push({ fromPlayerOpenId: op.from, toPlayerOpenId: op.to, score: op.score, createTime: Date.now() });
            }
          }).catch(() => {}).then(res);
        }
      }, delay);
    }));
  }
  // random profile updates and tea toggles during transfers
  for (let i = 0; i < 40; i += 1) {
    const delay = Math.floor(Math.random() * 10);
    const staleSnap = deepClone(state);
    tasks.push(new Promise(res => {
      setTimeout(() => {
        const id = Math.random() < 0.5 ? 'A' : 'B';
        if (mode === 'naive') {
          let stale = staleSnap;
          const idx = stale.players.findIndex(p => p.openId === id);
          if (idx >= 0) {
            stale.players[idx].nickName = 'X' + i;
            stale.players[idx].avatarUrl = '';
          }
          stale = naiveToggleTea(stale);
          state = applyStalePlayers(state, stale);
        } else {
          lock = lock.then(() => {
            state = safeProfileUpdate(state, id, 'X' + i, '');
            state = safeToggleTea(state);
          }).catch(() => {}).then(res);
          return;
        }
        res();
      }, delay);
    }));
  }
  await Promise.all(tasks);
  // Compute expected scores for players currently in room
  const present = state.players.map(p => p.openId);
  const base = present.map(id => ({ openId: id }));
  const expected = applyRecordsToScores(base, state.records);
  const current = state.players.map(p => ({ openId: p.openId, score: p.score }));
  const delta = diff(current, expected);
  return { state, expected, delta };
}
function diff(a, b) {
  const m1 = new Map(a.map(x => [x.openId, x.score]));
  const m2 = new Map(b.map(x => [x.openId, x.score]));
  const out = [];
  for (const k of new Set([...m1.keys(), ...m2.keys()])) {
    const v1 = m1.get(k) || 0;
    const v2 = m2.get(k) || 0;
    if (v1 !== v2) {
      out.push({ openId: k, expected: v2, actual: v1 });
    }
  }
  return out;
}
async function run() {
  console.log('开始并发一致性模拟');
  const ops = makeOps(200);
  const naive = await naiveSimulate(ops);
  const atomic = await atomicSimulate(ops);
  const basePlayers = [{ openId: 'A' }, { openId: 'B' }, { openId: 'C' }];
  const naiveExpected = applyRecordsToScores(basePlayers, naive.records);
  const atomicExpected = applyRecordsToScores(basePlayers, atomic.records);
  const naiveDiff = diff(
    naive.players.map(p => ({ openId: p.openId, score: p.score })),
    naiveExpected
  );
  const atomicDiff = diff(
    atomic.players.map(p => ({ openId: p.openId, score: p.score })),
    atomicExpected
  );
  console.log('Naive最终分数:', naive.players.map(p => `${p.openId}:${p.score}`).join(' '));
  console.log('Naive按记录汇总:', naiveExpected.map(p => `${p.openId}:${p.score}`).join(' '));
  console.log('Naive差异条数:', naiveDiff.length, JSON.stringify(naiveDiff));
  console.log('Atomic最终分数:', atomic.players.map(p => `${p.openId}:${p.score}`).join(' '));
  console.log('Atomic按记录汇总:', atomicExpected.map(p => `${p.openId}:${p.score}`).join(' '));
  console.log('Atomic差异条数:', atomicDiff.length, JSON.stringify(atomicDiff));
  console.log('开始混合场景一致性模拟');
  let naiveMixedDelta = 0;
  let safeMixedDelta = 0;
  const mixedRuns = 10;
  for (let i = 0; i < mixedRuns; i += 1) {
    const naiveMixed = await mixedScenario('naive');
    const safeMixed = await mixedScenario('safe');
    if (naiveMixed.delta.length > 0) {
      naiveMixedDelta += 1;
    }
    if (safeMixed.delta.length > 0) {
      safeMixedDelta += 1;
    }
  }
  console.log('Naive混合场景出现差异次数:', naiveMixedDelta, '总轮次:', mixedRuns);
  console.log('Safe混合场景出现差异次数:', safeMixedDelta, '总轮次:', mixedRuns);
  console.log('开始请求重试体验模拟');
  let successNoRetry = 0;
  let successWithRetry = 0;
  const total = 200;
  function mockCall() {
    return Math.random() < 0.75;
  }
  for (let i = 0; i < total; i += 1) {
    if (mockCall()) {
      successNoRetry += 1;
    }
  }
  const retryAttempts = 5;
  for (let i = 0; i < total; i += 1) {
    let ok = false;
    for (let j = 0; j < retryAttempts; j += 1) {
      if (mockCall()) {
        ok = true;
        break;
      }
    }
    if (ok) {
      successWithRetry += 1;
    }
  }
  console.log('不重试成功数:', successNoRetry, '总数:', total);
  console.log(`重试${retryAttempts}次成功数:`, successWithRetry, '总数:', total);
  console.log('模拟结束');
}
if (require.main === module) {
  run();
}
