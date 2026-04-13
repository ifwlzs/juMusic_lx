function createDefaultEntryContext() {
  return {
    entrySource: 'unknown',
    listIdSnapshot: null,
    listTypeSnapshot: 'unknown',
  }
}

function createPlaybackAnalyticsRuntime() {
  let pendingEntryContext = null
  let pendingEndReason = null
  let currentSessionRuntime = {
    seekCount: 0,
    seekForwardSec: 0,
    seekBackwardSec: 0,
  }

  return {
    setPendingEntryContext(context = {}) {
      pendingEntryContext = {
        entrySource: context.entrySource || 'unknown',
        listIdSnapshot: context.listIdSnapshot ?? null,
        listTypeSnapshot: context.listTypeSnapshot || 'unknown',
      }
    },
    consumePendingEntryContext() {
      const context = pendingEntryContext || createDefaultEntryContext()
      pendingEntryContext = null
      return context
    },
    setPendingEndReason(reason) {
      pendingEndReason = reason || 'unknown'
    },
    consumePendingEndReason() {
      const reason = pendingEndReason || 'unknown'
      pendingEndReason = null
      return reason
    },
    recordSeek(fromSec, toSec) {
      const from = Number(fromSec) || 0
      const to = Number(toSec) || 0
      if (from === to) return
      currentSessionRuntime.seekCount += 1
      if (to > from) currentSessionRuntime.seekForwardSec += to - from
      else currentSessionRuntime.seekBackwardSec += from - to
    },
    consumeSessionRuntime() {
      const result = currentSessionRuntime
      currentSessionRuntime = {
        seekCount: 0,
        seekForwardSec: 0,
        seekBackwardSec: 0,
      }
      return result
    },
  }
}

const playbackAnalyticsRuntime = createPlaybackAnalyticsRuntime()

module.exports = {
  createPlaybackAnalyticsRuntime,
  playbackAnalyticsRuntime,
}
