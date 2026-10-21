function hashPayload(text) {
  let first = 2166136261
  let second = 5381
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619)
    second = Math.imul(second, 33) ^ text.charCodeAt(index)
  }
  return `${first >>> 0}_${second >>> 0}`
}

function createOperationStore(storage) {
  const keyFor = (type, payload) => `counter_pending_${type}_${hashPayload(JSON.stringify(payload))}`
  return {
    get(type, payload) {
      const key = keyFor(type, payload)
      const existing = storage.get(key)
      if (existing && existing.payload === JSON.stringify(payload)) return existing.operationId
      const operationId = `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
      storage.set(key, { payload: JSON.stringify(payload), operationId })
      return operationId
    },
    complete(type, payload) { storage.remove(keyFor(type, payload)) }
  }
}

const operationStore = createOperationStore({
  get: key => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: key => wx.removeStorageSync(key)
})

async function call(action, data = {}) {
  const response = await wx.cloud.callFunction({ name: 'counterService', data: { action, ...data } })
  const result = response.result
  if (!result || result.success !== true) throw new Error(result?.error || '操作失败')
  return result
}

async function callWithRetry(action, data, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await call(action, data) }
    catch (error) {
      // Business errors are returned by the service and must not be retried.
      if (!/网络|timeout|超时|request:fail|connection/i.test(error.message) || attempt === attempts - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
    }
  }
}

module.exports = { call, callWithRetry, operationStore, createOperationStore }
