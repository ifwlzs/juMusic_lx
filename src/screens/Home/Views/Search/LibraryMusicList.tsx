import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { search } from '@/core/search/music'
import LibraryMusicListView from '@/components/LibraryMusicList'
import searchMusicState, { type Source } from '@/store/search/music/state'

export interface LibraryMusicListType {
  loadList: (text: string, source: Source) => void
}

export default forwardRef<LibraryMusicListType, {}>((_, ref) => {
  const searchInfoRef = useRef<{ text: string, source: Source }>({ text: '', source: 'all' })
  const isUnmountedRef = useRef(false)
  const [list, setList] = useState<LX.Music.MusicInfo[]>([])

  useImperativeHandle(ref, () => ({
    async loadList(text, source) {
      searchInfoRef.current = { text, source }
      try {
        const result = await search(text, 1, source)
        if (isUnmountedRef.current) return
        setList(result)
      } catch {
        if (isUnmountedRef.current) return
        setList([])
      }
    },
  }), [])

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  return <LibraryMusicListView list={list.length ? list : searchMusicState.listInfos[searchInfoRef.current.source]!.list} />
})
