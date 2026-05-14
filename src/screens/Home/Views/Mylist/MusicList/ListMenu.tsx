import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { useI18n } from '@/lang'
import Menu, { type Menus, type MenuType, type Position } from '@/components/common/Menu'
import { hasDislike } from '@/core/dislikeList'
import { existsFile } from '@/utils/fs'
import listState from '@/store/list/state'

export interface SelectInfo {
  musicInfo: LX.Music.MusicInfo
  selectedList: LX.Music.MusicInfo[]
  index: number
  listId: string
  single: boolean
}
const initSelectInfo = {}

export interface ListMenuProps {
  onPlay: (selectInfo: SelectInfo) => void
  onPlayLater: (selectInfo: SelectInfo) => void
  onAdd: (selectInfo: SelectInfo) => void
  onMove: (selectInfo: SelectInfo) => void
  onEditMetadata: (selectInfo: SelectInfo) => void
  onCopyName: (selectInfo: SelectInfo) => void
  onChangePosition: (selectInfo: SelectInfo) => void
  onToggleSource: (selectInfo: SelectInfo) => void
  onMusicSourceDetail: (selectInfo: SelectInfo) => void
  onDislikeMusic: (selectInfo: SelectInfo) => void
  onRemove: (selectInfo: SelectInfo) => void
}
export interface ListMenuType {
  show: (selectInfo: SelectInfo, position: Position) => void
}

export type {
  Position,
}

const hasEditMetadata = async(musicInfo: LX.Music.MusicInfo) => {
  if (musicInfo.source != 'local') return false
  return existsFile(musicInfo.meta.filePath)
}

const getMediaLibraryInfo = (musicInfo: LX.Music.MusicInfo) => {
  return 'mediaLibrary' in musicInfo.meta ? musicInfo.meta.mediaLibrary : undefined
}

export default forwardRef<ListMenuType, ListMenuProps>((props, ref) => {
  const t = useI18n()
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<MenuType>(null)
  const selectInfoRef = useRef<SelectInfo>(initSelectInfo as SelectInfo)
  const [menus, setMenus] = useState<Menus>([])

  useImperativeHandle(ref, () => ({
    show(selectInfo, position) {
      selectInfoRef.current = selectInfo
      handleSetMenu(selectInfo)
      if (visible) menuRef.current?.show(position)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          menuRef.current?.show(position)
        })
      }
    },
  }))

  const handleSetMenu = (selectInfo: SelectInfo) => {
    const musicInfo = selectInfo.musicInfo
    const listInfo = listState.allList.find(item => item.id == selectInfo.listId) as LX.List.UserListInfo | undefined
    const isReadOnlyList = !!listInfo?.mediaSource?.readOnly
    const isUnavailable = !!getMediaLibraryInfo(musicInfo)?.unavailableReason
    const isPlayDisabled = isUnavailable
    const isMoveDisabled = isReadOnlyList || isUnavailable
    const isToggleSourceDisabled = isUnavailable
    const isRemoveDisabled = isReadOnlyList || isUnavailable
    let edit_metadata = false
    const menu = [
      { action: 'play', disabled: isPlayDisabled, label: t('play') },
      { action: 'playLater', disabled: isPlayDisabled, label: t('play_later') },
      // { action: 'download', label: '下载' },
      { action: 'add', label: t('add_to') },
      { action: 'move', disabled: isMoveDisabled, label: t('move_to') },
      { action: 'changePosition', disabled: isMoveDisabled, label: t('change_position') },
      { action: 'toggleSource', disabled: isToggleSourceDisabled, label: t('toggle_source') },
      { action: 'copyName', label: t('copy_name') },
      // 详情入口统一保持可点击，具体走应用内弹窗还是外链由页面层继续分流。
      { action: 'musicSourceDetail', label: t('music_source_detail') },
      // { action: 'musicSearch', label: t('music_search') },
      { action: 'dislike', disabled: hasDislike(musicInfo), label: t('dislike') },
      { action: 'remove', disabled: isRemoveDisabled, label: t('delete') },
    ]
    if (musicInfo.source == 'local') menu.splice(5, 0, { action: 'editMetadata', disabled: isMoveDisabled || !edit_metadata, label: t('edit_metadata') })
    setMenus(menu)
    void Promise.all([hasEditMetadata(musicInfo)]).then(([_edit_metadata]) => {
      // console.log(_edit_metadata)
      let isUpdated = false
      if (edit_metadata != _edit_metadata) {
        edit_metadata = _edit_metadata
        isUpdated ||= true
      }

      if (isUpdated) {
        const editMetadataIndex = menu.findIndex(m => m.action == 'editMetadata')
        if (editMetadataIndex < 0) return
        menu[editMetadataIndex].disabled = isMoveDisabled || !edit_metadata
        setMenus([...menu])
      }
    })
  }

  const handleMenuPress = ({ action }: typeof menus[number]) => {
    const selectInfo = selectInfoRef.current
    switch (action) {
      case 'play':
        props.onPlay(selectInfo)
        break
      case 'playLater':
        props.onPlayLater(selectInfo)

        break
      case 'add':
        props.onAdd(selectInfo)
        // isMoveRef.current = false
        // selectedListRef.current.length
        //   ? setVisibleMusicMultiAddModal(true)
        //   : setVisibleMusicAddModal(true)
        break
      case 'move':
        props.onMove(selectInfo)
        // isMoveRef.current = true
        // selectedListRef.current.length
        //   ? setVisibleMusicMultiAddModal(true)
        //   : setVisibleMusicAddModal(true)
        break
      case 'editMetadata':
        props.onEditMetadata(selectInfo)
        break
      case 'copyName':
        props.onCopyName(selectInfo)
        break
      case 'changePosition':
        props.onChangePosition(selectInfo)
        // setVIsibleMusicPosition(true)
        break
      case 'toggleSource':
        props.onToggleSource(selectInfo)
        // setVIsibleMusicPosition(true)
        break
      case 'musicSourceDetail':
        props.onMusicSourceDetail(selectInfo)
        // setVIsibleMusicPosition(true)
        break
      case 'dislike':
        props.onDislikeMusic(selectInfo)
        break
      case 'remove':
        props.onRemove(selectInfo)
        break
      default:
        break
    }
  }

  return (
    visible
      ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />
      : null
  )
})
