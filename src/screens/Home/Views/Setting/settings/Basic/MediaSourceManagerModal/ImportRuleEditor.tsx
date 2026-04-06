import { memo } from 'react'
import { Pressable, ScrollView, TextInput, View } from 'react-native'

import Button from '../../../components/Button'
import Text from '@/components/common/Text'
import { removeImportSelection } from '@/core/mediaLibrary/ruleSelections'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'

export interface MediaSourceRuleDraft extends LX.MediaLibrary.ImportRule {}

export const createEmptyRuleDraft = (connectionId: string): MediaSourceRuleDraft => ({
  ruleId: '',
  connectionId,
  name: '',
  mode: 'merged',
  directories: [],
  tracks: [],
  generatedListIds: [],
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  lastSyncSummary: '',
})

export default memo(({
  draft,
  onChange,
  onOpenBrowser,
  onSave,
  onCancel,
}: {
  draft: MediaSourceRuleDraft
  onChange: (draft: MediaSourceRuleDraft) => void
  onOpenBrowser: () => void
  onSave: () => void
  onCancel: () => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const selectedItems = [
    ...draft.directories.map(item => ({ ...item, kindLabel: t('media_source_selected_directory') })),
    ...draft.tracks.map(item => ({ ...item, kindLabel: t('media_source_selected_track') })),
  ]

  return (
    <View style={styles.container}>
      <Text>{t('media_source_rule_name')}</Text>
      <TextInput
        style={[
          styles.input,
          {
            color: theme['c-font'],
            backgroundColor: theme['c-primary-input-background'],
            borderColor: theme['c-border-background'],
          },
        ]}
        placeholderTextColor={theme['c-primary-dark-100-alpha-600']}
        value={draft.name}
        onChangeText={name => {
          onChange({ ...draft, name })
        }}
      />

      <Text>{t('media_source_rule_mode')}</Text>
      <View style={styles.modeRow}>
        {(['account_all_only', 'per_directory', 'merged'] as const).map(mode => (
          <Pressable
            key={mode}
            style={[
              styles.modeButton,
              {
                backgroundColor: draft.mode === mode ? theme['c-primary-background-active'] : 'transparent',
                borderColor: draft.mode === mode ? theme['c-primary-background-active'] : theme['c-border-background'],
              },
            ]}
            onPress={() => {
              onChange({ ...draft, mode })
            }}
          >
            <Text size={12} color={draft.mode === mode ? theme['c-primary-font-active'] : theme['c-font']}>
              {t(`media_source_mode_${mode}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text size={12} style={styles.summary}>
        {t('media_source_selected_summary', {
          directories: draft.directories.length,
          tracks: draft.tracks.length,
        })}
      </Text>

      <View style={styles.actions}>
        <Button onPress={onOpenBrowser}>{t('media_source_open_browser')}</Button>
      </View>

      <ScrollView contentContainerStyle={styles.selectionList}>
        {selectedItems.length ? selectedItems.map(item => (
          <View key={item.selectionId} style={styles.selectionItem}>
            <View style={styles.selectionHeader}>
              <Text size={12}>{item.kindLabel}</Text>
              <Pressable
                onPress={() => {
                  onChange(removeImportSelection(draft, item.selectionId) as MediaSourceRuleDraft)
                }}
              >
                <Text size={12} color={theme['c-primary-font-active']}>{t('delete')}</Text>
              </Pressable>
            </View>
            <Text size={12} style={styles.selectionPath} numberOfLines={1}>{item.pathOrUri}</Text>
          </View>
        )) : <Text size={12}>{t('media_source_selection_empty')}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Button onPress={onSave}>{t('media_source_save_rule')}</Button>
        <Button onPress={onCancel}>{t('cancel')}</Button>
      </View>
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  input: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 12,
  },
  modeButton: {
    marginRight: 10,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  summary: {
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  selectionList: {
    paddingBottom: 12,
  },
  selectionItem: {
    paddingVertical: 8,
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minWidth: 0,
  },
  selectionPath: {
    marginTop: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 12,
  },
})
