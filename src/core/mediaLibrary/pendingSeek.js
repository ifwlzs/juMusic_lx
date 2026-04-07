function isRemoteMediaLibraryMusic(musicInfo) {
  if (!musicInfo || typeof musicInfo !== 'object') return false
  if (!musicInfo.meta?.mediaLibrary) return false
  return musicInfo.source !== 'local'
}

function shouldWaitForRemoteSeek({
  musicInfo,
  targetTime = 0,
  bufferedPosition = 0,
  duration = 0,
  toleranceSec = 0.8,
} = {}) {
  if (!isRemoteMediaLibraryMusic(musicInfo)) return false
  if (!Number.isFinite(targetTime) || targetTime < 0) return false
  if (!Number.isFinite(bufferedPosition) || bufferedPosition < 0) return false
  if (duration > 0 && bufferedPosition >= duration - toleranceSec) return false
  return targetTime > bufferedPosition + toleranceSec
}

function resolvePendingSeekState({
  pendingSeekTime = null,
  bufferedPosition = 0,
  waitStartedAt = null,
  now = Date.now(),
  maxWaitMs = 12_000,
  toleranceSec = 0.8,
} = {}) {
  if (!Number.isFinite(pendingSeekTime) || pendingSeekTime == null) {
    return {
      type: 'idle',
      targetTime: null,
    }
  }

  if (Number.isFinite(bufferedPosition) && bufferedPosition + toleranceSec >= pendingSeekTime) {
    return {
      type: 'commit',
      targetTime: pendingSeekTime,
    }
  }

  if (Number.isFinite(waitStartedAt) && now - waitStartedAt >= maxWaitMs && Number.isFinite(bufferedPosition) && bufferedPosition > 0) {
    return {
      type: 'fallback',
      targetTime: bufferedPosition,
    }
  }

  return {
    type: 'wait',
    targetTime: pendingSeekTime,
  }
}

module.exports = {
  resolvePendingSeekState,
  shouldWaitForRemoteSeek,
}
