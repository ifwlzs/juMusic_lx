declare namespace LX {
  namespace MediaLibrary {
    type ProviderType = 'local' | 'webdav' | 'smb' | 'onedrive'
    type ConnectionScanStatus = 'idle' | 'running' | 'paused' | 'success' | 'failed'
    type ImportRuleMode = 'account_all_only' | 'per_directory' | 'merged'
    type BrowserNodeKind = 'directory' | 'track'
    type ImportJobType = 'import_rule_sync' | 'delete_rule_rebuild'
    type ImportJobStatus = 'queued' | 'running' | 'paused' | 'success' | 'failed' | 'cancelled'
    type ImportJobConflictMode = 'continue_previous' | 'current_first'
    type SyncTriggerSource = 'manual' | 'auto'
    type AutoSyncTrigger = 'boot' | 'media_sources_page'
    type SyncPhase = 'enumerate' | 'hydrate' | 'commit' | 'reconcile_delete'
    type SyncRunStatus = 'queued' | 'running' | 'paused' | 'success' | 'failed'
    type SyncCandidateState = 'discovered' | 'hydrating' | 'ready' | 'degraded' | 'committed' | 'dropped'
    type CacheOrigin = 'play' | 'prefetch'
    type PrefetchState = 'queued' | 'running' | 'ready' | 'failed'

    interface ConnectionCredential {
      host?: string
      share?: string
      username?: string
      password?: string
      accountId?: string
      authority?: string
    }

    interface SourceConnection {
      connectionId: string
      providerType: ProviderType
      displayName: string
      rootPathOrUri: string
      credentialRef?: string | null
      lastScanAt?: number | null
      lastScanStatus?: ConnectionScanStatus
      lastScanSummary?: string
      listProjectionEnabled?: boolean
    }

    interface ImportSelectionBase {
      selectionId: string
      pathOrUri: string
      displayName: string
    }

    interface ImportDirectorySelection extends ImportSelectionBase {
      kind: 'directory'
    }

    interface ImportTrackSelection extends ImportSelectionBase {
      kind: 'track'
    }

    type ImportSelection = ImportDirectorySelection | ImportTrackSelection

    interface ImportRule {
      ruleId: string
      connectionId: string
      name: string
      mode: ImportRuleMode
      directories: ImportDirectorySelection[]
      tracks: ImportTrackSelection[]
      generatedListIds?: string[]
      lastSyncAt?: number | null
      lastSyncStatus?: ConnectionScanStatus
      lastSyncSummary?: string
    }

    interface ImportSnapshot {
      ruleId: string
      scannedAt: number | null
      items: SourceItem[]
    }

    interface ImportJob {
      jobId: string
      type: ImportJobType
      connectionId: string
      ruleId?: string | null
      status: ImportJobStatus
      attempt: number
      createdAt: number | null
      startedAt?: number | null
      finishedAt?: number | null
      summary?: string
      error?: string
      runtimeOwnerId?: string | null
      heartbeatAt?: number | null
      pauseRequestedAt?: number | null
      resumeAfterJobId?: string | null
      payload?: {
        previousRule?: ImportRule | null
        triggerSource?: SyncTriggerSource
        autoSyncTrigger?: AutoSyncTrigger
      } | null
    }

    interface SyncRun {
      runId: string
      providerType: ProviderType
      connectionId: string
      ruleId?: string | null
      triggerSource: SyncTriggerSource
      phase: SyncPhase
      status: SyncRunStatus
      startedAt?: number | null
      finishedAt?: number | null
      discoveredCount: number
      readyCount: number
      degradedCount: number
      committedCount: number
      failedCount: number
    }

    interface SyncCandidateMetadata {
      title?: string
      artist?: string
      album?: string
      durationSec?: number
      mimeType?: string
    }

    interface SyncCandidate {
      sourceStableKey: string
      pathOrUri: string
      fileName?: string
      versionToken?: string
      fileSize?: number
      modifiedTime?: number | null
      hydrateState: SyncCandidateState
      metadataLevelReached?: number
      attempts?: number
      lastError?: string
      metadata?: SyncCandidateMetadata | null
    }

    interface SyncSnapshotItem {
      sourceStableKey: string
      versionToken: string
      pathOrUri: string
    }

    interface SyncSnapshot {
      ruleId: string
      capturedAt: number | null
      items: SyncSnapshotItem[]
    }

    interface BrowserNode {
      nodeId: string
      kind: BrowserNodeKind
      name: string
      pathOrUri: string
      parentPathOrUri?: string
      hasChildren?: boolean
    }

    interface SourceItem {
      sourceItemId: string
      connectionId: string
      providerType: ProviderType
      sourceUniqueKey: string
      pathOrUri: string
      fileName?: string
      title?: string
      artist?: string
      album?: string
      durationSec?: number
      mimeType?: string
      fileSize?: number
      modifiedTime?: number | null
      versionToken: string
      lastSeenAt?: number | null
      scanStatus?: string
      aggregateSongId?: string | null
    }

    interface AggregateSong {
      aggregateSongId: string
      canonicalTitle: string
      canonicalArtist: string
      canonicalAlbum: string
      canonicalDurationSec: number
      preferredSourceItemId: string
      sourceCount: number
      createdAt?: number | null
      updatedAt?: number | null
      preferredSource?: ProviderType
      sourceItemIds?: string[]
    }

    interface MediaCache {
      cacheId: string
      sourceItemId: string
      versionToken: string
      localFilePath: string
      cachedFileSize?: number
      cacheStatus?: string
      cacheOrigin?: CacheOrigin
      prefetchState?: PrefetchState
      createdAt?: number | null
      lastAccessAt?: number | null
    }

    interface PlayStat {
      aggregateSongId: string
      lastSourceItemId: string
      playCount: number
      playDurationTotalSec: number
      lastPlayedAt: number
    }

    interface DevSeedConnection {
      connection: SourceConnection
      credential?: ConnectionCredential | null
    }
  }
}
