import { useTheme } from '@/store/theme/hook'
import { StatusBar as RNStatusBar } from 'react-native'

const StatusBar = function({ forceLightContent = false }: {
  forceLightContent?: boolean
}) {
  const theme = useTheme()
  const statusBarStyle = theme.isDark ? 'light-content' : 'dark-content'
  return <RNStatusBar backgroundColor="rgba(0,0,0,0)" barStyle={forceLightContent ? 'light-content' : statusBarStyle} translucent={true} />
}

StatusBar.currentHeight = RNStatusBar.currentHeight ?? 0
StatusBar.setBarStyle = RNStatusBar.setBarStyle

export default StatusBar
