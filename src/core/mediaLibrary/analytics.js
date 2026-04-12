const { createPlaySession, updatePlaySession } = require('./playStats.js')

function createAnalyticsRecorder({ save, saveHistory }) {
  let session = null
  let stats = null
  let sessionStartedAt = 0

  const persistCurrentSession = () => {
    if (!session || !stats || stats.playDurationTotalSec <= 0) return null
    const endedAt = Date.now()
    const persistTasks = [
      save({ ...stats, lastPlayedAt: endedAt }),
    ]
    if (typeof saveHistory === 'function') {
      persistTasks.push(saveHistory({
        aggregateSongId: stats.aggregateSongId,
        sourceItemId: stats.lastSourceItemId,
        startedAt: sessionStartedAt,
        endedAt,
        listenedSec: stats.playDurationTotalSec,
        durationSec: session.durationSec,
        countedPlay: Boolean(stats.playCount),
      }))
    }
    return Promise.all(persistTasks)
  }

  return {
    startSession({ aggregateSongId, sourceItemId, durationSec }) {
      if (!aggregateSongId || !sourceItemId || !durationSec) return

      const isSameSession = Boolean(session) &&
        stats?.aggregateSongId === aggregateSongId &&
        stats?.lastSourceItemId === sourceItemId
      if (isSameSession) return

      if (stats && stats.playDurationTotalSec > 0) void persistCurrentSession()

      session = createPlaySession({ durationSec })
      sessionStartedAt = Date.now()
      stats = {
        aggregateSongId,
        lastSourceItemId: sourceItemId,
        playCount: 0,
        playDurationTotalSec: 0,
        lastPlayedAt: Date.now(),
      }
    },
    updateProgress(currentSec, isPlaying, isSeek = false) {
      if (!session || !stats) return
      updatePlaySession(session, { currentSec, isPlaying, isSeek })
      stats.playDurationTotalSec = session.listenedSec
      stats.playCount = session.incrementCount
      stats.lastPlayedAt = Date.now()
    },
    finishSession() {
      if (!stats) {
        session = null
        sessionStartedAt = 0
        return
      }

      const result = persistCurrentSession()
      session = null
      stats = null
      sessionStartedAt = 0
      return result
    },
  }
}

module.exports = {
  createAnalyticsRecorder,
}
