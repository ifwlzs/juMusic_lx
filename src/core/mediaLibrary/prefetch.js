function createPrefetchScheduler({
  ensureCached,
  shouldDeferPrefetch = async() => false,
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  retryDelayMs = 1500,
}) {
  let currentToken = 0

  return {
    async onTrackStarted(currentMusicInfo, nextMusicInfo) {
      currentToken += 1
      const token = currentToken
      if (!currentMusicInfo || !nextMusicInfo) return
      await Promise.resolve()
      while (token === currentToken && await shouldDeferPrefetch()) {
        await wait(retryDelayMs)
      }
      if (token !== currentToken) return
      await ensureCached(nextMusicInfo, 'prefetch')
    },
    cancel() {
      currentToken += 1
    },
  }
}

module.exports = {
  createPrefetchScheduler,
}
