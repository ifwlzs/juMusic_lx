import { memo, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import MediaSourceManagerModal, { type MediaSourceManagerModalType } from './MediaSourceManagerModal'

export default memo(() => {
  const t = useI18n()
  const modalRef = useRef<MediaSourceManagerModalType>(null)
  const [connectionCount, setConnectionCount] = useState(0)
  const [ruleCount, setRuleCount] = useState(0)

  const loadSummary = async() => {
    const [connections, rules] = await Promise.all([
      mediaLibraryRepository.getConnections() as Promise<LX.MediaLibrary.SourceConnection[]>,
      mediaLibraryRepository.getImportRules() as Promise<LX.MediaLibrary.ImportRule[]>,
    ])
    setConnectionCount(connections.length)
    setRuleCount(rules.length)
  }

  useEffect(() => {
    void loadSummary()
  }, [])

  return (
    <SubTitle title={t('setting_media_sources')}>
      <Text size={12} style={styles.summary}>
        {t('setting_media_sources_summary', { connections: connectionCount, rules: ruleCount })}
      </Text>
      <View style={styles.actions}>
        <Button onPress={() => { modalRef.current?.show() }}>{t('setting_media_sources_manage')}</Button>
      </View>
      <MediaSourceManagerModal ref={modalRef} onUpdated={loadSummary} />
    </SubTitle>
  )
})

const styles = createStyle({
  summary: {
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
  },
})
