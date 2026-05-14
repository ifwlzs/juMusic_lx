import { forwardRef, useImperativeHandle } from 'react'

export interface MusicDetailModalType {
  show: (musicInfo: LX.Music.MusicInfo) => void
}

export default forwardRef<MusicDetailModalType, {}>((props, ref) => {
  useImperativeHandle(ref, () => ({
    show(_musicInfo) {
      // 这里先保留最小占位接线，后续任务再补齐媒体库歌曲详情弹窗 UI。
    },
  }))

  return null
})
