import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import ArtistEntry from '@/screens/PlayDetail/components/ArtistEntry'
import { useI18n, type Message } from '@/lang'
import { pop } from '@/navigation'
import { clipboardWriteText, toast } from '@/utils/tools'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { useMyList } from '@/store/list/hook'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { enqueueImportRuleSyncJob } from '@/core/mediaLibrary/jobQueue'
import { findMusicDetailRescanRule } from '@/core/mediaLibrary/musicDetailRescan'
import { buildMusicDetailCacheSection } from '@/components/MusicDetailModal/buildCacheStatusSection'
import {
  buildMusicDetailCopyText,
  buildMusicDetailSections,
  getMusicDetailCopyActions,
} from '@/components/MusicDetailModal/buildDetailSections'

export interface MusicDetailPageProps {
  componentId: string
  musicInfo: LX.Music.MusicInfo
  sourceListId?: string | null
}

// 歌曲详情页顶部内容区高度，运行时叠加状态栏高度来适配异形屏。
const HEADER_HEIGHT = 56

const getMediaLibraryInfo = (musicInfo: LX.Music.MusicInfo) => {
  // 页面层只需要源条目 ID 来读缓存索引，非媒体库歌曲直接跳过查询。
  return 'mediaLibrary' in musicInfo.meta ? musicInfo.meta.mediaLibrary : undefined
}

const isTranslateValueKey = (value: string): value is keyof Message => {
  // 详情模型中的来源、状态和缓存值可能是 i18n key，页面层负责转成用户可读文案。
  return value.startsWith('music_detail_') || value.startsWith('source_real_')
}

export default ({ componentId, musicInfo, sourceListId }: MusicDetailPageProps) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const userLists = useMyList()
  const mediaLibrary = getMediaLibraryInfo(musicInfo)
  const [cacheEntry, setCacheEntry] = useState<LX.MediaLibrary.MediaCache | null>(null)
  const [isRescanSubmitting, setRescanSubmitting] = useState(false)
  const sections = useMemo(() => {
    const baseSections = buildMusicDetailSections(musicInfo)
    const cacheSection = buildMusicDetailCacheSection(musicInfo, cacheEntry)
    return cacheSection ? [...baseSections, cacheSection] : baseSections
  }, [cacheEntry, musicInfo])
  const copyActions = getMusicDetailCopyActions(musicInfo)

  useEffect(() => {
    if (!mediaLibrary?.sourceItemId) {
      setCacheEntry(null)
      return
    }

    let cancelled = false
    // 详情页只读查询本地缓存索引，不触发保存、清理、目录校验或远端访问，避免打开页面产生副作用。
    void mediaLibraryRepository.findCacheBySourceItemId(mediaLibrary.sourceItemId)
      .then((entry: LX.MediaLibrary.MediaCache | null | undefined) => {
        if (!cancelled) setCacheEntry(entry ?? null)
      })
      .catch(() => {
        if (!cancelled) setCacheEntry(null)
      })

    return () => {
      cancelled = true
    }
  }, [mediaLibrary?.sourceItemId])

  const handleBack = useCallback(() => {
    void pop(componentId)
  }, [componentId])

  const handleCopy = useCallback((action: ReturnType<typeof getMusicDetailCopyActions>[number]) => {
    // 页面复制动作复用详情纯函数，保证独立页与旧弹窗复制内容一致。
    const rawText = buildMusicDetailCopyText(action.key, musicInfo)
    const text = typeof rawText == 'string' ? rawText : ''
    if (!text) return
    clipboardWriteText(text)
    toast(t('copy_name_tip'))
  }, [musicInfo, t])

  const handleRescanCurrentMusic = useCallback(() => {
    if (!mediaLibrary || isRescanSubmitting) return
    setRescanSubmitting(true)
    void (async() => {
      try {
        const rules = await mediaLibraryRepository.getImportRules() as LX.MediaLibrary.ImportRule[]
        const rule = findMusicDetailRescanRule({
          mediaLibrary,
          sourceListId,
          lists: userLists,
          rules,
        })
        if (!rule) {
          toast(t('music_detail_rescan_current_song_no_rule'))
          return
        }

        // 详情页只提交后台增量任务，不直接扫描远端、不做删除校验，也不清理缓存。
        await enqueueImportRuleSyncJob({
          connectionId: rule.connectionId,
          ruleId: rule.ruleId,
          previousRule: rule,
          triggerSource: 'manual',
          syncMode: 'incremental',
        })
        toast(t('music_detail_rescan_current_song_queued'))
      } catch {
        toast(t('music_detail_rescan_current_song_failed'))
      } finally {
        setRescanSubmitting(false)
      }
    })()
  }, [isRescanSubmitting, mediaLibrary, sourceListId, t, userLists])

  return (
    <PageContent>
      <StatusBar />
      <View style={{ ...styles.container, backgroundColor: theme['c-content-background'] }}>
        <View style={{ ...styles.header, height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
          <Button style={styles.backButton} onPress={handleBack}>
            <Icon name="chevron-left" size={18} color={theme['c-font']} />
          </Button>
          <Text style={styles.headerTitle} numberOfLines={1} color={theme['c-font']}>{t('music_detail_title')}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title} color={theme['c-font']}>{musicInfo.name}</Text>
          <ArtistEntry componentId={componentId} singer={musicInfo.singer} size={13} textColor={theme['c-font-label']} />
          <View style={styles.copyActionList}>
            {copyActions.map(action => (
              <Button key={action.key} disabled={action.disabled} style={{ ...styles.copyActionButton, backgroundColor: theme['c-button-background'] }} onPress={() => { handleCopy(action) }}>
                <Text color={theme['c-button-font']}>{t(action.label as keyof Message)}</Text>
              </Button>
            ))}
          </View>
          {mediaLibrary ? (
            <Button disabled={isRescanSubmitting} style={{ ...styles.rescanButton, backgroundColor: theme['c-button-background'] }} onPress={handleRescanCurrentMusic}>
              <Text color={theme['c-button-font']}>
                {t(isRescanSubmitting ? 'music_detail_rescan_current_song_submitting' : 'music_detail_rescan_current_song')}
              </Text>
            </Button>
          ) : null}
          {sections.map(section => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionTitle} color={theme['c-font']}>{t(`music_detail_section_${section.key}` as keyof Message)}</Text>
              {section.items.map(item => (
                <View key={`${section.key}_${item.key}`} style={styles.itemRow}>
                  <Text style={styles.itemLabel} color={theme['c-font-label']}>{t(item.label as keyof Message)}</Text>
                  <Text style={styles.itemValue} color={theme['c-font']}>
                    {isTranslateValueKey(item.value) ? t(item.value) : item.value}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
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
  headerTitle: {
    flex: 1,
    paddingRight: 16,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  copyActionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  copyActionButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  rescanButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  itemRow: {
    gap: 4,
  },
  itemLabel: {
    fontWeight: '700',
  },
  itemValue: {
    lineHeight: 18,
  },
})
