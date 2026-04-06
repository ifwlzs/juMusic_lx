const DEFAULT_CONCURRENCY = 3

function normalizeConcurrency(limit = DEFAULT_CONCURRENCY) {
  const value = Number(limit)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.floor(value)
}

async function mapWithConcurrency(items = [], limit = DEFAULT_CONCURRENCY, mapper) {
  if (!items.length) return []

  const results = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(items.length, normalizeConcurrency(limit))

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++
      if (currentIndex >= items.length) return
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

module.exports = {
  DEFAULT_CONCURRENCY,
  mapWithConcurrency,
}
