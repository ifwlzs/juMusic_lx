import { memo, useMemo } from 'react'
import { ScrollView, View } from 'react-native'

import Button from '../../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'

const getProviderLabel = (t: ReturnType<typeof useI18n>, providerType: LX.MediaLibrary.ProviderType) => {
  switch (providerType) {
    case 'local':
      return t('source_real_local')
    case 'webdav':
      return t('source_real_webdav')
    case 'smb':
      return t('source_real_smb')
    default:
      return providerType
  }
}

export default memo(({
  connections,
  rules,
  onAdd,
  onEdit,
  onManageRules,
  onUpdate,
  onDelete,
}: {
  connections: LX.MediaLibrary.SourceConnection[]
  rules: LX.MediaLibrary.ImportRule[]
  onAdd: () => void
  onEdit: (connection: LX.MediaLibrary.SourceConnection) => void
  onManageRules: (connection: LX.MediaLibrary.SourceConnection) => void
  onUpdate: (connection: LX.MediaLibrary.SourceConnection) => void
  onDelete: (connection: LX.MediaLibrary.SourceConnection) => void
}) => {
  const t = useI18n()
  const ruleCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const rule of rules) {
      map.set(rule.connectionId, (map.get(rule.connectionId) ?? 0) + 1)
    }
    return map
  }, [rules])

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Button onPress={onAdd}>{t('media_source_add_account')}</Button>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {connections.length ? connections.map(connection => (
          <View key={connection.connectionId} style={styles.card}>
            <Text>{connection.displayName}</Text>
            <Text size={12} style={styles.meta}>
              {getProviderLabel(t, connection.providerType)} · {connection.rootPathOrUri}
            </Text>
            <Text size={12} style={styles.meta}>
              {t('media_source_rule_count', { count: ruleCountMap.get(connection.connectionId) ?? 0 })}
            </Text>
            <View style={styles.cardActions}>
              <Button onPress={() => { onManageRules(connection) }}>{t('media_source_manage_rules')}</Button>
              <Button onPress={() => { onEdit(connection) }}>{t('media_source_edit_connection')}</Button>
              <Button onPress={() => { onUpdate(connection) }}>{t('media_source_update')}</Button>
              <Button onPress={() => { onDelete(connection) }}>{t('media_source_delete_account')}</Button>
            </View>
          </View>
        )) : <Text size={12}>{t('media_source_no_connections')}</Text>}
      </ScrollView>
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  list: {
    paddingBottom: 12,
  },
  card: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  meta: {
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
})
