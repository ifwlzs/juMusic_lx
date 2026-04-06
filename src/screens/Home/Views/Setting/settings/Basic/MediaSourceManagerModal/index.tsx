import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import {
  createUserList,
  getListMusics,
  getUserLists,
  overwriteListMusics,
  removeListMusics,
  removeUserList,
  updateListMusics,
  updateUserList,
  updateUserListPosition,
} from '@/core/list'
import { normalizeImportSelection } from '@/core/mediaLibrary/browse'
import { validateConnectionDraft } from '@/core/mediaLibrary/connectionValidation'
import { createMediaLibraryListApi } from '@/core/mediaLibrary/listApi'
import { resolveConnectionDisplayName, resolveRuleDisplayName } from '@/core/mediaLibrary/naming'
import { enqueueDeleteImportRuleJob, enqueueImportRuleSyncJob } from '@/core/mediaLibrary/jobQueue'
import {
  deleteMediaConnection,
  updateMediaConnection,
} from '@/core/mediaLibrary/importSync'
import { getMediaLibraryRuntimeRegistry } from '@/core/mediaLibrary/runtimeRegistry'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { useI18n } from '@/lang'
import { confirmDialog, toast } from '@/utils/tools'
import AccountList from './AccountList'
import ConnectionForm, { createEmptyConnectionDraft, type MediaSourceConnectionDraft } from './ConnectionForm'
import RuleList from './RuleList'
import ImportRuleEditor, { createEmptyRuleDraft, type MediaSourceRuleDraft } from './ImportRuleEditor'
import DirectoryBrowser from './DirectoryBrowser'

type Page = 'accounts' | 'connection' | 'rules' | 'editor' | 'browser'

export interface MediaSourceManagerShowOptions {
  connectionId?: string | null
  ruleId?: string | null
}

export interface MediaSourceManagerModalType {
  show: (options?: MediaSourceManagerShowOptions) => void
}

function upsertById<T extends { connectionId?: string, ruleId?: string }>(items: T[], nextItem: T, key: 'connectionId' | 'ruleId') {
  let matched = false
  const nextItems = items.map(item => {
    if (item[key] !== nextItem[key]) return item
    matched = true
    return nextItem
  })
  if (!matched) nextItems.push(nextItem)
  return nextItems
}

export default forwardRef<MediaSourceManagerModalType, { onUpdated?: () => void | Promise<void> }>(({ onUpdated }, ref) => {
  const t = useI18n()
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [page, setPage] = useState<Page>('accounts')
  const [connections, setConnections] = useState<LX.MediaLibrary.SourceConnection[]>([])
  const [rules, setRules] = useState<LX.MediaLibrary.ImportRule[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [connectionDraft, setConnectionDraft] = useState<MediaSourceConnectionDraft>(createEmptyConnectionDraft())
  const [ruleDraft, setRuleDraft] = useState<MediaSourceRuleDraft>(createEmptyRuleDraft(''))
  const listApi = useMemo(() => createMediaLibraryListApi({
    createUserList,
    getListMusics,
    getUserLists,
    overwriteListMusics,
    removeListMusics,
    removeUserList,
    updateListMusics,
    updateUserList,
    updateUserListPosition,
  }), [])

  const handleActionError = (error: unknown) => {
    toast(String((error as Error | undefined)?.message ?? error ?? t('media_source_action_failed')))
  }

  const loadData = async() => {
    const [nextConnections, nextRules] = await Promise.all([
      mediaLibraryRepository.getConnections() as Promise<LX.MediaLibrary.SourceConnection[]>,
      mediaLibraryRepository.getImportRules() as Promise<LX.MediaLibrary.ImportRule[]>,
    ])
    setConnections(nextConnections)
    setRules(nextRules)
    return {
      connections: nextConnections,
      rules: nextRules,
    }
  }

  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => {
      void loadData().catch(() => null)
    }, 1500)
    return () => {
      clearInterval(timer)
    }
  }, [visible])

  const applyShowOptions = ({
    options,
    nextConnections,
    nextRules,
  }: {
    options?: MediaSourceManagerShowOptions
    nextConnections: LX.MediaLibrary.SourceConnection[]
    nextRules: LX.MediaLibrary.ImportRule[]
  }) => {
    const targetConnectionId = options?.connectionId ?? null
    const targetRule = options?.ruleId
      ? nextRules.find(rule => rule.ruleId === options.ruleId) ?? null
      : null
    const targetConnection = nextConnections.find(connection => {
      return connection.connectionId === (targetRule?.connectionId ?? targetConnectionId)
    }) ?? null

    if (targetConnection) {
      setSelectedConnectionId(targetConnection.connectionId)
    } else {
      setSelectedConnectionId(null)
    }

    if (targetRule && targetConnection) {
      setRuleDraft({
        ...createEmptyRuleDraft(targetConnection.connectionId),
        ...targetRule,
      } as MediaSourceRuleDraft)
      setPage('editor')
      return
    }

    if (targetConnection) {
      setPage('rules')
      return
    }

    setPage('accounts')
  }

  const showDialog = (options?: MediaSourceManagerShowOptions) => {
    dialogRef.current?.setVisible(true)
    void loadData().then(({ connections, rules }) => {
      applyShowOptions({
        options,
        nextConnections: connections,
        nextRules: rules,
      })
    })
  }

  useImperativeHandle(ref, () => ({
    show(options) {
      if (visible) showDialog(options)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          showDialog(options)
        })
      }
    },
  }))

  const currentConnection = useMemo(() => {
    return connections.find(item => item.connectionId === selectedConnectionId) ?? null
  }, [connections, selectedConnectionId])

  const handleSaveConnection = async(draft: MediaSourceConnectionDraft) => {
    const prevConnections = await mediaLibraryRepository.getConnections() as LX.MediaLibrary.SourceConnection[]
    const existingConnection = prevConnections.find(item => item.connectionId === draft.connectionId)
    const nextConnectionId = draft.connectionId?.trim() ? draft.connectionId : `media_connection__${Date.now()}`
    const credential = draft.credentials ?? {}
    const hasCredential = Object.values(credential).some(value => value != null && String(value).trim())
    let credentialRef = existingConnection?.credentialRef ?? null

    if (hasCredential) {
      credentialRef ??= `media_credential__${nextConnectionId}`
      await mediaLibraryRepository.saveCredential(credentialRef, credential)
    } else if (credentialRef) {
      await mediaLibraryRepository.removeCredential(credentialRef)
      credentialRef = null
    }

    const nextDisplayName = draft.displayName.trim()
      ? draft.displayName
      : resolveConnectionDisplayName({
        providerType: draft.providerType,
        displayName: draft.displayName,
        rootPathOrUri: draft.providerType === 'onedrive' ? '/' : draft.rootPathOrUri,
        credential,
        connectionId: nextConnectionId,
      })

    await mediaLibraryRepository.saveConnections(upsertById(prevConnections, {
      ...existingConnection,
      connectionId: nextConnectionId,
      providerType: draft.providerType,
      displayName: nextDisplayName,
      rootPathOrUri: draft.providerType === 'onedrive' ? '/' : draft.rootPathOrUri,
      credentialRef,
    }, 'connectionId'))

    await loadData()
    await onUpdated?.()
    setSelectedConnectionId(nextConnectionId)
    setPage('rules')
  }

  const handleValidateConnection = async(draft: MediaSourceConnectionDraft) => {
    await validateConnectionDraft(draft)
  }

  const handleSaveRule = async() => {
    if (!selectedConnectionId || !currentConnection) return
    const prevRules = await mediaLibraryRepository.getImportRules() as LX.MediaLibrary.ImportRule[]
    const previousRule = prevRules.find(item => item.ruleId === ruleDraft.ruleId) ?? null
    const connectionCredential = currentConnection.credentialRef
      ? await mediaLibraryRepository.getCredential(currentConnection.credentialRef) as LX.MediaLibrary.ConnectionCredential | null
      : null
    const nextRule = {
      ...ruleDraft,
      ruleId: ruleDraft.ruleId?.trim() ? ruleDraft.ruleId : `media_rule__${Date.now()}`,
      connectionId: selectedConnectionId,
      name: resolveRuleDisplayName({
        providerType: currentConnection.providerType,
        ruleName: ruleDraft.name,
        connectionDisplayName: currentConnection.displayName,
        connectionCredential,
        selectedConnectionId,
      }),
      lastSyncStatus: 'running',
      lastSyncSummary: 'queued',
      ...normalizeImportSelection(ruleDraft),
    }
    await mediaLibraryRepository.saveImportRules(upsertById(prevRules, nextRule, 'ruleId'))
    await enqueueImportRuleSyncJob({
      connectionId: currentConnection.connectionId,
      ruleId: nextRule.ruleId,
      previousRule,
    })
    await loadData()
    await onUpdated?.()
    setRuleDraft(createEmptyRuleDraft(selectedConnectionId))
    setPage('rules')
    toast(t('media_source_job_queued'))
  }

  const handleUpdateConnection = async(connection: LX.MediaLibrary.SourceConnection) => {
    try {
      const connectionRules = rules.filter(rule => rule.connectionId === connection.connectionId)
      if (connectionRules.length) {
        await Promise.all(connectionRules.map(async rule => enqueueImportRuleSyncJob({
          connectionId: connection.connectionId,
          ruleId: rule.ruleId,
          previousRule: rule,
        })))
        await loadData()
        await onUpdated?.()
        toast(t('media_source_job_queued'))
        return
      }

      await updateMediaConnection({
        connection,
        repository: mediaLibraryRepository,
        registry: getMediaLibraryRuntimeRegistry(),
        listApi,
      })
      await loadData()
      await onUpdated?.()
      toast(t('media_source_update_success'))
    } catch (error) {
      handleActionError(error)
    }
  }

  const handleDeleteConnection = async(connection: LX.MediaLibrary.SourceConnection) => {
    const isConfirmed = await confirmDialog({
      message: t('media_source_delete_account_confirm', { name: connection.displayName }),
      confirmButtonText: t('media_source_delete_account'),
    })
    if (!isConfirmed) return

    try {
      await deleteMediaConnection({
        connectionId: connection.connectionId,
        repository: mediaLibraryRepository,
        listApi,
      })
      await loadData()
      await onUpdated?.()
      if (selectedConnectionId === connection.connectionId) {
        setSelectedConnectionId(null)
        setPage('accounts')
      }
      toast(t('media_source_delete_success'))
    } catch (error) {
      handleActionError(error)
    }
  }

  const handleUpdateRule = async(rule: LX.MediaLibrary.ImportRule) => {
    if (!currentConnection) return
    try {
      await enqueueImportRuleSyncJob({
        connectionId: currentConnection.connectionId,
        ruleId: rule.ruleId,
        previousRule: rule,
      })
      await loadData()
      await onUpdated?.()
      toast(t('media_source_job_queued'))
    } catch (error) {
      handleActionError(error)
    }
  }

  const handleDeleteRule = async(rule: LX.MediaLibrary.ImportRule) => {
    const isConfirmed = await confirmDialog({
      message: t('media_source_delete_rule_confirm', { name: rule.name }),
      confirmButtonText: t('media_source_delete_rule'),
    })
    if (!isConfirmed) return

    try {
      await enqueueDeleteImportRuleJob({
        connectionId: rule.connectionId,
        ruleId: rule.ruleId,
      })
      await loadData()
      await onUpdated?.()
      toast(t('media_source_job_queued'))
    } catch (error) {
      handleActionError(error)
    }
  }

  const title = (() => {
    switch (page) {
      case 'connection':
        return t('media_source_edit_connection')
      case 'rules':
        return t('media_source_rules')
      case 'editor':
        return t('media_source_edit_rule')
      case 'browser':
        return t('media_source_directory_browser')
      case 'accounts':
      default:
        return t('media_source_manager_title')
    }
  })()

  return visible ? (
    <Dialog
      ref={dialogRef}
      bgHide={false}
      height="88%"
      title={title}
      onHide={() => {
        setVisible(false)
        setPage('accounts')
        setSelectedConnectionId(null)
      }}
    >
      {page === 'accounts' ? (
        <AccountList
          connections={connections}
          rules={rules}
          onAdd={() => {
            setConnectionDraft(createEmptyConnectionDraft())
            setPage('connection')
          }}
          onEdit={async connection => {
            const credential = connection.credentialRef
              ? await mediaLibraryRepository.getCredential(connection.credentialRef) as LX.MediaLibrary.ConnectionCredential | null
              : null
            setConnectionDraft({
              connectionId: connection.connectionId,
              providerType: connection.providerType,
              displayName: connection.displayName,
              rootPathOrUri: connection.rootPathOrUri,
              credentials: credential ?? {},
            })
            setPage('connection')
          }}
          onManageRules={connection => {
            setSelectedConnectionId(connection.connectionId)
            setPage('rules')
          }}
          onUpdate={connection => { void handleUpdateConnection(connection) }}
          onDelete={connection => { void handleDeleteConnection(connection) }}
        />
      ) : null}

      {page === 'connection' ? (
        <ConnectionForm
          draft={connectionDraft}
          onValidate={handleValidateConnection}
          onSubmit={draft => { void handleSaveConnection(draft) }}
          onCancel={() => { setPage(selectedConnectionId ? 'rules' : 'accounts') }}
        />
      ) : null}

      {page === 'rules' && currentConnection ? (
        <RuleList
          connection={currentConnection}
          rules={rules}
          onBack={() => {
            setSelectedConnectionId(null)
            setPage('accounts')
          }}
          onAddRule={() => {
            setRuleDraft(createEmptyRuleDraft(currentConnection.connectionId))
            setPage('editor')
          }}
          onEditRule={rule => {
            setRuleDraft(rule as MediaSourceRuleDraft)
            setPage('editor')
          }}
          onUpdateRule={rule => { void handleUpdateRule(rule) }}
          onDeleteRule={rule => { void handleDeleteRule(rule) }}
        />
      ) : null}

      {page === 'editor' && currentConnection ? (
        <ImportRuleEditor
          draft={ruleDraft}
          onChange={setRuleDraft}
          onOpenBrowser={() => { setPage('browser') }}
          onSave={() => {
            void handleSaveRule().catch(handleActionError)
          }}
          onCancel={() => { setPage('rules') }}
        />
      ) : null}

      {page === 'browser' && currentConnection ? (
        <DirectoryBrowser
          connection={currentConnection}
          selection={ruleDraft}
          onChange={selection => {
            setRuleDraft(prev => ({ ...prev, ...selection }))
          }}
          onBack={() => { setPage('editor') }}
        />
      ) : null}
    </Dialog>
  ) : null
})
