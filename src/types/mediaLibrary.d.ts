declare namespace LX {
  namespace MediaLibrary {
    type ProviderType = 'local' | 'webdav' | 'smb'
    interface SourceConnection {
      connectionId: string
      providerType: ProviderType
      displayName: string
      rootPathOrUri: string
      credentialRef?: string | null
      credentials?: {
        host?: string
        share?: string
        username?: string
        password?: string
      } | null
      lastScanAt?: number | null
      lastScanStatus?: 'idle' | 'running' | 'success' | 'failed'
      lastScanSummary?: string
      listProjectionEnabled?: boolean
    }
  }
}
