function createPlaySession({ durationSec }) {
  return {
    durationSec,
    listenedSec: 0,
    incrementCount: 0,
    shouldIncrementPlayCount: false,
    lastProgressSec: 0,
  }
}

function updatePlaySession(session, { currentSec, isPlaying, isSeek = false }) {
  if (!isPlaying) return session
  const deltaSec = Math.max(0, currentSec - session.lastProgressSec)
  const seekThresholdSec = session.durationSec > 0 ? session.durationSec / 3 : Infinity

  if (isSeek || deltaSec > seekThresholdSec) {
    session.lastProgressSec = currentSec
    session.shouldIncrementPlayCount = false
    return session
  }

  session.listenedSec += deltaSec
  session.lastProgressSec = currentSec
  if (!session.incrementCount && session.listenedSec >= session.durationSec / 3) {
    session.incrementCount = 1
    session.shouldIncrementPlayCount = true
  } else {
    session.shouldIncrementPlayCount = false
  }
  return session
}

module.exports = {
  createPlaySession,
  updatePlaySession,
}
