const { createPlaySession, updatePlaySession } = require('./playStats.js')
const { computePlaybackTimeFacts, clampCompletionRate } = require('./playbackAnalyticsFacts.js')

function createAnalyticsRecorder({ save, saveHistory, resolveSessionContext, onHistoryPersisted } = {}) {
  let session = null
  let stats = null
  let sessionStartedAt = 0
  let sessionContext = null
  let sessionSeekRuntime = {
    seekCount: 0,
    seekForwardSec: 0,
    seekBackwardSec: 0,
  }

  const resetSessionSeekRuntime = () => {
    sessionSeekRuntime = {
      seekCount: 0,
      seekForwardSec: 0,
      seekBackwardSec: 0,
    }
  }

  const resolveContext = () => {
    const fromResolver = typeof resolveSessionContext === 'function'
      ? (resolveSessionContext() || {})
      : {}
    return {
      ...fromResolver,
      ...(sessionContext || {}),
    }
  }

  const persistCurrentSession = () => {
    if (!session || !stats || stats.playDurationTotalSec <= 0) return null
    const endedAt = Date.now()
    const context = resolveContext()
    const timeFacts = computePlaybackTimeFacts(sessionStartedAt)
    const historyEntry = {
      aggregateSongId: stats.aggregateSongId,
      sourceItemId: stats.lastSourceItemId,
      startedAt: sessionStartedAt,
      endedAt,
      listenedSec: stats.playDurationTotalSec,
      durationSec: session.durationSec,
      countedPlay: Boolean(stats.playCount),
      completionRate: clampCompletionRate(stats.playDurationTotalSec, session.durationSec),
      endReason: context.endReason || 'unknown',
      entrySource: context.entrySource || 'unknown',
      seekCount: Number(sessionSeekRuntime.seekCount) || 0,
      seekForwardSec: Number(sessionSeekRuntime.seekForwardSec) || 0,
      seekBackwardSec: Number(sessionSeekRuntime.seekBackwardSec) || 0,
      ...timeFacts,
      titleSnapshot: context.titleSnapshot || '',
      artistSnapshot: context.artistSnapshot || '',
      albumSnapshot: context.albumSnapshot || '',
      providerTypeSnapshot: context.providerTypeSnapshot || '',
      fileNameSnapshot: context.fileNameSnapshot || '',
      remotePathSnapshot: context.remotePathSnapshot || '',
      listIdSnapshot: context.listIdSnapshot ?? null,
      listTypeSnapshot: context.listTypeSnapshot || 'unknown',
    }

    const persistTasks = [
      save({ ...stats, lastPlayedAt: endedAt }),
    ]

    if (typeof saveHistory === 'function') {
      persistTasks.push(Promise.resolve(saveHistory(historyEntry)).then(() => {
        if (typeof onHistoryPersisted === 'function') return onHistoryPersisted(historyEntry)
        return null
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
      sessionContext = null
      resetSessionSeekRuntime()
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
    recordSeek(fromSec, toSec) {
      if (!session || !stats) return
      const from = Number(fromSec) || 0
      const to = Number(toSec) || 0
      if (from === to) return
      sessionSeekRuntime.seekCount += 1
      if (to > from) sessionSeekRuntime.seekForwardSec += to - from
      else sessionSeekRuntime.seekBackwardSec += from - to
    },
    updateSessionContext(nextContext = {}) {
      sessionContext = { ...(sessionContext || {}), ...nextContext }
    },
    finishSession(extraContext = {}) {
      this.updateSessionContext(extraContext)
      if (!stats) {
        session = null
        sessionStartedAt = 0
        sessionContext = null
        resetSessionSeekRuntime()
        return
      }

      const result = persistCurrentSession()
      session = null
      stats = null
      sessionStartedAt = 0
      sessionContext = null
      resetSessionSeekRuntime()
      return result
    },
  }
}

module.exports = {
  createAnalyticsRecorder,
}
