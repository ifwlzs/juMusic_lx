import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import Button from '@/components/common/Button'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { clipboardWriteText, createStyle, toast } from '@/utils/tools'
import {
  buildMusicDetailCopyText,
  buildMusicDetailSections,
  getMusicDetailCopyActions,
} from './buildDetailSections'

export interface MusicDetailModalType {
  show: (musicInfo: LX.Music.MusicInfo) => void
}

const isTranslateValueKey = (value: string) => {
  // 详情分组里的 value 可能仍是 i18n key，UI 层需要在这里兜底翻译，避免把内部 key 直接展示给用户。
  return value.startsWith('music_detail_') || value.startsWith('source_real_')
}

export default forwardRef<MusicDetailModalType, {}>((_props, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const dialogRef = useRef<DialogType>(null)
  // 使用 state 保存当前歌曲，确保重复打开不同歌曲时一定会触发重渲染，避免继续显示上一次内容。
  const [musicInfo, setMusicInfo] = useState<LX.Music.MusicInfo | null>(null)
  // 使用单独的挂载状态延迟创建 Dialog，避免首屏额外渲染，同时保留后续重复打开能力。
  const [visible, setVisible] = useState(false)

  useImperativeHandle(ref, () => ({
    show(musicInfo) {
      // 先刷新当前歌曲，再打开弹窗，这样无论弹窗是否已挂载，歌曲详情文本都会与本次点击保持一致。
      setMusicInfo(musicInfo)
      if (visible) {
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
        return
      }
      setVisible(true)
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }), [visible])

  const sections = useMemo(() => {
    if (!musicInfo) return []
    return buildMusicDetailSections(musicInfo)
  }, [musicInfo])

  const copyActions = useMemo(() => {
    if (!musicInfo) return []
    return getMusicDetailCopyActions(musicInfo)
  }, [musicInfo])

  const handleCopy = useCallback((action: Parameters<typeof buildMusicDetailCopyText>[0]) => {
    if (!musicInfo) return
    // 复制动作统一走纯函数，保证弹窗展示与复制内容来自同一份详情模型，后续扩字段时也不容易分叉。
    const rawText = buildMusicDetailCopyText(action, musicInfo)
    // 这里显式收口成字符串，避免上游类型在全局声明参与下退化成 any 时把不安全值传进原生剪贴板接口。
    const text = typeof rawText == 'string' ? rawText : ''
    if (!text) return
    clipboardWriteText(text)
    toast(t('copy_name_tip'))
  }, [musicInfo, t])

  const handleHide = useCallback(() => {
    // 关闭时保留最近一次歌曲信息即可；下次 show 会先 setState，因此不会影响后续刷新正确性。
  }, [])

  return visible ? (
    <Dialog ref={dialogRef} onHide={handleHide} title={t('music_detail_title') || '歌曲详情'}>
      <View style={styles.container}>
        {/* 任务 3 在最小可见弹窗基础上补齐真正的详情界面，但仍保持只读展示，不提前扩到后续任务的复杂交互。 */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle} size={15}>{t('music_detail_title') || '歌曲详情'}</Text>
            <Text size={13}>{t('music_detail_name')}：{musicInfo?.name ?? '-'}</Text>
            <Text size={13}>{t('music_detail_artist')}：{musicInfo?.singer ?? '-'}</Text>
          </View>

          <View style={styles.copyActionList}>
            {copyActions.map(action => (
              <Button
                key={action.key}
                style={{ ...styles.copyActionButton, backgroundColor: theme['c-button-background'] }}
                disabled={action.disabled}
                onPress={() => { handleCopy(action.key) }}
              >
                {/* 复制动作文案直接消费纯函数返回的 label，保证 UI 与任务 2 的动作契约保持单一事实来源。 */}
                <Text color={theme['c-button-font']} size={13}>{t(action.label)}</Text>
              </Button>
            ))}
          </View>

          {sections.map(section => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionTitle} size={14}>{t(`music_detail_section_${section.key}`)}</Text>
              <View style={styles.sectionBody}>
                {section.items.map(item => (
                  <View key={`${section.key}_${item.key}`} style={styles.itemRow}>
                    <Text style={styles.itemLabel} size={13}>{t(item.label)}</Text>
                    <Text style={styles.itemValue} size={13}>
                      {isTranslateValueKey(item.value) ? t(item.value) : item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Dialog>
  ) : null
})

const styles = createStyle({
  container: {
    minWidth: 300,
    maxWidth: 560,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  summary: {
    gap: 6,
  },
  summaryTitle: {
    fontWeight: 'bold',
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
    fontWeight: 'bold',
  },
  sectionBody: {
    gap: 8,
  },
  itemRow: {
    gap: 4,
  },
  itemLabel: {
    fontWeight: 'bold',
  },
  itemValue: {
    lineHeight: 18,
  },
})
