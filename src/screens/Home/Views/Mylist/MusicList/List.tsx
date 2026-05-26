import { playList } from '@/core/player/player'
import { useMemo, useRef, useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { FlatList, PanResponder, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type FlatListProps } from 'react-native'

import listState from '@/store/list/state'
import playerState from '@/store/player/state'
import { getListPosition, getListPrevSelectId, saveListPosition } from '@/utils/data'
// import { useMusicList } from '@/store/list/hook'
import { getListMusics, setActiveList } from '@/core/list'
import ListItem, { ITEM_HEIGHT } from './ListItem'
import { createStyle, getRowInfo } from '@/utils/tools'
import { usePlayInfo, usePlayMusicInfo } from '@/store/player/hook'
import type { Position } from './ListMenu'
import type { SelectMode } from './MultipleModeBar'
import { useActiveListId } from '@/store/list/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { isUnavailableMediaLibraryMusic, showUnavailableMusicToast } from './listAction'
import { getFastScrollHandleTop, getFastScrollHandleTopByOffset, getFastScrollLocalY, getFastScrollTarget, shouldShowFastScroll } from './fastScroll'

type FlatListType = FlatListProps<LX.Music.MusicInfo>
const FAST_SCROLL_HANDLE_HEIGHT = ITEM_HEIGHT

export interface ListProps {
  onShowMenu: (musicInfo: LX.Music.MusicInfo, index: number, position: Position) => void
  onMuiltSelectMode: () => void
  onSelectAll: (isAll: boolean) => void
}
export interface ListType {
  setIsMultiSelectMode: (isMultiSelectMode: boolean) => void
  setSelectMode: (mode: SelectMode) => void
  selectAll: (isAll: boolean) => void
  getSelectedList: () => LX.List.ListMusics
  scrollToInfo: (info: LX.Music.MusicInfo) => void
  scrollToTop: () => void
}

const usePlayIndex = () => {
  const activeListId = useActiveListId()
  const playMusicInfo = usePlayMusicInfo()
  const playInfo = usePlayInfo()

  const playIndex = useMemo(() => {
    return playMusicInfo.listId == activeListId ? playInfo.playIndex : -1
  }, [activeListId, playInfo.playIndex, playMusicInfo.listId])

  return playIndex
}


const List = forwardRef<ListType, ListProps>(({ onShowMenu, onMuiltSelectMode, onSelectAll }, ref) => {
  // const t = useI18n()
  const flatListRef = useRef<FlatList>(null)
  const [currentList, setList] = useState<LX.List.ListMusics>([])
  const listFirstScrollRef = useRef(false)
  const isMultiSelectModeRef = useRef(false)
  const selectModeRef = useRef<SelectMode>('single')
  const prevSelectIndexRef = useRef(-1)
  const [selectedList, setSelectedList] = useState<LX.List.ListMusics>([])
  const [listHeight, setListHeight] = useState(0)
  const [fastScrollHandleTop, setFastScrollHandleTop] = useState(0)
  const fastScrollTouchRef = useRef<View>(null)
  const fastScrollContainerPageYRef = useRef(0)
  const isFastScrollDraggingRef = useRef(false)
  const selectedListRef = useRef<LX.List.ListMusics>([])
  const currentListIdRef = useRef('')
  const waitJumpListPositionRef = useRef(false)
  const rowInfo = useRef(getRowInfo())
  const activeListId = useActiveListId()
  const isShowAlbumName = useSettingValue('list.isShowAlbumName')
  const isShowInterval = useSettingValue('list.isShowInterval')
  const theme = useTheme()
  // console.log('render music list')

  useImperativeHandle(ref, () => ({
    setIsMultiSelectMode(isMultiSelectMode) {
      isMultiSelectModeRef.current = isMultiSelectMode
      if (!isMultiSelectMode) {
        prevSelectIndexRef.current = -1
        handleUpdateSelectedList([])
      }
    },
    setSelectMode(mode) {
      selectModeRef.current = mode
    },
    selectAll(isAll) {
      let list: LX.List.ListMusics
      if (isAll) {
        list = [...currentList]
      } else {
        list = []
      }
      selectedListRef.current = list
      setSelectedList(list)
    },
    getSelectedList() {
      return selectedListRef.current
    },
    scrollToInfo(info) {
      void getListMusics(listState.activeListId).then((list) => {
        const index = list.findIndex(m => m.id == info.id)
        if (index < 0) return
        flatListRef.current?.scrollToIndex({ index: Math.floor(index / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
      })
    },
    scrollToTop() {
      flatListRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      })
    },
  }))

  useEffect(() => {
    let isUpdateingList = true
    const updateList = (id: string) => {
      if (currentListIdRef.current == id) return
      isUpdateingList = true
      setList([])
      currentListIdRef.current = id
      void Promise.all([getListMusics(id), getListPosition(id)]).then(([list, position]) => {
        requestAnimationFrame(() => {
          if (currentListIdRef.current != id) return
          selectedListRef.current = []
          setSelectedList([])
          setList([...list])
          requestAnimationFrame(() => {
            isUpdateingList = false
            listFirstScrollRef.current = true
            if (waitJumpListPositionRef.current) {
              waitJumpListPositionRef.current = false
              if (playerState.playMusicInfo.listId == id && playerState.playInfo.playIndex > -1) {
                try {
                  flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: false })
                  return
                } catch {}
              }
            }
            flatListRef.current?.scrollToOffset({ offset: position, animated: false })
          })
        })
      })
    }
    const handleChange = (ids: string[]) => {
      if (!ids.includes(listState.activeListId)) return
      const id = listState.activeListId
      void getListMusics(id).then((list) => {
        if (currentListIdRef.current != id) return
        selectedListRef.current = []
        setSelectedList([])
        setList([...list])
      })
    }

    const handleJumpPosition = () => {
      requestAnimationFrame(() => {
        const listId = playerState.playMusicInfo.listId
        if (!listId) return
        if (listId != listState.activeListId) {
          setActiveList(listId)
          if (currentListIdRef.current != listId) waitJumpListPositionRef.current = true
        } else if (playerState.playInfo.playIndex > -1) {
          if (isUpdateingList) waitJumpListPositionRef.current = true
          else {
            try {
              flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
            } catch {}
          }
        }
      })
    }
    if (global.lx.jumpMyListPosition) {
      global.lx.jumpMyListPosition = false
      if (playerState.playMusicInfo.listId) {
        waitJumpListPositionRef.current = true
        updateList(playerState.playMusicInfo.listId)
      } else void getListPrevSelectId().then(updateList)
    } else void getListPrevSelectId().then(updateList)

    global.state_event.on('mylistToggled', updateList)
    global.app_event.on('myListMusicUpdate', handleChange)
    global.app_event.on('jumpListPosition', handleJumpPosition)

    return () => {
      global.state_event.off('mylistToggled', updateList)
      global.app_event.off('myListMusicUpdate', handleChange)
      global.app_event.off('jumpListPosition', handleJumpPosition)
    }
  }, [])

  const activeIndex = usePlayIndex()
  const isFastScrollVisible = shouldShowFastScroll({
    height: listHeight,
    itemCount: currentList.length,
    rowNum: rowInfo.current.rowNum,
  })

  const updateFastScrollContainerPageY = useCallback(() => {
    fastScrollTouchRef.current?.measureInWindow((x, y) => {
      // x 只用于确认原生测量返回有效坐标；快速滚动换算只需要热区顶部的屏幕 Y 坐标。
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      fastScrollContainerPageYRef.current = y
    })
  }, [])

  useEffect(() => {
    if (!isFastScrollVisible) return

    // 快速滚动热区挂载后异步测一次屏幕位置，避免首次拖动时仍使用默认 0 坐标。
    requestAnimationFrame(updateFastScrollContainerPageY)
  }, [isFastScrollVisible, updateFastScrollContainerPageY])

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    setListHeight(event.nativeEvent.layout.height)
    updateFastScrollContainerPageY()
  }, [updateFastScrollContainerPageY])

  const handleFastScrollGesture = useCallback((pageY: number) => {
    const y = getFastScrollLocalY({
      pageY,
      containerPageY: fastScrollContainerPageYRef.current,
    })

    // 右侧拖动把手要同步跟随手指，避免只有透明热区响应而看不到“正在拉”的反馈。
    setFastScrollHandleTop(getFastScrollHandleTop({
      y,
      height: listHeight,
      handleHeight: FAST_SCROLL_HANDLE_HEIGHT,
    }))

    // 右侧热区把手指位置换算成 FlatList 行号，实际滚动位置仍交给 onScroll 持久化。
    const index = getFastScrollTarget({
      y,
      height: listHeight,
      itemCount: currentList.length,
      rowNum: rowInfo.current.rowNum,
    })

    try {
      flatListRef.current?.scrollToIndex({ index, animated: false })
    } catch {}
  }, [currentList.length, listHeight])

  const fastScrollPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => isFastScrollVisible,
    onMoveShouldSetPanResponder: () => isFastScrollVisible,
    onPanResponderGrant: event => {
      isFastScrollDraggingRef.current = true
      updateFastScrollContainerPageY()
      handleFastScrollGesture(event.nativeEvent.pageY)
    },
    onPanResponderMove: (event, gestureState) => {
      const pageY = Number.isFinite(gestureState.moveY) ? gestureState.moveY : event.nativeEvent.pageY
      handleFastScrollGesture(pageY)
    },
    onPanResponderRelease: () => {
      isFastScrollDraggingRef.current = false
      updateFastScrollContainerPageY()
    },
    onPanResponderTerminate: () => {
      isFastScrollDraggingRef.current = false
      updateFastScrollContainerPageY()
    },
  }), [handleFastScrollGesture, isFastScrollVisible, updateFastScrollContainerPageY])

  const handlePlay = (index: number) => {
    void playList(activeListId, index)
  }

  const handleUpdateSelectedList = (newList: LX.List.ListMusics) => {
    if (selectedListRef.current.length && newList.length == currentList.length) onSelectAll(true)
    else if (selectedListRef.current.length == currentList.length) onSelectAll(false)
    selectedListRef.current = newList
    setSelectedList(newList)
  }
  const handleSelect = (item: LX.Music.MusicInfo, pressIndex: number) => {
    let newList: LX.List.ListMusics
    if (selectModeRef.current == 'single') {
      prevSelectIndexRef.current = pressIndex
      const index = selectedListRef.current.indexOf(item)
      if (index < 0) {
        newList = [...selectedListRef.current, item]
      } else {
        newList = [...selectedListRef.current]
        newList.splice(index, 1)
      }
    } else {
      if (selectedListRef.current.length) {
        const prevIndex = prevSelectIndexRef.current
        const currentIndex = pressIndex
        if (prevIndex == currentIndex) {
          newList = []
        } else if (currentIndex > prevIndex) {
          newList = currentList.slice(prevIndex, currentIndex + 1)
        } else {
          newList = currentList.slice(currentIndex, prevIndex + 1)
          newList.reverse()
        }
      } else {
        newList = [item]
        prevSelectIndexRef.current = pressIndex
      }
    }

    handleUpdateSelectedList(newList)
  }

  const handlePress = (item: LX.Music.MusicInfo, index: number) => {
    // console.log(global.lx.homePagerIdle)
    requestAnimationFrame(() => {
      // console.log(global.lx.homePagerIdle)
      if (!global.lx.homePagerIdle) return
      if (isMultiSelectModeRef.current) {
        handleSelect(item, index)
      } else {
        if (isUnavailableMediaLibraryMusic(item)) {
          showUnavailableMusicToast()
          return
        }
        handlePlay(index)
      }
    })
  }

  const handleLongPress = (item: LX.Music.MusicInfo, index: number) => {
    if (isMultiSelectModeRef.current) return
    prevSelectIndexRef.current = index
    handleUpdateSelectedList([item])
    onMuiltSelectMode()
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isFastScrollVisible && !isFastScrollDraggingRef.current) {
      setFastScrollHandleTop(getFastScrollHandleTopByOffset({
        offset: nativeEvent.contentOffset.y,
        contentHeight: nativeEvent.contentSize.height,
        height: nativeEvent.layoutMeasurement.height,
        handleHeight: FAST_SCROLL_HANDLE_HEIGHT,
      }))
    }
    if (listFirstScrollRef.current) {
      listFirstScrollRef.current = false
      return
    }
    void saveListPosition(listState.activeListId, nativeEvent.contentOffset.y)
  }


  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      item={item}
      index={index}
      activeIndex={activeIndex}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onShowMenu={onShowMenu}
      selectedList={selectedList}
      rowInfo={rowInfo.current}
      isShowAlbumName={isShowAlbumName}
      isShowInterval={isShowInterval}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return (
    <View style={styles.container} onLayout={handleListLayout}>
      <FlatList
        ref={flatListRef}
        onScroll={handleScroll}
        style={styles.list}
        data={currentList}
        maxToRenderPerBatch={4}
        numColumns={rowInfo.current.rowNum}
        horizontal={false}
        // updateCellsBatchingPeriod={80}
        windowSize={8}
        removeClippedSubviews={true}
        initialNumToRender={12}
        renderItem={renderItem}
        keyExtractor={getkey}
        extraData={activeIndex}
        getItemLayout={getItemLayout}
      />
      {
        isFastScrollVisible
          ? (
              <View
                ref={fastScrollTouchRef}
                style={styles.fastScrollTouch}
                onLayout={updateFastScrollContainerPageY}
                {...fastScrollPanResponder.panHandlers}
              >
                <View style={{ ...styles.fastScrollTrack, backgroundColor: theme['c-primary-background-hover'] }} />
                <View style={{
                  ...styles.fastScrollHandle,
                  top: fastScrollHandleTop,
                  height: FAST_SCROLL_HANDLE_HEIGHT,
                  backgroundColor: theme['c-primary'],
                }}>
                  <View style={styles.fastScrollHandleGripGroup}>
                    <View style={{ ...styles.fastScrollHandleGrip, backgroundColor: theme['c-primary-font'] }} />
                    <View style={{ ...styles.fastScrollHandleGrip, backgroundColor: theme['c-primary-font'] }} />
                    <View style={{ ...styles.fastScrollHandleGrip, backgroundColor: theme['c-primary-font'] }} />
                  </View>
                </View>
              </View>
            )
          : null
      }
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    position: 'relative',
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  fastScrollTouch: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 34,
    zIndex: 3,
  },
  fastScrollTrack: {
    position: 'absolute',
    top: 8,
    right: 15,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    opacity: 0.65,
  },
  fastScrollHandle: {
    position: 'absolute',
    right: 4,
    width: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  fastScrollHandleGripGroup: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fastScrollHandleGrip: {
    width: 10,
    height: 2,
    borderRadius: 1,
    marginTop: 2,
    marginBottom: 2,
    opacity: 0.9,
  },
})

export default List
