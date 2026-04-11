const REMOTE_MEDIA_LIBRARY_SOURCES = new Set(['webdav', 'smb', 'onedrive'])

function isRemoteMediaLibraryMusicInfo(musicInfo) {
  return REMOTE_MEDIA_LIBRARY_SOURCES.has(musicInfo?.source) && Boolean(musicInfo?.meta?.mediaLibrary)
}

function getPlayerRetryStatusTextKey(musicInfo) {
  return isRemoteMediaLibraryMusicInfo(musicInfo)
    ? 'player__retry_media_file'
    : 'player__refresh_url'
}

module.exports = {
  getPlayerRetryStatusTextKey,
  isRemoteMediaLibraryMusicInfo,
}
