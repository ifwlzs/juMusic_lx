export interface PendingSeekDecision {
  type: 'idle' | 'wait' | 'commit' | 'fallback'
  targetTime: number | null
}

export function shouldWaitForRemoteSeek(params?: {
  musicInfo?: LX.Music.MusicInfo | null
  targetTime?: number
  bufferedPosition?: number
  duration?: number
  toleranceSec?: number
}): boolean

export function resolvePendingSeekState(params?: {
  pendingSeekTime?: number | null
  bufferedPosition?: number
  waitStartedAt?: number | null
  now?: number
  maxWaitMs?: number
  toleranceSec?: number
}): PendingSeekDecision
