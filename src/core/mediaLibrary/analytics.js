const { createPlaySession, updatePlaySession } = require('./playStats.js')

function createAnalyticsRecorder({ save }) {
  let session = null
  let stats = null

  return {
    startSession({ aggregateSongId, sourceItemId, durationSec }) {
      if (!aggregateSongId || !sourceItemId || !durationSec) return

      const isSameSession = Boolean(session) &&
        stats?.aggregateSongId === aggregateSongId &&
        stats?.lastSourceItemId === sourceItemId
      if (isSameSession) return

      if (stats && stats.playDurationTotalSec > 0) {
        save({ ...stats, lastPlayedAt: Date.now() })
      }

      session = createPlaySession({ durationSec })
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
        return
      }

      const result = stats.playDurationTotalSec > 0
        ? save({ ...stats, lastPlayedAt: Date.now() })
        : null
      session = null
      stats = null
      return result
    },
  }
}

module.exports = {
  createAnalyticsRecorder,
}
