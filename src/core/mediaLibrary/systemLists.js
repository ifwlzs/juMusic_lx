const { isWithinDirectory, normalizeImportSelection, normalizePathOrUri } = require('./browse.js')
const { resolveConnectionDisplayName, resolveRuleDisplayName } = require('./naming.js')
const { toMediaLibraryMusicInfo } = require('./sourceLists.js')

function dedupeSourceItems(items = []) {
  const map = new Map()
  for (const item of items) {
    if (!item?.sourceItemId) continue
    if (!map.has(item.sourceItemId)) {
      map.set(item.sourceItemId, item)
      continue
    }
    map.set(item.sourceItemId, item)
  }
  return [...map.values()]
}

function encodePathSegment(pathOrUri = '') {
  const normalizedPath = normalizePathOrUri(pathOrUri)
  if (!normalizedPath || normalizedPath === '/') return 'root'
  return encodeURIComponent(normalizedPath)
}

function buildGeneratedListId({ connectionId, kind, ruleId = null, sourcePathOrUri = '' }) {
  switch (kind) {
    case 'account_all':
      return `media__${connectionId}__account_all`
    case 'rule_merged':
      return `media__${connectionId}__${ruleId}__merged`
    case 'rule_singles':
      return `media__${connectionId}__${ruleId}__singles`
    case 'rule_directory':
      return `media__${connectionId}__${ruleId}__directory__${encodePathSegment(sourcePathOrUri)}`
    default:
      throw new Error(`Unknown generated list kind: ${kind}`)
  }
}

function createListInfo({ connection, id, name, kind, ruleId, sourcePathOrUri }) {
  return {
    id,
    name,
    locationUpdateTime: null,
    mediaSource: {
      generated: true,
      readOnly: true,
      connectionId: connection.connectionId,
      ...(ruleId ? { ruleId } : null),
      kind,
      ...(sourcePathOrUri ? { sourcePathOrUri } : null),
    },
  }
}

function createGeneratedList({ connection, items, name, kind, ruleId, sourcePathOrUri }) {
  const id = buildGeneratedListId({
    connectionId: connection.connectionId,
    kind,
    ruleId,
    sourcePathOrUri,
  })

  return {
    listInfo: createListInfo({
      connection,
      id,
      name,
      kind,
      ruleId,
      sourcePathOrUri,
    }),
    list: dedupeSourceItems(items).map(toMediaLibraryMusicInfo),
  }
}

function collectRuleItems(snapshot) {
  return dedupeSourceItems(snapshot?.items || [])
}

function buildAccountAllList(connection, items) {
  return createGeneratedList({
    connection,
    items,
    name: `${resolveConnectionDisplayName(connection)} · 全部媒体`,
    kind: 'account_all',
  })
}

function buildMergedRuleList(connection, rule, items) {
  return createGeneratedList({
    connection,
    items,
    name: resolveRuleDisplayName({
      providerType: connection.providerType,
      ruleName: rule.name,
      connectionDisplayName: connection.displayName,
      selectedConnectionId: connection.connectionId,
    }),
    kind: 'rule_merged',
    ruleId: rule.ruleId,
  })
}

function buildDirectoryRuleLists(connection, rule, snapshot) {
  const selection = normalizeImportSelection(rule)
  const items = collectRuleItems(snapshot)
  const generatedLists = selection.directories.map(directory => {
    const matchedItems = items.filter(item => isWithinDirectory(item.pathOrUri, directory.pathOrUri))
    return createGeneratedList({
      connection,
      items: matchedItems,
      name: directory.displayName,
      kind: 'rule_directory',
      ruleId: rule.ruleId,
      sourcePathOrUri: directory.pathOrUri,
    })
  })

  if (selection.tracks.length) {
    const trackPaths = new Set(selection.tracks.map(track => normalizePathOrUri(track.pathOrUri)))
    generatedLists.push(createGeneratedList({
      connection,
      items: items.filter(item => trackPaths.has(normalizePathOrUri(item.pathOrUri))),
      name: `${resolveRuleDisplayName({
        providerType: connection.providerType,
        ruleName: rule.name,
        connectionDisplayName: connection.displayName,
        selectedConnectionId: connection.connectionId,
      })} · 散选歌曲`,
      kind: 'rule_singles',
      ruleId: rule.ruleId,
    }))
  }

  return generatedLists
}

function buildRuleLists(connection, rule, snapshot) {
  switch (rule.mode) {
    case 'per_directory':
      return buildDirectoryRuleLists(connection, rule, snapshot)
    case 'merged':
      return [buildMergedRuleList(connection, rule, collectRuleItems(snapshot))]
    case 'account_all_only':
    default:
      return []
  }
}

function buildGeneratedListsForConnection({ connection, rules = [], snapshots = new Map() }) {
  const accountAllItems = []
  for (const rule of rules) {
    const items = collectRuleItems(snapshots.get(rule.ruleId))
    accountAllItems.push(...items)
  }

  const generatedLists = [buildAccountAllList(connection, accountAllItems)]

  for (const rule of rules) {
    generatedLists.push(...buildRuleLists(connection, rule, snapshots.get(rule.ruleId)))
  }

  return generatedLists
}

module.exports = {
  buildGeneratedListId,
  buildGeneratedListsForConnection,
}
