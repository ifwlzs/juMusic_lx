declare namespace LX {
  namespace MediaLibrary {
    type ProviderType = 'local' | 'webdav' | 'smb'
    type ConnectionScanStatus = 'idle' | 'running' | 'success' | 'failed'

    interface ConnectionCredential {
      host?: string
      share?: string
      username?: string
      password?: string
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
