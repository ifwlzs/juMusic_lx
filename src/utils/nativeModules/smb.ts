import { NativeModules } from 'react-native'

export interface SmbConnectionInfo {
  host: string
  share: string
  username?: string
  password?: string
  domain?: string
  port?: number
}

export interface SmbDirectoryEntry {
  path: string
  name: string
  isDirectory: boolean
  size: number
  modifiedTime: number
}

const { SmbModule } = NativeModules

export const listSmbDirectory = async(params: SmbConnectionInfo & { path: string }): Promise<SmbDirectoryEntry[]> => {
  return SmbModule.listDirectory(
    params.host,
    params.share,
    params.path,
    params.username ?? '',
    params.password ?? '',
    params.domain ?? '',
    params.port ?? 445,
  ).then((entries: SmbDirectoryEntry[]) => entries.map(entry => ({
    ...entry,
    size: Math.trunc(entry.size || 0),
    modifiedTime: Math.trunc(entry.modifiedTime || 0),
  })))
}

export const downloadSmbFile = async(params: SmbConnectionInfo & {
  remotePath: string
  localPath: string
}): Promise<string> => {
  return SmbModule.downloadFile(
    params.host,
    params.share,
    params.remotePath,
    params.username ?? '',
    params.password ?? '',
    params.domain ?? '',
    params.port ?? 445,
    params.localPath,
  )
}
