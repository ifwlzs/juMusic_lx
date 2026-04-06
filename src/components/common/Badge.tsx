import { memo, useMemo } from 'react'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import Text from './Text'
// const menuItemHeight = 42
// const menuItemWidth = 100

const styles = createStyle({
  text: {
    marginRight: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    fontWeight: '600',
    alignSelf: 'center',
  },
})

export type BadgeType = 'normal' | 'secondary' | 'tertiary'

export default memo(({ type = 'normal', children }: {
  type?: BadgeType
  children: string
}) => {
  const theme = useTheme()
  const colors = useMemo(() => {
    const colors = {
      textColor: theme['c-badge-primary'],
      borderColor: theme['c-badge-primary'],
    }
    switch (type) {
      case 'normal':
        colors.textColor = theme['c-badge-primary']
        colors.borderColor = theme['c-badge-primary']
        break
      case 'secondary':
        colors.textColor = theme['c-badge-secondary']
        colors.borderColor = theme['c-badge-secondary']
        break
      case 'tertiary':
        colors.textColor = theme['c-badge-tertiary']
        colors.borderColor = theme['c-badge-tertiary']
        break
    }
    return colors
  }, [type, theme])

  return <Text style={{ ...styles.text, borderColor: colors.borderColor }} size={9} color={colors.textColor}>{children}</Text>
})

