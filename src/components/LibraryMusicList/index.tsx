import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import Text from '@/components/common/Text'
import { LIST_IDS } from '@/config/constant'
import { addListMusics } from '@/core/list'
import { playList } from '@/core/player/player'
import settingState from '@/store/setting/state'
import { getListMusicSync } from '@/utils/listManage'

const handlePlay = (musicInfo: LX.Music.MusicInfo) => {
  if (musicInfo.source === 'local') {
    void addListMusics(LIST_IDS.DEFAULT, [musicInfo], settingState.setting['list.addMusicLocationType']).then(() => {
      const index = getListMusicSync(LIST_IDS.DEFAULT).findIndex(item => item.id == musicInfo.id)
      if (index < 0) return
      void playList(LIST_IDS.DEFAULT, index)
    })
  }
}

export default ({ list }: { list: LX.Music.MusicInfo[] }) => {
  return (
    <FlatList
      data={list}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => { handlePlay(item) }}>
          <View style={styles.item}>
            <Text numberOfLines={1}>{item.name}</Text>
            <Text size={12} numberOfLines={1}>{item.singer} · {item.interval ?? '--:--'}</Text>
          </View>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
})
