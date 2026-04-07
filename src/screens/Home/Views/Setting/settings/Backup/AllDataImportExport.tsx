import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { LXM_FILE_EXT_RXP } from '@/config/constant'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { handleExportAllData, handleImportAllData } from './actions'

type ActionType = 'import' | 'export'

export interface AllDataImportExportType {
  import: () => void
  export: () => void
}

export default forwardRef<AllDataImportExportType, {}>((props, ref) => {
  const [visible, setVisible] = useState(false)
  const choosePathRef = useRef<ChoosePathType>(null)
  const actionRef = useRef<ActionType>('import')

  const showPicker = (action: ActionType) => {
    actionRef.current = action
    const show = () => {
      choosePathRef.current?.show({
        title: global.i18n.t(action === 'import' ? 'setting_backup_all_import_desc' : 'setting_backup_all_export_desc'),
        dirOnly: action === 'export',
        filter: LXM_FILE_EXT_RXP,
      })
    }
    if (visible) {
      show()
    } else {
      setVisible(true)
      requestAnimationFrame(show)
    }
  }

  useImperativeHandle(ref, () => ({
    import() {
      showPicker('import')
    },
    export() {
      showPicker('export')
    },
  }))

  const onConfirmPath = (path: string) => {
    switch (actionRef.current) {
      case 'import':
        handleImportAllData(path)
        break
      case 'export':
        handleExportAllData(path)
        break
    }
  }

  return visible
    ? <ChoosePath ref={choosePathRef} onConfirm={onConfirmPath} />
    : null
})
