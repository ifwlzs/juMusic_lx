import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

export interface MusicDetailModalType {
  show: (musicInfo: LX.Music.MusicInfo) => void
}

export default forwardRef<MusicDetailModalType, {}>((_props, ref) => {
  const t = useI18n()
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

  return visible ? (
    <Dialog ref={dialogRef} title={t('music_source_detail') || '歌曲详情'}>
      <View style={styles.content}>
        {/* 任务 1 只提供最小可见弹窗，用基础只读信息证明分流已经接到真实歌曲详情界面。 */}
        <Text style={styles.label} size={14}>{t('music_source_detail') || '歌曲详情'}</Text>
        <Text size={13}>歌名：{musicInfo?.name ?? '-'}</Text>
        <Text size={13}>歌手：{musicInfo?.singer ?? '-'}</Text>
      </View>
    </Dialog>
  ) : null
})

const styles = createStyle({
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    minWidth: 280,
  },
  label: {
    fontWeight: 'bold',
  },
})
