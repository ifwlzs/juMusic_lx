function createPlaySession({ durationSec }) {
  return {
    durationSec,
    listenedSec: 0,
    incrementCount: 0,
    shouldIncrementPlayCount: false,
    lastProgressSec: 0,
  }
}

function updatePlaySession(session, { currentSec, isPlaying }) {
  if (!isPlaying) return session
  session.listenedSec += Math.max(0, currentSec - session.lastProgressSec)
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
