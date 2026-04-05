import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Text from '@/components/common/Text'
import { InteractionManager, View } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import CheckBox from '@/components/common/CheckBox'
import { getListMusics, setFetchingListStatus, updateListMusicPosition } from '@/core/list'
import { getListSortInfo, saveListSortInfo } from '@/utils/data'
import { getDefaultSortType, isGeneratedMediaSourceList, sortListMusicInfo } from '@/utils/musicListSort'

const Title = ({ title }: {
  title: string
}) => {
  return (
    <Text style={styles.title} size={16}>
      {title}
    </Text>
  )
}

type FieldName = LX.List.ListSortField
type FieldType = LX.List.ListSortType

export interface FormType {
  reset: () => void
  setForm: (name?: FieldName, type?: FieldType) => void
  getForm: () => ([FieldName | undefined, FieldType | undefined])
}
const fieldNames = ['name', 'singer', 'album', 'time', 'source', 'update_time', 'file_name'] as const
const fieldTypes = ['up', 'down', 'random'] as const

const CheckBoxItem = <T extends FieldName | FieldType>({ id, isActive, disabled, change }: {
  id: T
  isActive: boolean
  disabled?: boolean
  change: (id: T) => void
}) => {
  const t = useI18n()
  return (
    <CheckBox
      marginBottom={3}
      disabled={disabled}
      check={isActive}
      label={t(`list_sort_modal_by_${id}`)}
      onChange={() => { change(id) }} need />
  )
}

const Form = forwardRef<FormType, { isGeneratedList: boolean }>(({ isGeneratedList }, ref) => {
  const t = useI18n()
  const [name, setName] = useState<FieldName>()
  const [type, setType] = useState<FieldType>()
  const availableFieldTypes = isGeneratedList ? fieldTypes.filter(item => item != 'random') : fieldTypes

  const handleSetName = (id: FieldName) => {
    const prevName = name
    setName(id)
    setType(currentType => {
      if (!currentType) return getDefaultSortType(id)
      if (prevName && currentType == getDefaultSortType(prevName)) return getDefaultSortType(id)
      return currentType
    })
  }

  useImperativeHandle(ref, () => ({
    reset() {
      setName(undefined)
      setType(undefined)
    },
    setForm(nextName, nextType) {
      setName(nextName)
      const normalizedType = isGeneratedList && nextType == 'random'
        ? undefined
        : nextType
      setType(normalizedType ?? (nextName ? getDefaultSortType(nextName) : undefined))
    },
    getForm() {
      return [name, type]
    },
  }))

  return (
    <View>
      <View style={styles.formSection}>
        <Text>{t('list_sort_modal_by_field')}</Text>
        <View style={styles.formList}>
          {fieldNames.map(n => <CheckBoxItem key={n} id={n} isActive={name == n} change={handleSetName} disabled={type == 'random'} />)}
        </View>
      </View>
      <View style={styles.formSection}>
        <Text>{t('list_sort_modal_by_type')}</Text>
        <View style={styles.formList}>
          {availableFieldTypes.map(n => <CheckBoxItem key={n} id={n} isActive={type == n} change={setType} />)}
        </View>
      </View>
    </View>
  )
})

export interface ListMusicSortType {
  show: (listInfo: LX.List.MyListInfo) => void
}
const initSelectInfo = {}

export default forwardRef<ListMusicSortType, {}>((props, ref) => {
  const alertRef = useRef<ConfirmAlertType>(null)
  const [title, setTitle] = useState('')
  const selectedListInfo = useRef<LX.List.MyListInfo>(initSelectInfo as LX.List.MyListInfo)
  const formTypeRef = useRef<FormType>(null)
  const [isGeneratedList, setIsGeneratedList] = useState(false)
  const [visible, setVisible] = useState(false)

  const handleShow = () => {
    alertRef.current?.setVisible(true)
  }

  const syncGeneratedPreference = async(listInfo: LX.List.MyListInfo) => {
    if (!formTypeRef.current) return
    if (!isGeneratedMediaSourceList(listInfo)) {
      formTypeRef.current.reset()
      return
    }
    const preference = await getListSortInfo(listInfo.id) as LX.List.ListSortPreference | null
    if (preference) formTypeRef.current.setForm(preference.field, preference.type)
    else formTypeRef.current.reset()
  }

  useImperativeHandle(ref, () => ({
    show(listInfo) {
      setTitle(listInfo.name)
      selectedListInfo.current = listInfo
      setIsGeneratedList(isGeneratedMediaSourceList(listInfo))
      if (visible) {
        handleShow()
        void syncGeneratedPreference(listInfo)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          handleShow()
          void syncGeneratedPreference(listInfo)
        })
      }
    },
  }))

  const handleSort = async() => {
    const [name, type] = formTypeRef.current!.getForm()
    if (!type || (!name && type != 'random')) return
    const id = selectedListInfo.current.id
    const field = name ?? 'name'
    setFetchingListStatus(id, true)
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(async() => {
        try {
          if (isGeneratedMediaSourceList(selectedListInfo.current)) {
            await saveListSortInfo(id, { field, type })
            await getListMusics(id)
            global.app_event.myListMusicUpdate([id])
            return
          }
          let list = [...(await getListMusics(id))]
          list = sortListMusicInfo(list, type, field, global.i18n.locale)
          await updateListMusicPosition(id, 0, list.map(m => m.id))
        } finally {
          setFetchingListStatus(id, false)
        }
      })
    })

    alertRef.current?.setVisible(false)
  }

  return (
    visible
      ? <ConfirmAlert
          ref={alertRef}
          onConfirm={handleSort}
        >
          <View style={styles.renameContent}>
            <Title title={title} />
            <Form ref={formTypeRef} isGeneratedList={isGeneratedList} />
          </View>
        </ConfirmAlert>
      : null
  )
})


const styles = createStyle({
  renameContent: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
  },
  title: {
    textAlign: 'center',
    paddingBottom: 25,
  },
  formSection: {
    marginBottom: 15,
  },
  formList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
