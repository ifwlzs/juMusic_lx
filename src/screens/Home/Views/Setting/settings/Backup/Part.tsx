import { memo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

// import { gzip, ungzip } from 'pako'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import AllDataImportExport, { type AllDataImportExportType } from './AllDataImportExport'
import ListImportExport, { type ListImportExportType } from './ListImportExport'
import PlayHistoryExport, { type PlayHistoryExportType } from './PlayHistoryExport'


export default memo(() => {
  const t = useI18n()
  const listImportExportRef = useRef<ListImportExportType>(null)
  const allDataImportExportRef = useRef<AllDataImportExportType>(null)
  const playHistoryExportRef = useRef<PlayHistoryExportType>(null)

  return (
    <>
      <SubTitle title={t('setting_backup_part')}>
        <View style={styles.list}>
          <Button onPress={() => listImportExportRef.current?.import()}>{t('setting_backup_part_import_list')}</Button>
          <Button onPress={() => listImportExportRef.current?.export()}>{t('setting_backup_part_export_list')}</Button>
        </View>
      </SubTitle>
      <SubTitle title={t('setting_backup_all')}>
        <View style={styles.list}>
          <Button onPress={() => allDataImportExportRef.current?.import()}>{t('setting_backup_all_import')}</Button>
          <Button onPress={() => allDataImportExportRef.current?.export()}>{t('setting_backup_all_export')}</Button>
        </View>
      </SubTitle>
      <SubTitle title={t('setting_backup_play_history')}>
        <View style={styles.list}>
          <Button onPress={() => playHistoryExportRef.current?.export()}>{t('setting_backup_play_history_export_json')}</Button>
        </View>
      </SubTitle>
      <AllDataImportExport ref={allDataImportExportRef} />
      <ListImportExport ref={listImportExportRef} />
      <PlayHistoryExport ref={playHistoryExportRef} />
    </>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
  },
})
