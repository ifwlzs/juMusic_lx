import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import Text from '@/components/common/Text'
import { LIST_IDS } from '@/config/constant'
import { addListMusics } from '@/core/list'
import { playList } from '@/core/player/player'
import { navigations } from '@/navigation'
import settingState from '@/store/setting/state'
import { getListMusicSync } from '@/utils/listManage'
import { handleShowMusicSourceDetail, isInternalMusicDetailTarget } from '@/utils/musicDetailRoute'
import { useI18n } from '@/lang'

export default ({
  list,
  entrySource = 'list_click',
  componentId,
  sourceListId,
  enableDetail = false,
}: {
  list: LX.Music.MusicInfo[]
  entrySource?: LX.MediaLibrary.PlaybackEntrySource
  componentId?: string
  sourceListId?: string
  enableDetail?: boolean
}) => {
  const t = useI18n()
  const onPlay = (musicInfo: LX.Music.MusicInfo) => {
    void addListMusics(LIST_IDS.DEFAULT, [musicInfo], settingState.setting['list.addMusicLocationType']).then(() => {
      const index = getListMusicSync(LIST_IDS.DEFAULT).findIndex(item => item.id == musicInfo.id)
      if (index < 0) return
      void playList(LIST_IDS.DEFAULT, index, { entrySource })
    })
  }
  const onShowDetail = (musicInfo: LX.Music.MusicInfo) => {
    // 搜索结果里的本地与媒体库歌曲进入应用内详情页，在线音源继续保留 SDK 外链详情。
    if (isInternalMusicDetailTarget(musicInfo)) {
      if (!componentId) return
      navigations.pushMusicDetailScreen(componentId, {
        musicInfo,
        sourceListId,
      })
      return
    }

    void handleShowMusicSourceDetail(musicInfo)
  }

  return (
    <FlatList
      data={list}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.itemRow}>
          <Pressable style={styles.itemContent} onPress={() => { onPlay(item) }}>
            <Text numberOfLines={1}>{item.name}</Text>
            <Text size={12} numberOfLines={1}>{item.singer} · {item.interval ?? '--:--'}</Text>
          </Pressable>
          {enableDetail
            ? <Pressable style={styles.detailButton} onPress={() => { onShowDetail(item) }}>
                <Text size={12}>{t('music_source_detail')}</Text>
              </Pressable>
            : null}
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
})
