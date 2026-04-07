function createReadyBatchCommitter({
  maxBatchSize = 10,
  maxDelayMs = 2000,
  schedule = (delay, run) => setTimeout(run, delay),
  cancel = handle => clearTimeout(handle),
  onFlush = async() => {},
} = {}) {
  let items = []
  let timer = null

  async function flush() {
    if (!items.length) return

    const batch = items
    items = []

    if (timer) {
      cancel(timer)
      timer = null
    }

    await onFlush(batch)
  }

  async function push(item) {
    items.push(item)

    if (items.length >= maxBatchSize) {
      await flush()
      return
    }

    if (!timer) {
      timer = schedule(maxDelayMs, () => {
        timer = null
        void flush()
      })
    }
  }

  return {
    push,
    flush,
  }
}

module.exports = {
  createReadyBatchCommitter,
}
