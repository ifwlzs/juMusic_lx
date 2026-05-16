import { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react'
import SearchTipList, { type SearchTipListProps as _SearchTipListProps, type SearchTipListType } from '@/components/SearchTipList'
import { debounce } from '@/utils'
import { findArtistRelatedSongsInList, searchListMusic } from './listAction'
import Button from '@/components/common/Button'
import { createStyle, toast } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { View } from 'react-native'
import { scaleSizeH } from '@/utils/pixelRatio'
import { getListMusics } from '@/core/list'
import listState from '@/store/list/state'

type SearchTipListProps = _SearchTipListProps<LX.Music.MusicInfo>
interface ListMusicSearchProps {
  onScrollToInfo: (info: LX.Music.MusicInfo) => void
}
export const ITEM_HEIGHT = scaleSizeH(46)

// 统一搜索上下文，避免关键词搜索与歌手相关歌曲模式各自维护一套状态。
type SearchQuery = { type: 'keyword', value: string } | { type: 'artist', value: string }

export interface ListMusicSearchType {
  search: (keyword: string, height: number) => void
  showArtistRelatedSongs: (artist: string, height: number) => void
  hide: () => void
}

// 关键字模式保留原有防抖行为，避免输入过程中频繁重算结果列表。
export const debounceSearchList = debounce((text: string, list: LX.List.ListMusics, callback: (list: LX.List.ListMusics) => void) => {
  callback(searchListMusic(list, text))
}, 200)

// 按查询上下文解析结果列表，保证关键词模式与歌手模式只在这里分流。
const resolveListByQuery = (list: LX.List.ListMusics, query: SearchQuery) => {
  switch (query.type) {
    case 'artist':
      return findArtistRelatedSongsInList(list, query.value)
    default:
      return searchListMusic(list, query.value)
  }
}

// 统一判断查询值是否为空，空查询时直接收起结果浮层。
const hasQueryValue = (query: SearchQuery) => !!query.value.trim()


export default forwardRef<ListMusicSearchType, ListMusicSearchProps>(({ onScrollToInfo }, ref) => {
  const searchTipListRef = useRef<SearchTipListType<LX.Music.MusicInfo>>(null)
  const [visible, setVisible] = useState(false)
  const currentListIdRef = useRef('')
  const currentHeightRef = useRef(0)
  const currentQueryRef = useRef<SearchQuery | null>(null)
  const theme = useTheme()

  // 统一清理当前搜索上下文，避免列表刷新时继续使用已经失效的查询条件。
  const clearSearchState = () => {
    currentQueryRef.current = null
    currentListIdRef.current = ''
    currentHeightRef.current = 0
    searchTipListRef.current?.setList([])
  }

  // 背景点击需要按查询模式分流：关键字模式保留原有上下文，artist 模式则彻底清理旧查询。
  const handlePressBg = () => {
    if (currentQueryRef.current?.type == 'artist') {
      clearSearchState()
      return
    }
    searchTipListRef.current?.setList([])
  }

  // 统一驱动浮层结果刷新：首次展示可选择弹空提示，列表订阅刷新时则只静默收起。
  const updateListByQuery = (query: SearchQuery, height: number, showEmptyArtistToast: boolean) => {
    if (height > 0) currentHeightRef.current = height
    searchTipListRef.current?.setHeight(currentHeightRef.current)
    currentQueryRef.current = query
    const id = currentListIdRef.current = listState.activeListId

    if (!hasQueryValue(query)) {
      // 空查询直接清掉上下文并收口，避免残留旧状态继续响应列表刷新。
      clearSearchState()
      return
    }

    void getListMusics(id).then(list => {
      if (query.type == 'keyword') {
        debounceSearchList(query.value, list, result => {
          if (currentListIdRef.current != id) return
          if (currentQueryRef.current?.type != query.type || currentQueryRef.current.value != query.value) return
          searchTipListRef.current?.setList(result)
        })
        return
      }

      const result = resolveListByQuery(list, query)
      if (currentListIdRef.current != id) return
      if (currentQueryRef.current?.type != query.type || currentQueryRef.current.value != query.value) return
      if (!result.length) {
        // artist 模式无结果时必须同步清理查询状态，避免旧查询在后续列表更新时把浮层重新顶出来。
        if (showEmptyArtistToast) {
          toast(global.i18n.t('music_detail_artist_related_empty'))
        }
        clearSearchState()
        return
      }
      searchTipListRef.current?.setList(result)
    })
  }

  // 统一处理首次挂载后的展示时机，避免 ref 尚未建立就写入结果列表。
  const showWithQuery = (query: SearchQuery, height: number, showEmptyArtistToast: boolean) => {
    if (visible) {
      updateListByQuery(query, height, showEmptyArtistToast)
      return
    }
    setVisible(true)
    requestAnimationFrame(() => {
      updateListByQuery(query, height, showEmptyArtistToast)
    })
  }

  useImperativeHandle(ref, () => ({
    search(keyword, height) {
      // 关键字搜索继续沿用原有行为，只是改为写入统一查询上下文。
      showWithQuery({ type: 'keyword', value: keyword }, height, false)
    },
    showArtistRelatedSongs(artist, height) {
      // 歌手模式必须显式写入 artist 查询，供列表变更后的自动刷新逻辑复用。
      currentQueryRef.current = { type: 'artist', value: artist }
      showWithQuery(currentQueryRef.current, height, true)
    },
    hide() {
      clearSearchState()
    },
  }))

  useEffect(() => {
    const updateList = (id: string) => {
      currentListIdRef.current = id
      const query = currentQueryRef.current
      if (!query) return
      // 列表刷新导致歌手模式结果为空时只收起浮层，不重复弹出 toast 打扰用户。
      updateListByQuery(query, 0, false)
    }
    const handleChange = (ids: string[]) => {
      if (!ids.includes(listState.activeListId)) return
      updateList(listState.activeListId)
    }

    global.state_event.on('mylistToggled', updateList)
    global.app_event.on('myListMusicUpdate', handleChange)

    return () => {
      global.state_event.off('mylistToggled', updateList)
      global.app_event.off('myListMusicUpdate', handleChange)
    }
  }, [])

  const renderItem = ({ item, index }: { item: LX.Music.MusicInfo, index: number }) => {
    return (
      <Button style={styles.item} onPress={() => { onScrollToInfo(item) }} key={index}>
        <View style={styles.itemName}>
          <Text numberOfLines={1}>{item.name}</Text>
          <Text style={styles.subName} numberOfLines={1} size={12} color={theme['c-font']}>{item.singer} ({item.meta.albumName})</Text>
        </View>
        <Text style={styles.itemSource} size={12} color={theme['c-font']}>{item.source}</Text>
      </Button>
    )
  }
  const getkey: SearchTipListProps['keyExtractor'] = item => item.id
  const getItemLayout: SearchTipListProps['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return (
    visible
      ? <SearchTipList
          ref={searchTipListRef}
          renderItem={renderItem}
          onPressBg={handlePressBg}
          keyExtractor={getkey}
          getItemLayout={getItemLayout}
        />
      : null
  )
})


const styles = createStyle({
  item: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 15,
  },
  itemName: {
    flexGrow: 1,
    flexShrink: 1,
  },
  subName: {
    marginTop: 2,
  },
  itemSource: {
    flexGrow: 0,
    flexShrink: 0,
  },
})
