import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { InitState as SearchState } from '@/store/search/state'
import type { Source as MusicSource } from '@/store/search/music/state'
import type { Source as SongListSource } from '@/store/search/songlist/state'
import MusicList, { type MusicListType } from './MusicList'
import LibraryMusicList, { type LibraryMusicListType } from './LibraryMusicList'
import BlankView, { type BlankViewType } from './BlankView'
import SonglistList, { type MusicListType as SonglistListType } from './SonglistList'

interface ListProps {
  onSearch: (keyword: string) => void
}
export interface ListType {
  loadList: (text: string, source: MusicSource | SongListSource, type: SearchState['searchType']) => void
}

export default forwardRef<ListType, ListProps>(({ onSearch }, ref) => {
  const [listType, setListType] = useState<SearchState['searchType']>('music')
  const [showBlankView, setShowListView] = useState(true)
  const [activeSource, setActiveSource] = useState<MusicSource | SongListSource>('kw')
  const listRef = useRef<MusicListType | LibraryMusicListType | SonglistListType>(null)
  const blankViewRef = useRef<BlankViewType>(null)

  useImperativeHandle(ref, () => ({
    loadList(text, source, type) {
      setActiveSource(source)
      if (text) {
        setShowListView(false)
        setListType(type)
        // const listDetailInfo = searchMusicState.listDetailInfo
        requestAnimationFrame(() => {
          listRef.current?.loadList(text, source)
        })
      } else {
        setShowListView(true)
        requestAnimationFrame(() => {
          blankViewRef.current?.show(source)
        })
      }
    },
  }), [])

  const isLibraryMusicSource = listType == 'music' && ['local', 'webdav', 'smb', 'all'].includes(activeSource as string)

  if (showBlankView) return <BlankView ref={blankViewRef} onSearch={onSearch} />
  if (isLibraryMusicSource) return <LibraryMusicList ref={listRef} />
  if (listType == 'songlist') return <SonglistList ref={listRef} />
  return <MusicList ref={listRef} />
})
