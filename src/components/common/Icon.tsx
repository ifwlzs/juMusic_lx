import createIconSetFromIcoMoon from '@react-native-vector-icons/icomoon'
import icoMoonConfig from '@/resources/fonts/selection.json'
import { scaleSizeW } from '@/utils/pixelRatio'
import { memo, type ComponentProps } from 'react'
import { useTextShadow, useTheme } from '@/store/theme/hook'
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native'

// 项目当前只使用自定义 IcoMoon 字体；内置字体族如需重新启用，应按需安装 @react-native-vector-icons/* 独立包。


const IcoMoon = createIconSetFromIcoMoon(icoMoonConfig, 'icomoon', 'icomoon.ttf')


// https://github.com/oblador/react-native-vector-icons/tree/master/packages/icomoon

type IconType = ReturnType<typeof createIconSetFromIcoMoon>

interface IconProps extends Omit<ComponentProps<IconType>, 'style'> {
  style?: StyleProp<TextStyle>
  rawSize?: number
}

export const Icon = memo(({ size = 15, rawSize, color, style, ...props }: IconProps) => {
  const theme = useTheme()
  const textShadow = useTextShadow()
  // 新版 IcoMoon 包的组件 props 类型较宽，这里显式转成 number，避免把上游 any 透传到缩放工具。
  const displaySize = rawSize ?? scaleSizeW(Number(size))
  const newStyle = textShadow ? StyleSheet.compose({
    textShadowColor: theme['c-primary-dark-300-alpha-800'],
    textShadowOffset: { width: 0.2, height: 0.2 },
    textShadowRadius: 2,
  }, style) : style
  return (
    <IcoMoon
      size={displaySize}
      color={color ?? theme['c-font']}
      // @ts-expect-error
      style={newStyle}
      {...props}
    />
  )
})


export {
}
