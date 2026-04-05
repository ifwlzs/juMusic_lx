import { memo, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import Button from '../../../components/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { browseConnection, normalizeImportSelection, normalizePathOrUri } from '@/core/mediaLibrary/browse'
import { getMediaLibraryRuntimeRegistry } from '@/core/mediaLibrary/runtimeRegistry'

const createSelectionFromNode = (node: LX.MediaLibrary.BrowserNode): LX.MediaLibrary.ImportSelection => ({
  selectionId: `${node.kind}__${normalizePathOrUri(node.pathOrUri)}__${Date.now()}`,
  kind: node.kind,
  pathOrUri: node.pathOrUri,
  displayName: node.name,
})

export default memo(({
  connection,
  selection,
  onChange,
  onBack,
}: {
  connection: LX.MediaLibrary.SourceConnection
  selection: Pick<LX.MediaLibrary.ImportRule, 'directories' | 'tracks'>
  onChange: (selection: Pick<LX.MediaLibrary.ImportRule, 'directories' | 'tracks'>) => void
  onBack: () => void
}) => {
  const t = useI18n()
  const [currentPathOrUri, setCurrentPathOrUri] = useState(connection.rootPathOrUri)
  const [nodes, setNodes] = useState<LX.MediaLibrary.BrowserNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const normalizedSelection = useMemo<Pick<LX.MediaLibrary.ImportRule, 'directories' | 'tracks'>>(() => {
    const nextSelection = normalizeImportSelection(selection) as Pick<LX.MediaLibrary.ImportRule, 'directories' | 'tracks'>
    return {
      directories: nextSelection.directories ?? [],
      tracks: nextSelection.tracks ?? [],
    }
  }, [selection])
  const selectedPaths = useMemo(() => {
    return new Set([
      ...normalizedSelection.directories.map(item => normalizePathOrUri(item.pathOrUri)),
      ...normalizedSelection.tracks.map(item => normalizePathOrUri(item.pathOrUri)),
    ])
  }, [normalizedSelection])

  useEffect(() => {
    setCurrentPathOrUri(connection.rootPathOrUri)
  }, [connection.connectionId, connection.rootPathOrUri])

  useEffect(() => {
    let canceled = false
    const load = async() => {
      setLoading(true)
      setError('')
      try {
        const result = await browseConnection(getMediaLibraryRuntimeRegistry(), connection, currentPathOrUri) as LX.MediaLibrary.BrowserNode[]
        if (canceled) return
        setNodes(result)
      } catch (err: any) {
        if (canceled) return
        setNodes([])
        setError(String(err?.message || err))
      } finally {
        if (!canceled) setLoading(false)
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [connection, currentPathOrUri])

  const handleToggle = (node: LX.MediaLibrary.BrowserNode) => {
    const targetPath = normalizePathOrUri(node.pathOrUri)
    const nextSelection = {
      directories: normalizedSelection.directories.filter(item => normalizePathOrUri(item.pathOrUri) !== targetPath),
      tracks: normalizedSelection.tracks.filter(item => normalizePathOrUri(item.pathOrUri) !== targetPath),
    }

    if (!selectedPaths.has(targetPath)) {
      if (node.kind === 'directory') nextSelection.directories.push(createSelectionFromNode(node) as LX.MediaLibrary.ImportDirectorySelection)
      else nextSelection.tracks.push(createSelectionFromNode(node) as LX.MediaLibrary.ImportTrackSelection)
    }

    onChange(normalizeImportSelection(nextSelection) as Pick<LX.MediaLibrary.ImportRule, 'directories' | 'tracks'>)
  }

  const handleGoParent = () => {
    const normalizedPath = normalizePathOrUri(currentPathOrUri)
    if (!normalizedPath || normalizedPath === '/' || normalizedPath === normalizePathOrUri(connection.rootPathOrUri)) return
    const index = normalizedPath.lastIndexOf('/')
    setCurrentPathOrUri(index <= 0 ? '/' : normalizedPath.slice(0, index))
  }

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Button onPress={onBack}>{t('back')}</Button>
        <Button onPress={handleGoParent}>{t('media_source_browser_up')}</Button>
      </View>
      <Text size={12} style={styles.path} numberOfLines={2}>{currentPathOrUri}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? <Text size={12}>{t('list_loading')}</Text> : null}
        {error ? <Text size={12}>{error}</Text> : null}
        {!loading && !error && !nodes.length ? <Text size={12}>{t('media_source_browser_empty')}</Text> : null}
        {nodes.map(node => {
          const selected = selectedPaths.has(normalizePathOrUri(node.pathOrUri))
          return (
            <View key={node.nodeId} style={styles.row}>
              <Pressable style={styles.toggle} onPress={() => { handleToggle(node) }}>
                <Text>{selected ? '[x]' : '[ ]'}</Text>
              </Pressable>
              <Pressable
                style={styles.entry}
                onPress={() => {
                  if (node.kind === 'directory') setCurrentPathOrUri(node.pathOrUri)
                  else handleToggle(node)
                }}
              >
                <Text style={styles.entryName} numberOfLines={1}>{node.name}</Text>
                <Text size={12} style={styles.meta} numberOfLines={1}>
                  {node.kind === 'directory' ? t('media_source_selected_directory') : t('media_source_selected_track')}
                </Text>
              </Pressable>
            </View>
          )
        })}
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
  path: {
    marginBottom: 12,
    flexShrink: 1,
  },
  list: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggle: {
    paddingVertical: 12,
    paddingRight: 10,
  },
  entry: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
  },
  entryName: {
    flexShrink: 1,
    minWidth: 0,
  },
  meta: {
    marginTop: 4,
    flexShrink: 1,
    minWidth: 0,
  },
})
