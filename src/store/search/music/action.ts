import state, { type InitState, type Source } from './state'
import { arrPush } from '@/utils/common'
import { deduplicationList, toNewMusicInfo } from '@/utils'
import { rankMusicSearchResults } from '@/utils/musicSearchRanking'


export interface SearchResult {
  list: LX.Music.MusicInfo[]
  allPage: number
  limit: number
  total: number
  source: Source
}


// 同一命中层级内继续保留个人曲库来源顺序，严格标题命中层级则始终拥有更高优先级。
const getSourcePriority = (source: LX.Music.MusicInfo['source']) => {
  switch (source) {
    case 'local': return 0
    case 'webdav': return 1
    case 'smb': return 2
    case 'onedrive': return 3
    default: return 99
  }
}

const normalizeSearchItem = (item: LX.Music.MusicInfo) => {
  if (item.source == 'local' || item.source == 'webdav' || item.source == 'smb' || item.source == 'onedrive') return item
  return toNewMusicInfo(item)
}

// 严格命中层级先于来源优先级，避免本地模糊结果压过其他来源的精确标题。
const handleSortList = (list: LX.Music.MusicInfo[], keyword: string) => {
  return rankMusicSearchResults(list, keyword, {
    getSourcePriority: item => getSourcePriority(item.source),
  })
}

const setLists = (results: SearchResult[], page: number, text: string): LX.Music.MusicInfo[] => {
  let pages = []
  let totals = []
  let limit = 0
  let list = [] as LX.Music.MusicInfo[]
  for (const source of results) {
    state.maxPages[source.source] = source.allPage
    limit = Math.max(source.limit, limit)
    if (source.allPage < page) continue
    arrPush(list, source.list)
    pages.push(source.allPage)
    totals.push(source.total)
  }
  let listInfo = state.listInfos.all
  listInfo.maxPage = Math.max(0, ...pages)
  const total = Math.max(0, ...totals)
  if (page == 1 || (total && list.length)) listInfo.total = total
  else listInfo.total = limit * page
  // listInfo.limit = limit
  listInfo.page = page
  const normalizedList = list.map(normalizeSearchItem)
  // 后续页必须与已加载结果一起重新分层，确保新到达的严格命中能够移动到模糊结果之前。
  const mergedList = deduplicationList(page > 1 ? [...listInfo.list, ...normalizedList] : normalizedList)
  listInfo.list = handleSortList(mergedList, text)
  state.source = 'all'

  return listInfo.list
}

const setList = (datas: SearchResult, page: number, text: string): LX.Music.MusicInfo[] => {
  // console.log(datas.source, datas.list)
  let listInfo = state.listInfos[datas.source]!
  const list = datas.list.map(normalizeSearchItem)
  // 单来源同样对累计分页整体重排，不依赖远端接口返回的原始相关性顺序。
  const mergedList = deduplicationList(page == 1 ? list : [...listInfo.list, ...list])
  listInfo.list = handleSortList(mergedList, text)
  if (page == 1 || (datas.total && datas.list.length)) listInfo.total = datas.total
  else listInfo.total = datas.limit * page
  listInfo.maxPage = datas.allPage
  listInfo.page = page
  listInfo.limit = datas.limit
  state.source = datas.source

  return listInfo.list
}

export default {
  setSource(source: InitState['source']) {
    state.source = source
  },
  setSearchText(searchText: InitState['searchText']) {
    state.searchText = searchText
  },
  setListInfo(result: SearchResult | SearchResult[], page: number, text: string) {
    if (Array.isArray(result)) {
      return setLists(result, page, text)
    } else {
      return setList(result, page, text)
    }
  },
  clearListInfo(sourceId: Source) {
    let listInfo = state.listInfos[sourceId]!
    listInfo.list = []
    listInfo.page = 0
    listInfo.maxPage = 0
    listInfo.total = 0
  },
}
