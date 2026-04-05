function normalizeLocale(localeId = 'en-US') {
  return String(localeId || 'en-US').replaceAll('_', '-')
}

function getIntervalSeconds(interval) {
  if (!interval) return 0
  const intvArr = String(interval).split(':')
  let intv = 0
  let unit = 1
  while (intvArr.length) {
    intv += parseInt(intvArr.pop(), 10) * unit
    unit *= 60
  }
  return intv
}

function getMediaLibraryInfo(musicInfo) {
  return musicInfo?.meta?.mediaLibrary ?? null
}

function getPathFileName(filePath = '') {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts.at(-1) || ''
}

function getDefaultSortType(fieldName) {
  return fieldName === 'update_time' ? 'down' : 'up'
}

function isGeneratedMediaSourceList(listInfo) {
  return Boolean(listInfo?.mediaSource?.generated && listInfo?.mediaSource?.readOnly)
}

function getTextValue(musicInfo, fieldName) {
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  switch (fieldName) {
    case 'name':
      return musicInfo?.name || ''
    case 'singer':
      return musicInfo?.singer || ''
    case 'album':
      return musicInfo?.meta?.albumName || ''
    case 'source':
      return musicInfo?.source || ''
    case 'file_name':
      return mediaLibrary?.fileName || getPathFileName(musicInfo?.meta?.filePath) || ''
    default:
      return ''
  }
}

function getNumberValue(musicInfo, fieldName) {
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  switch (fieldName) {
    case 'time':
      return getIntervalSeconds(musicInfo?.interval)
    case 'update_time':
      return mediaLibrary?.modifiedTime ?? 0
    default:
      return 0
  }
}

function compareText(left, right, localeId) {
  if (!left) return right ? -1 : 0
  if (!right) return 1
  return String(left).localeCompare(String(right), localeId)
}

function compareNumber(left, right) {
  return (left ?? 0) - (right ?? 0)
}

function shuffleList(list) {
  for (let index = list.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = list[index]
    list[index] = list[randomIndex]
    list[randomIndex] = current
  }
  return list
}

function sortListMusicInfo(list, sortType, fieldName, localeId = 'en-US') {
  const normalizedLocale = normalizeLocale(localeId)
  switch (sortType) {
    case 'random':
      return shuffleList(list)
    case 'up':
      if (fieldName === 'time' || fieldName === 'update_time') {
        return list.sort((left, right) => compareNumber(getNumberValue(left, fieldName), getNumberValue(right, fieldName)))
      }
      return list.sort((left, right) => compareText(getTextValue(left, fieldName), getTextValue(right, fieldName), normalizedLocale))
    case 'down':
      if (fieldName === 'time' || fieldName === 'update_time') {
        return list.sort((left, right) => compareNumber(getNumberValue(right, fieldName), getNumberValue(left, fieldName)))
      }
      return list.sort((left, right) => compareText(getTextValue(right, fieldName), getTextValue(left, fieldName), normalizedLocale))
    default:
      return list
  }
}

function applyGeneratedListSortPreference(listInfo, list, preference, localeId = 'en-US') {
  if (!isGeneratedMediaSourceList(listInfo) || !preference?.type) return list
  if (preference.type === 'random') return list
  const field = preference.field || 'name'
  return sortListMusicInfo([...list], preference.type, field, localeId)
}

module.exports = {
  applyGeneratedListSortPreference,
  getDefaultSortType,
  isGeneratedMediaSourceList,
  sortListMusicInfo,
}
