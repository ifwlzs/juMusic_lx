import { memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { setCurrentAppIcon } from '@/utils/nativeModules/appIcon'
import { toast } from '@/utils/tools'

type AppIconType = LX.AppSetting['common.appIcon']

const Item = ({ id, name, onPress, isActive }: {
  id: AppIconType
  name: string
  onPress: (id: AppIconType) => void
  isActive: boolean
}) => {
  return <CheckBox marginBottom={3} check={isActive} label={name} onChange={() => { onPress(id) }} need />
}

export default memo(() => {
  const t = useI18n()
  const appIcon = useSettingValue('common.appIcon')

  const list = useMemo(() => {
    return [
      { id: 'icon1', name: t('setting_basic_app_icon_icon1') },
      { id: 'icon2', name: t('setting_basic_app_icon_icon2') },
    ] as const
  }, [t])

  const handleSelect = (iconId: AppIconType) => {
    if (iconId == appIcon) return

    void setCurrentAppIcon(iconId).then(() => {
      updateSetting({ 'common.appIcon': iconId })
    }).catch((error: Error) => {
      toast(String(error?.message ?? error))
    })
  }

  return (
    <SubTitle title={t('setting_basic_app_icon')}>
      <View style={styles.list}>
        {
          list.map(({ id, name }) => <Item name={name} id={id} key={id} onPress={handleSelect} isActive={appIcon == id} />)
        }
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
