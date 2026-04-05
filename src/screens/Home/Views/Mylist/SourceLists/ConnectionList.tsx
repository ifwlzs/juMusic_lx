import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useI18n } from '@/lang'
import Text from '@/components/common/Text'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { buildAggregateListSummary, buildSourceListSummaries } from '@/core/mediaLibrary/sourceLists'
import SourceMusicList from './SourceMusicList'

interface SourceListSummary {
  id: string
  connectionId: string
  name: string
  providerType: string
  count: number
  lastScanStatus?: string
}

export default ({ onClose }: { onClose: () => void }) => {
  const t = useI18n()
  const [connections, setConnections] = useState<LX.MediaLibrary.SourceConnection[]>([])
  const [sourceItems, setSourceItems] = useState<LX.MediaLibrary.SourceItem[]>([])
  const [aggregateSongs, setAggregateSongs] = useState<LX.MediaLibrary.AggregateSong[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [activeTitle, setActiveTitle] = useState('')

  const load = async() => {
    const nextConnections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
    const nextItems = await mediaLibraryRepository.getAllSourceItems(nextConnections.map(item => item.connectionId)) as LX.MediaLibrary.SourceItem[]
    const nextAggregateSongs = await mediaLibraryRepository.getAggregateSongs() as LX.MediaLibrary.AggregateSong[]
    setConnections(nextConnections)
    setSourceItems(nextItems)
    setAggregateSongs(nextAggregateSongs)
  }

  useEffect(() => {
    void load()
  }, [])

  const summaries = useMemo<SourceListSummary[]>(() => {
    const aggregateSummary: SourceListSummary = {
      ...buildAggregateListSummary(aggregateSongs),
      name: t('source_lists_total_library'),
    }
    return [
      aggregateSummary,
      ...(buildSourceListSummaries(connections, sourceItems) as SourceListSummary[]),
    ]
  }, [aggregateSongs, connections, sourceItems, t])

  const getProviderLabel = (providerType: string) => {
    switch (providerType) {
      case 'aggregate':
        return t('source_lists_total_library_type')
      case 'local':
        return t('source_real_local')
      case 'webdav':
        return t('source_real_webdav')
      case 'smb':
        return t('source_real_smb')
      default:
        return providerType
    }
  }

  if (activeConnectionId) {
    return (
      <SourceMusicList
        connectionId={activeConnectionId}
        title={activeTitle}
        onBack={() => {
          setActiveConnectionId(null)
        }}
        onClose={onClose}
      />
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('source_lists_title')}</Text>
        <Pressable onPress={onClose}>
          <Text>{t('close')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {summaries.map(summary => (
          <Pressable
            key={summary.id}
            onPress={() => {
              setActiveConnectionId(summary.connectionId)
              setActiveTitle(summary.name)
            }}
          >
            <View style={styles.item}>
              <Text>{summary.name}</Text>
              <Text size={12}>{getProviderLabel(summary.providerType)} · {t('source_lists_song_count', { count: summary.count })}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
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
    marginRight: 12,
  },
  content: {
    paddingVertical: 8,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
})
