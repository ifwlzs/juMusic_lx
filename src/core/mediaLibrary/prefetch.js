function createPrefetchScheduler({ ensureCached }) {
  let currentToken = 0

  return {
    async onTrackStarted(currentMusicInfo, nextMusicInfo) {
      currentToken += 1
      const token = currentToken
      if (!currentMusicInfo || !nextMusicInfo) return
      await Promise.resolve()
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
