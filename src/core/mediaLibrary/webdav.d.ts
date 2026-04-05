export function buildWebdavUrl(rootPathOrUri: string, pathOrUri?: string): string

export function buildWebdavHeaders(
  credential?: LX.MediaLibrary.ConnectionCredential | null,
): Record<string, string>
