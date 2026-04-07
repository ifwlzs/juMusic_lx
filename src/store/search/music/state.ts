import music from '@/utils/musicSdk'
import { getSearchSources } from '@/core/mediaLibrary/searchRegistry'

export declare interface ListInfo {
  list: LX.Music.MusicInfo[]
  total: number
  page: number
  maxPage: number
  limit: number
  key: string | null
}

interface ListInfos extends Partial<Record<LX.Source, ListInfo>> {
  'all': ListInfo
}

export type Source = LX.Source | 'all'

export interface InitState {
  searchText: string
  source: Source
  sources: Source[]
  listInfos: ListInfos
  maxPages: Partial<Record<Source, number>>
}

const state: InitState = {
  searchText: '',
  source: 'kw',
  sources: [],
  listInfos: {
    all: {
      page: 1,
      maxPage: 0,
      limit: 30,
      total: 0,
      list: [],
      key: null,
    },
  },
  maxPages: {},
}

const onlineSources: LX.OnlineSource[] = []
for (const source of music.sources) {
  if (!music[source.id as LX.OnlineSource]?.musicSearch) continue
  onlineSources.push(source.id as LX.OnlineSource)
  state.listInfos[source.id as LX.OnlineSource] = {
    page: 1,
    maxPage: 0,
    limit: 30,
    total: 0,
    list: [],
    key: '',
  }
  state.maxPages[source.id as LX.OnlineSource] = 0
}
state.sources = getSearchSources(onlineSources) as Source[]
state.listInfos.local = { page: 1, maxPage: 0, limit: 30, total: 0, list: [], key: '' }
state.listInfos.webdav = { page: 1, maxPage: 0, limit: 30, total: 0, list: [], key: '' }
state.listInfos.smb = { page: 1, maxPage: 0, limit: 30, total: 0, list: [], key: '' }
state.listInfos.onedrive = { page: 1, maxPage: 0, limit: 30, total: 0, list: [], key: '' }
state.maxPages.local = 0
state.maxPages.webdav = 0
state.maxPages.smb = 0
state.maxPages.onedrive = 0

export default state
