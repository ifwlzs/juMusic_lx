import { memo, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { signInOneDriveBusiness, signOutOneDriveBusiness, getOneDriveBusinessAccount, type OneDriveBusinessAccount } from '@/utils/nativeModules/oneDriveAuth'
import { createStyle, toast } from '@/utils/tools'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import MediaSourceManagerModal, { type MediaSourceManagerModalType } from './MediaSourceManagerModal'

export default memo(() => {
  const t = useI18n()
  const modalRef = useRef<MediaSourceManagerModalType>(null)
  const [connectionCount, setConnectionCount] = useState(0)
  const [ruleCount, setRuleCount] = useState(0)
  const [oneDriveAccount, setOneDriveAccount] = useState<OneDriveBusinessAccount | null>(null)

  const loadSummary = async() => {
    const [connections, rules] = await Promise.all([
      mediaLibraryRepository.getConnections() as Promise<LX.MediaLibrary.SourceConnection[]>,
      mediaLibraryRepository.getImportRules() as Promise<LX.MediaLibrary.ImportRule[]>,
    ])
    setConnectionCount(connections.length)
    setRuleCount(rules.length)
  }

  const loadOneDriveAccount = async() => {
    setOneDriveAccount(await getOneDriveBusinessAccount())
  }

  const handleOneDriveSignIn = async() => {
    try {
      setOneDriveAccount(await signInOneDriveBusiness())
    } catch (error) {
      toast(String((error as Error | undefined)?.message ?? error))
    }
  }

  const handleOneDriveSignOut = async() => {
    if (!oneDriveAccount) return
    try {
      await signOutOneDriveBusiness()
      setOneDriveAccount(null)
    } catch (error) {
      toast(String((error as Error | undefined)?.message ?? error))
    }
  }

  useEffect(() => {
    void loadSummary()
    void loadOneDriveAccount()
  }, [])

  return (
    <SubTitle title={t('setting_media_sources')}>
      <Text size={12} style={styles.summary}>
        {t('setting_media_sources_summary', { connections: connectionCount, rules: ruleCount })}
      </Text>
      <View style={styles.actions}>
        <Button onPress={() => { modalRef.current?.show() }}>{t('setting_media_sources_manage')}</Button>
      </View>
      <View style={styles.oneDriveSection}>
        <Text>{t('setting_media_sources_onedrive_title')}</Text>
        <Text size={12} style={styles.summary}>
          {oneDriveAccount?.username
            ? t('setting_media_sources_onedrive_signed_in', { username: oneDriveAccount.username })
            : t('setting_media_sources_onedrive_signed_out')}
        </Text>
        {oneDriveAccount?.username ? (
          <Text size={12} style={styles.summary}>
            {t('setting_media_sources_onedrive_ready_to_import')}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button onPress={() => { void handleOneDriveSignIn() }}>{t('setting_media_sources_onedrive_sign_in')}</Button>
          <Button onPress={() => { void handleOneDriveSignOut() }} disabled={!oneDriveAccount}>
            {t('setting_media_sources_onedrive_sign_out')}
          </Button>
        </View>
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
  oneDriveSection: {
    marginBottom: 12,
  },
})
