import { forwardRef, useImperativeHandle, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import ConnectionList from './ConnectionList'

export interface SourceListsType {
  show: () => void
}

export default forwardRef<SourceListsType>((_, ref) => {
  const [visible, setVisible] = useState(false)

  useImperativeHandle(ref, () => ({
    show() {
      setVisible(true)
    },
  }))

  if (!visible) return null

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => { setVisible(false) }} />
      <View style={styles.panel}>
        <ConnectionList onClose={() => { setVisible(false) }} />
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  panel: {
    flex: 1,
    marginTop: 48,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#101114',
    overflow: 'hidden',
  },
})
