function isFreshImportRuleSyncJob(job, currentTime, staleHeartbeatMs) {
  if (job?.type !== 'import_rule_sync') return false
  if (job?.status !== 'running') return false
  if (!job?.heartbeatAt) return false
  return currentTime - job.heartbeatAt <= staleHeartbeatMs
}

function isMatchingSyncWork(run, job) {
  if (!run?.connectionId || !job?.connectionId) return false
  if (run.connectionId !== job.connectionId) return false
  if (run.ruleId != null) return run.ruleId === job.ruleId
  return true
}

function shouldDeferPrefetchForRemoteSync({
  syncRuns = [],
  importJobs = [],
  now = () => Date.now(),
  staleHeartbeatMs = 15_000,
} = {}) {
  const currentTime = now()
  return syncRuns.some(run => {
    if (run?.status !== 'running') return false
    if (run?.phase !== 'enumerate' && run?.phase !== 'hydrate') return false
    return importJobs.some(job => {
      return isFreshImportRuleSyncJob(job, currentTime, staleHeartbeatMs) &&
        isMatchingSyncWork(run, job)
    })
  })
}

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
  shouldDeferPrefetchForRemoteSync,
}
