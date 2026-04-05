import { memo, useRef } from 'react'
import TimeoutExitEditModal, { type TimeoutExitEditModalType, useTimeInfo } from '@/components/TimeoutExitEditModal'
import { useTheme } from '@/store/theme/hook'
import Btn from './Btn'
import { playDetailPalette } from '../../../palette'


export default memo(() => {
  const theme = useTheme()
  const modalRef = useRef<TimeoutExitEditModalType>(null)

  const timeInfo = useTimeInfo()

  const handleShow = () => {
    modalRef.current?.show()
  }

  return (
    <>
      <Btn icon="music_time" color={timeInfo.active ? theme['c-primary-font-active'] : playDetailPalette.SECONDARY_TEXT} onPress={handleShow} />
      <TimeoutExitEditModal ref={modalRef} timeInfo={timeInfo} />
    </>
  )
})
