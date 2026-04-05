import { TouchableOpacity } from 'react-native'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { scaleSizeW } from '@/utils/pixelRatio'
import { playDetailPalette } from '../../../../palette'

export const BTN_WIDTH = scaleSizeW(36)
export const BTN_ICON_SIZE = 24

export default ({ icon, color, onPress, onLongPress }: {
  icon: string
  color?: string
  onPress: () => void
  onLongPress?: () => void
}) => {
  return (
    <TouchableOpacity style={{ ...styles.cotrolBtn, width: BTN_WIDTH, height: BTN_WIDTH }} activeOpacity={0.5} onPress={onPress} onLongPress={onLongPress}>
      <Icon name={icon} color={color ?? playDetailPalette.SECONDARY_TEXT} size={BTN_ICON_SIZE} />
    </TouchableOpacity>
  )
}

const styles = createStyle({
  cotrolBtn: {
    marginLeft: 5,
    justifyContent: 'center',
    alignItems: 'center',

    // backgroundColor: '#ccc',
    shadowOpacity: 1,
    textShadowRadius: 1,
  },
})
