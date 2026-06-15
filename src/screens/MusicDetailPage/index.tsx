import { useCallback } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import ArtistEntry from '@/screens/PlayDetail/components/ArtistEntry'
import { useI18n } from '@/lang'
import { pop } from '@/navigation'
import { clipboardWriteText, toast } from '@/utils/tools'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
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

const isTranslateValueKey = (value: string) => {
  // 详情模型中的来源和状态值可能是 i18n key，页面层负责转成用户可读文案。
  return value.startsWith('music_detail_') || value.startsWith('source_real_')
}

export default ({ componentId, musicInfo }: MusicDetailPageProps) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const sections = buildMusicDetailSections(musicInfo)
  const copyActions = getMusicDetailCopyActions(musicInfo)

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
                <Text color={theme['c-button-font']}>{t(action.label)}</Text>
              </Button>
            ))}
          </View>
          {sections.map(section => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionTitle} color={theme['c-font']}>{t(`music_detail_section_${section.key}`)}</Text>
              {section.items.map(item => (
                <View key={`${section.key}_${item.key}`} style={styles.itemRow}>
                  <Text style={styles.itemLabel} color={theme['c-font-label']}>{t(item.label)}</Text>
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