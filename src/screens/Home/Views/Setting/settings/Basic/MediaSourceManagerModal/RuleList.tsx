import { memo } from 'react'
import { ScrollView, View } from 'react-native'

import Button from '../../../components/Button'
import Text from '@/components/common/Text'
import { resolveConnectionDisplayName, resolveRuleDisplayName } from '@/core/mediaLibrary/naming'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { dateFormat2 } from '@/utils'
import { createStyle } from '@/utils/tools'

export default memo(({
  connection,
  rules,
  onBack,
  onAddRule,
  onEditRule,
  onUpdateRule,
  onDeleteRule,
}: {
  connection: LX.MediaLibrary.SourceConnection
  rules: LX.MediaLibrary.ImportRule[]
  onBack: () => void
  onAddRule: () => void
  onEditRule: (rule: LX.MediaLibrary.ImportRule) => void
  onUpdateRule: (rule: LX.MediaLibrary.ImportRule) => void
  onDeleteRule: (rule: LX.MediaLibrary.ImportRule) => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const connectionRules = rules.filter(rule => rule.connectionId === connection.connectionId)
  const getStatusText = (rule: LX.MediaLibrary.ImportRule) => {
    const status = rule.lastSyncStatus ?? 'idle'
    const statusLabel = t(`media_source_sync_state_${status}`)
    const summary = (() => {
      switch (rule.lastSyncSummary) {
        case 'queued':
          return t('media_source_sync_summary_queued')
        case 'running':
          return t('media_source_sync_summary_running')
        case 'paused':
          return t('media_source_sync_summary_paused')
        case 'deleting':
          return t('media_source_sync_summary_deleting')
        case 'success':
          return t('media_source_sync_summary_success')
        default:
          return rule.lastSyncSummary ?? ''
      }
    })()

    return summary ? `${statusLabel} · ${summary}` : statusLabel
  }

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Button onPress={onBack}>{t('back')}</Button>
        <Button onPress={onAddRule}>{t('media_source_add_rule')}</Button>
      </View>
      <Text style={styles.title}>{resolveConnectionDisplayName(connection)}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {connectionRules.length ? connectionRules.map(rule => (
          <View key={rule.ruleId} style={styles.card}>
            <Text>{resolveRuleDisplayName({
              providerType: connection.providerType,
              ruleName: rule.name,
              connectionDisplayName: connection.displayName,
              selectedConnectionId: connection.connectionId,
            })}</Text>
            <Text size={12} style={styles.meta}>{t(`media_source_mode_${rule.mode}`)}</Text>
            <Text size={12} style={styles.meta}>
              {t('media_source_selected_summary', {
                directories: rule.directories.length,
                tracks: rule.tracks.length,
              })}
            </Text>
            <Text size={12} style={styles.meta} color={theme['c-font']}>
              {t('media_source_generated_list_count', { count: rule.generatedListIds?.length ?? 0 })}
            </Text>
            <Text size={12} style={styles.meta} color={theme['c-font']}>
              {t('media_source_last_update', {
                time: rule.lastSyncAt ? dateFormat2(rule.lastSyncAt) : t('media_source_never_updated'),
              })}
            </Text>
            <Text size={12} style={styles.meta} color={theme['c-font']}>{getStatusText(rule)}</Text>
            <View style={styles.cardActions}>
              <Button onPress={() => { onEditRule(rule) }}>{t('media_source_edit_rule')}</Button>
              <Button onPress={() => { onUpdateRule(rule) }}>{t('media_source_update')}</Button>
              <Button onPress={() => { onDeleteRule(rule) }}>{t('media_source_delete_rule')}</Button>
            </View>
          </View>
        )) : <Text size={12}>{t('media_source_no_rules')}</Text>}
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
  title: {
    marginBottom: 10,
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
