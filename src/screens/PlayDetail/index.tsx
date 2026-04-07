import { useEffect } from 'react'
// import { View, StyleSheet } from 'react-native'
import { useHorizontalMode } from '@/utils/hooks'

import Vertical from './Vertical'
import Horizontal from './Horizontal'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { useSetting } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const setting = useSetting()
  const theme = useTheme()
  const paletteVersion = [
    theme.isDark ? 'dark' : 'light',
    setting['theme.playDetail.light.primary'],
    setting['theme.playDetail.dark.primary'],
    setting['theme.playDetail.light.lyricActive'],
    setting['theme.playDetail.dark.lyricActive'],
    setting['theme.playDetail.light.lyricInactive'],
    setting['theme.playDetail.dark.lyricInactive'],
    setting['theme.playDetail.light.lyricTranslation'],
    setting['theme.playDetail.dark.lyricTranslation'],
    setting['theme.playDetail.light.lyricRoma'],
    setting['theme.playDetail.dark.lyricRoma'],
  ].join('|')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PageContent backgroundVariant="playDetailEmby">
      <StatusBar forceLightContent />
      {
        isHorizontalMode
          ? <Horizontal key={`horizontal:${paletteVersion}`} componentId={componentId} />
          : <Vertical key={`vertical:${paletteVersion}`} componentId={componentId} />
      }
    </PageContent>
  )
}
