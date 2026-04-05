import searchMusicState, { type Source } from '@/store/search/music/state'
import searchMusicActions, { type SearchResult } from '@/store/search/music/action'
import musicSdk from '@/utils/musicSdk'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { toMediaLibraryMusicInfo } from '@/core/mediaLibrary/sourceLists'
import { isLibrarySource, searchLibrarySongs } from '@/core/mediaLibrary/searchRegistry'

export const setSource: typeof searchMusicActions['setSource'] = (source) => {
  searchMusicActions.setSource(source)
}
export const setSearchText: typeof searchMusicActions['setSearchText'] = (text) => {
  searchMusicActions.setSearchText(text)
}
export const setListInfo: typeof searchMusicActions.setListInfo = (result, id, page) => {
  return searchMusicActions.setListInfo(result, id, page)
}

export const clearListInfo: typeof searchMusicActions.clearListInfo = (source) => {
  searchMusicActions.clearListInfo(source)
}

const createEmptyResult = (source: Source): SearchResult => ({
  allPage: 0,
  limit: searchMusicState.listInfos.all.limit,
  list: [],
  source,
  total: 0,
})

const loadLibrarySearchResult = async(text: string, sourceId: Source): Promise<SearchResult> => {
  const connections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
  const connectionIds = connections
    .filter(item => sourceId == 'all' || item.providerType == sourceId)
    .map(item => item.connectionId)
  const sourceItems = (await mediaLibraryRepository.getAllSourceItems(connectionIds) as LX.MediaLibrary.SourceItem[])
    .map(item => toMediaLibraryMusicInfo(item))
  const aggregateSongs = (await mediaLibraryRepository.getAggregateSongs() as LX.MediaLibrary.AggregateSong[])
    .map(item => toMediaLibraryMusicInfo(item))

  return searchLibrarySongs({
    keyword: text,
    source: sourceId,
    aggregateSongs,
    sourceItems,
  })
}

export const search = async(text: string, page: number, sourceId: Source): Promise<LX.Music.MusicInfo[]> => {
  const listInfo = searchMusicState.listInfos[sourceId]!
  if (!text) return []
  const key = `${page}__${text}`
  if (sourceId == 'all') {
    listInfo.key = key
    let task = [] as Array<Promise<SearchResult>>
    for (const source of searchMusicState.sources) {
      if (source == 'all') continue
      if (isLibrarySource(source)) {
        task.push(loadLibrarySearchResult(text, source).catch(() => createEmptyResult(source)))
        continue
      }
      task.push(((musicSdk[source]?.musicSearch.search(text, page, searchMusicState.listInfos.all.limit) as Promise<SearchResult>) ?? Promise.reject(new Error('source not found: ' + source))).catch((error: any) => {
        console.log(error)
        return createEmptyResult(source)
      }))
    }
    return Promise.all(task).then((results: SearchResult[]) => {
      if (key != listInfo.key) return []
      setSearchText(text)
      setSource(sourceId)
      return setListInfo(results, page, text)
    })
  } else if (isLibrarySource(sourceId)) {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo.list
    listInfo.key = key
    return loadLibrarySearchResult(text, sourceId).then((result) => {
      if (key != listInfo.key) return []
      return setListInfo(result, page, text)
    }).catch((err: any) => {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  } else {
    if (listInfo?.key == key && listInfo?.list.length) return listInfo?.list
    listInfo.key = key
    return (musicSdk[sourceId]?.musicSearch.search(text, page, listInfo.limit).then((data: SearchResult) => {
      if (key != listInfo.key) return []
      return setListInfo(data, page, text)
    }) ?? Promise.reject(new Error('source not found: ' + sourceId))).catch((err: any) => {
      if (listInfo.list.length && page == 1) clearListInfo(sourceId)
      throw err
    })
  }
}

