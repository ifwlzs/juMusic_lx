import { memo, useMemo } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { useLrcPlay } from '@/plugins/lyric'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { setSpText } from '@/utils/pixelRatio'
import { AnimatedColorText } from '@/components/common/Text'
import { playDetailPalette } from '../palette'

interface Props {
  /** 点击后切到歌词页；不传则不可点击 */
  onPress?: () => void
}

/**
 * 封面页下方的单行歌词。
 *
 * 中文注释：封面页原本完全没有歌词，必须右滑到第二页才能看。这里补一行当前歌词，
 * 让「看着封面听歌」也能跟上词。只显示当前一句，文字过长时才折成第二行，
 * 所以高度会在一到两行之间浮动——这是刻意的，固定两行会让短句下方留出空洞。
 *
 * 数据直接取 useLrcPlay 的当前行，与歌词页、桌面歌词共用同一个播放钩子，
 * 不需要额外的时间轴计算，也不会和歌词页的滚动状态互相干扰。
 */
export default memo(({ onPress }: Props) => {
  const { text } = useLrcPlay()
  const lrcFontSize = useSettingValue('playDetail.vertical.style.lrcFontSize')

  // 中文注释：比歌词页正文略小。这一行是辅助信息，不该抢封面的视觉重心。
  const size = (lrcFontSize / 10) * 0.86
  const lineHeight = setSpText(size) * 1.34

  const textStyle = useMemo(() => ({
    ...styles.text,
    lineHeight,
  }), [lineHeight])

  // 中文注释：容器固定为两行高度，不随实际行数伸缩。
  // 歌词在布局流里，行数从 1 变 2 会改变容器高度，外层 justifyContent: center
  // 会重新居中全部内容，表现就是封面随每句歌词的长短上下跳动。
  // 锁定高度后短句在两行空间内居中显示，封面位置始终不动。
  const containerStyle = useMemo(() => ({
    ...styles.container,
    height: lineHeight * 2,
  }), [lineHeight])

  // 中文注释：没有歌词（纯音乐、歌词未加载）时也要保留占位，
  // 否则歌词一出现就会把封面顶上去，等于换一种方式跳动。
  if (!text) return <View style={containerStyle} />

  const content = (
    <AnimatedColorText
      style={textStyle}
      textBreakStrategy="simple"
      numberOfLines={2}
      ellipsizeMode="tail"
      color={playDetailPalette.LYRIC_ACTIVE_TEXT}
      size={size}
    >
      {text}
    </AnimatedColorText>
  )

  if (!onPress) return <View style={containerStyle}>{content}</View>

  return (
    <TouchableOpacity style={containerStyle} activeOpacity={0.7} onPress={onPress}>
      {content}
    </TouchableOpacity>
  )
})

const styles = createStyle({
  container: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 24,
    // 中文注释：给两行留出余量，但不写死高度，让短句只占一行的位置。
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
  },
})
