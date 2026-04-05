import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import LibraryMusicList from '@/components/LibraryMusicList'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { toMediaLibraryMusicInfo } from '@/core/mediaLibrary/sourceLists'

export default ({ connectionId, title, onBack, onClose }: {
  connectionId: string
  title: string
  onBack: () => void
  onClose: () => void
}) => {
  const t = useI18n()
  const [list, setList] = useState<LX.Music.MusicInfo[]>([])

  useEffect(() => {
    const load = async() => {
      if (connectionId === '__aggregate__') {
        const aggregateItems = await mediaLibraryRepository.getAggregateSongs() as LX.MediaLibrary.AggregateSong[]
        setList(aggregateItems.map(item => toMediaLibraryMusicInfo(item) as LX.Music.MusicInfo))
        return
      }

      const sourceItems = await mediaLibraryRepository.getSourceItems(connectionId) as LX.MediaLibrary.SourceItem[]
      setList(sourceItems.map(item => toMediaLibraryMusicInfo(item) as LX.Music.MusicInfo))
    }

    void load()
  }, [connectionId])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text>{t('back')}</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        <Pressable onPress={onClose}>
          <Text>{t('close')}</Text>
        </Pressable>
      </View>
      <LibraryMusicList list={list} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    flex: 1,
    marginHorizontal: 12,
  },
})
