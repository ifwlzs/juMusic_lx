import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { seedMediaLibraryConnections } from '@/core/mediaLibrary/devSeed'
import { startMediaLibraryJobQueue } from '@/core/mediaLibrary/jobQueue'
import { bootLog } from '@/utils/bootLog'
import { existsFile, externalStorageDirectoryPath, readFile } from '@/utils/fs'
import { log } from '@/utils/log'

const DEV_SEED_FILE_PATH = `${externalStorageDirectoryPath}/Android/media/cn.toside.music.mobile/media-library-dev-seed.json`

const loadDevSeedConnections = async() => {
  if (!__DEV__) return []
  if (!externalStorageDirectoryPath) return []

  const isExists = await existsFile(DEV_SEED_FILE_PATH)
  if (!isExists) return []

  try {
    const content = await readFile(DEV_SEED_FILE_PATH)
    const config = JSON.parse(content) as {
      connections?: LX.MediaLibrary.DevSeedConnection[]
    }
    return config.connections ?? []
  } catch (error) {
    log.error('media library dev seed load failed:', error)
    return []
  }
}

export default async() => {
  startMediaLibraryJobQueue()
  const connections = await loadDevSeedConnections()
  if (!connections.length) return

  await seedMediaLibraryConnections(mediaLibraryRepository, connections)
  bootLog('Media Library dev seed applied.')
}

export {
  DEV_SEED_FILE_PATH,
}
