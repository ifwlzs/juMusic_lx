import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import { useActiveListId, useListFetching, useMyList } from '@/store/list/hook'
import { createStyle } from '@/utils/tools'
import { getListPrevSelectId } from '@/utils/data'
import { setActiveList } from '@/core/list'
import Text from '@/components/common/Text'
import { LIST_IDS } from '@/config/constant'
import Loading from '@/components/common/Loading'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { enqueueImportRuleSyncJob } from '@/core/mediaLibrary/jobQueue'
import { toast } from '@/utils/tools'
import { type MediaSourceManagerShowOptions } from '../../Setting/settings/Basic/MediaSourceManagerModal'

export interface ActiveListProps {
  onShowSearchBar: () => void
  onScrollToTop: () => void
  onOpenMediaSourceManager: (target: MediaSourceManagerShowOptions) => void
}
export interface ActiveListType {
  setVisibleBar: (visible: boolean) => void
}

export default forwardRef<ActiveListType, ActiveListProps>(({ onShowSearchBar, onScrollToTop, onOpenMediaSourceManager }, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const currentListId = useActiveListId()
  const allLists = useMyList()
  const fetching = useListFetching(currentListId)
  const langId = useSettingValue('common.langId')
  const currentListInfo = useMemo(() => {
    return allLists.find(list => list.id === currentListId) ?? null
  }, [allLists, currentListId])
  const generatedMediaSource = currentListInfo && 'mediaSource' in currentListInfo && currentListInfo.mediaSource?.generated
    ? currentListInfo.mediaSource
    : null
  const currentListName = useMemo(() => {
    switch (currentListId) {
      case LIST_IDS.TEMP:
        return global.i18n.t('list_name_temp')
      case LIST_IDS.DEFAULT:
        return global.i18n.t('list_name_default')
      case LIST_IDS.LOVE:
        return global.i18n.t('list_name_love')
      default:
        return currentListInfo?.name ?? ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentListId, currentListInfo?.name, langId])
  const [visibleBar, setVisibleBar] = useState(true)

  useImperativeHandle(ref, () => ({
    setVisibleBar(visible) {
      setVisibleBar(visible)
    },
  }))

  const showList = () => {
    global.app_event.changeLoveListVisible(true)
  }

  const handleOpenMediaSourceManager = () => {
    if (!generatedMediaSource) return
    onOpenMediaSourceManager({
      connectionId: generatedMediaSource.connectionId,
      ruleId: generatedMediaSource.ruleId,
    })
  }

  const handleUpdateGeneratedList = () => {
    if (!generatedMediaSource) return
    void (async() => {
      const rules = await mediaLibraryRepository.getImportRules() as LX.MediaLibrary.ImportRule[]
      const targetRules = generatedMediaSource.ruleId
        ? rules.filter(rule => rule.ruleId === generatedMediaSource.ruleId)
        : rules.filter(rule => rule.connectionId === generatedMediaSource.connectionId)
      if (!targetRules.length) {
        toast(t('media_source_no_rules'))
        return
      }
      await Promise.all(targetRules.map(async rule => enqueueImportRuleSyncJob({
        connectionId: rule.connectionId,
        ruleId: rule.ruleId,
        previousRule: rule,
      })))
      toast(t('media_source_job_queued'))
    })()
  }

  useEffect(() => {
    void getListPrevSelectId().then((id) => {
      setActiveList(id)
    })
  }, [])

  return (
    <View style={{ ...styles.currentList, opacity: visibleBar ? 1 : 0, borderBottomColor: theme['c-border-background'] }}>
      <TouchableOpacity onPress={showList} onLongPress={onScrollToTop} style={styles.currentListMain}>
        <Icon style={styles.currentListIcon} color={theme['c-button-font']} name="chevron-right" size={12} />
        { fetching ? <Loading color={theme['c-button-font']} style={styles.loading} /> : null }
        <Text style={styles.currentListText} numberOfLines={1} color={theme['c-button-font']}>{currentListName}</Text>
      </TouchableOpacity>
      {generatedMediaSource ? (
        <>
          <TouchableOpacity style={styles.currentListAction} onPress={handleOpenMediaSourceManager}>
            <Text size={12} numberOfLines={1} color={theme['c-button-font']}>{t('media_source_view_rule')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.currentListAction} onPress={handleUpdateGeneratedList}>
            <Text size={12} numberOfLines={1} color={theme['c-button-font']}>{t('media_source_update')}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      <TouchableOpacity style={styles.currentListBtns} onPress={onShowSearchBar}>
        <Icon color={theme['c-button-font']} name="search-2" />
      </TouchableOpacity>
    </View>
  )
})


const styles = createStyle({
  currentList: {
    flexDirection: 'row',
    paddingRight: 2,
    height: 36,
    alignItems: 'center',
    borderBottomWidth: BorderWidths.normal,
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
  currentListIcon: {
    paddingLeft: 15,
    paddingRight: 10,
    // paddingTop: 10,
    // paddingBottom: 0,
  },
  currentListText: {
    flex: 1,
    // minWidth: 70,
    // paddingLeft: 10,
    paddingRight: 10,
    // paddingTop: 10,
    // paddingBottom: 10,
  },
  loading: {
    marginRight: 5,
  },
  currentListMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  currentListAction: {
    height: '100%',
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentListBtns: {
    width: 46,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
})
