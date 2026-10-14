const DEFAULT_MIN_INTERVAL_MS = 15_000
const DEFAULT_MIN_ITEM_DELTA = 200

function createCheckpointGate({
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  minItemDelta = DEFAULT_MIN_ITEM_DELTA,
  now = () => Date.now(),
} = {}) {
  let lastAt = 0
  let lastCount = 0

  return {
    shouldSave(processedCount, { force = false } = {}) {
      if (force) return true
      const count = Number(processedCount) || 0
      if (count <= 0) return false
      if (lastAt === 0) return true
      if (count - lastCount >= minItemDelta) return true
      if (count > lastCount && now() - lastAt >= minIntervalMs) return true
      return false
    },
    markSaved(processedCount) {
      lastAt = now()
      lastCount = Number(processedCount) || 0
    },
  }
}

module.exports = {
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_MIN_ITEM_DELTA,
  createCheckpointGate,
}
