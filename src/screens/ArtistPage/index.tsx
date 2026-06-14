import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import { useI18n } from '@/lang'
import { pop } from '@/navigation'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { loadArtistSongs, playArtistSongs } from '@/core/mediaLibrary/artistPage'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { toast } from '@/utils/tools'

type ArtistMatchMode = 'token' | 'exact'

// 歌手页顶部栏内容区高度，状态栏安全区会在运行时额外叠加，避免异形屏遮挡。
const HEADER_HEIGHT = 56

export interface ArtistPageProps {
  componentId: string
  artistName: string
  matchMode: ArtistMatchMode
  sourceSinger?: string
}

export default ({ componentId, artistName, matchMode }: ArtistPageProps) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const [songs, setSongs] = useState<LX.Music.MusicInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let canceled = false
    setLoading(true)
    void loadArtistSongs({ repository: mediaLibraryRepository, artistName, matchMode })
      .then((list: LX.Music.MusicInfo[]) => {
        if (canceled) return
        setSongs(list)
      })
      .catch((error: unknown) => {
        // 页面内二次加载失败时只提示错误并保持空列表，入口处仍会负责避免主动进入空页。
        console.warn('load artist songs failed', error)
        if (!canceled) toast(t('artist_page_load_failed'))
      })
      .finally(() => {
        if (!canceled) setLoading(false)
      })
    return () => {
      canceled = true
    }
  }, [artistName, matchMode, t])

  const handleBack = useCallback(() => {
    void pop(componentId)
  }, [componentId])

  const handlePlay = useCallback((index: number) => {
    if (!songs.length) return
    // 歌手页播放复用临时列表队列，保证点击单曲和播放全部都在当前歌手页结果内连续播放。
    void playArtistSongs({ artistName, songs, index, setTempList, playList })
  }, [artistName, songs])

  return (
    <PageContent>
      <StatusBar />
      <View style={{ ...styles.container, backgroundColor: theme['c-content-background'] }}>
        <View style={{ ...styles.header, height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
          <Button style={styles.backButton} onPress={handleBack}>
            <Icon name="chevron-left" size={18} color={theme['c-font']} />
          </Button>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1} color={theme['c-font']}>{artistName}</Text>
            <Text size={12} numberOfLines={1} color={theme['c-font-label']}>
              {t('artist_page_song_count', { count: songs.length })}
            </Text>
          </View>
        </View>
        <View style={styles.actionBar}>
          <Button style={{ ...styles.playAllButton, backgroundColor: theme['c-button-background'] }} disabled={!songs.length} onPress={() => { handlePlay(0) }}>
            <Text color={theme['c-button-font']}>{t('artist_page_play_all')}</Text>
          </Button>
        </View>
        {
          loading
            ? <View style={styles.loading}><ActivityIndicator color={theme['c-primary-font']} /></View>
            : (
              <FlatList
                data={songs}
                keyExtractor={(item, index) => `${item.id}_${index}`}
                renderItem={({ item, index }) => (
                  <Pressable onPress={() => { handlePlay(index) }}>
                    <View style={{ ...styles.item, borderBottomColor: theme['c-border-background'] }}>
                      <Text numberOfLines={1} color={theme['c-font']}>{item.name}</Text>
                      <Text size={12} numberOfLines={1} color={theme['c-font-label']}>
                        {item.singer}{item.meta.albumName ? ` · ${item.meta.albumName}` : ''}{item.interval ? ` · ${item.interval}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
              )
        }
      </View>
    </PageContent>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    paddingRight: 16,
  },
  title: {
    fontWeight: '700',
  },
  actionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playAllButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
