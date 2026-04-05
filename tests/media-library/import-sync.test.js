const test = require('node:test')
const assert = require('node:assert/strict')

const { buildGeneratedListsForConnection } = require('../../src/core/mediaLibrary/systemLists.js')
const {
  syncImportRule,
  updateImportRule,
  deleteImportRule,
  deleteMediaConnection,
} = require('../../src/core/mediaLibrary/importSync.js')

function createConnection({
  connectionId = 'conn_1',
  providerType = 'local',
  displayName = 'Disk',
  credentialRef = null,
} = {}) {
  return {
    connectionId,
    providerType,
    displayName,
    rootPathOrUri: '/Music',
    credentialRef,
  }
}

function createRule({
  ruleId = 'rule_1',
  connectionId = 'conn_1',
  name = 'Albums',
  mode = 'merged',
  directories = [{
    selectionId: 'dir_1',
    kind: 'directory',
    pathOrUri: '/Albums',
    displayName: 'Albums',
  }],
  tracks = [],
} = {}) {
  return {
    ruleId,
    connectionId,
    name,
    mode,
    directories,
    tracks,
  }
}

function createSourceItem({
  sourceItemId,
  connectionId = 'conn_1',
  providerType = 'local',
  pathOrUri,
  fileName,
  title,
  versionToken,
} = {}) {
  const resolvedPath = pathOrUri || `/${sourceItemId}.mp3`
  const resolvedFileName = fileName || resolvedPath.split('/').at(-1) || `${sourceItemId}.mp3`
  return {
    sourceItemId,
    connectionId,
    providerType,
    sourceUniqueKey: resolvedPath,
    pathOrUri: resolvedPath,
    fileName: resolvedFileName,
    title: title || resolvedFileName.replace(/\.[^.]+$/, ''),
    artist: '',
    album: '',
    durationSec: 180,
    versionToken: versionToken || `v_${sourceItemId}`,
  }
}

test('buildGeneratedListsForConnection creates account-all and per-directory lists', () => {
  const connection = {
    connectionId: 'conn_1',
    providerType: 'local',
    displayName: 'Disk',
  }
  const rules = [{
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'per_directory',
    directories: [{
      selectionId: 'dir_1',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
    tracks: [{
      selectionId: 'track_1',
      kind: 'track',
      pathOrUri: '/Singles/loose.mp3',
      displayName: 'loose.mp3',
    }],
  }]
  const snapshots = new Map([['rule_1', {
    ruleId: 'rule_1',
    scannedAt: 100,
    items: [
      {
        sourceItemId: 'item_1',
        connectionId: 'conn_1',
        providerType: 'local',
        sourceUniqueKey: '/Albums/song.mp3',
        pathOrUri: '/Albums/song.mp3',
        fileName: 'song.mp3',
        title: 'song',
        artist: '',
        album: '',
        durationSec: 180,
        versionToken: 'v1',
      },
      {
        sourceItemId: 'item_2',
        connectionId: 'conn_1',
        providerType: 'local',
        sourceUniqueKey: '/Singles/loose.mp3',
        pathOrUri: '/Singles/loose.mp3',
        fileName: 'loose.mp3',
        title: 'loose',
        artist: '',
        album: '',
        durationSec: 181,
        versionToken: 'v2',
      },
    ],
  }]])

  const lists = buildGeneratedListsForConnection({ connection, rules, snapshots })

  assert.deepEqual(lists.map(item => item.listInfo.mediaSource.kind), [
    'account_all',
    'rule_directory',
    'rule_singles',
  ])
  assert.equal(lists[0].list.length, 2)
  assert.equal(lists[1].list.length, 1)
  assert.equal(lists[2].list.length, 1)
})

test('syncImportRule adds new songs before removing missing songs', async() => {
  const calls = []
  const saved = {
    snapshot: null,
    sourceItems: null,
    aggregateSongs: null,
  }
  const connection = {
    connectionId: 'conn_1',
    providerType: 'local',
    displayName: 'Disk',
  }
  const rule = {
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'merged',
    directories: [{
      selectionId: 'dir_1',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
    tracks: [],
  }

  await syncImportRule({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [{
            sourceItemId: 'old',
            connectionId: 'conn_1',
            providerType: 'local',
            sourceUniqueKey: '/Albums/old.mp3',
            pathOrUri: '/Albums/old.mp3',
            fileName: 'old.mp3',
            title: 'old',
            artist: '',
            album: '',
            durationSec: 180,
            versionToken: 'old',
          }],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs(items) {
        saved.aggregateSongs = items
      },
      async removeImportSnapshots() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return {
              complete: true,
              items: [{
                sourceItemId: 'new',
                connectionId: 'conn_1',
                providerType: 'local',
                sourceUniqueKey: '/Albums/new.mp3',
                pathOrUri: '/Albums/new.mp3',
                fileName: 'new.mp3',
                title: 'new',
                artist: '',
                album: '',
                durationSec: 180,
                versionToken: 'new',
              }],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists.map(item => item.listInfo.id)])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['reconcile', ['media__conn_1__account_all', 'media__conn_1__rule_1__merged']],
    ['remove', ['old']],
  ])
  assert.equal(saved.snapshot.ruleId, 'rule_1')
  assert.deepEqual(saved.sourceItems.items.map(item => item.sourceItemId), ['new'])
  assert.ok(Array.isArray(saved.aggregateSongs))
})

test('syncImportRule keeps previous songs when scan is incomplete', async() => {
  const calls = []
  const saved = {
    snapshot: null,
    sourceItems: null,
  }
  const connection = {
    connectionId: 'conn_1',
    providerType: 'local',
    displayName: 'Disk',
  }
  const rule = {
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'merged',
    directories: [{
      selectionId: 'dir_1',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
    tracks: [],
  }

  await syncImportRule({
    connection,
    rule,
    repository: {
      async getImportSnapshot() {
        return {
          ruleId: 'rule_1',
          scannedAt: 1,
          items: [{
            sourceItemId: 'old',
            connectionId: 'conn_1',
            providerType: 'local',
            sourceUniqueKey: '/Albums/old.mp3',
            pathOrUri: '/Albums/old.mp3',
            fileName: 'old.mp3',
            title: 'old',
            artist: '',
            album: '',
            durationSec: 180,
            versionToken: 'old',
          }],
        }
      },
      async saveImportSnapshot(ruleId, snapshot) {
        saved.snapshot = { ruleId, snapshot }
      },
      async getImportRules() {
        return [rule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
      async removeImportSnapshots() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return {
              complete: false,
              items: [{
                sourceItemId: 'new',
                connectionId: 'conn_1',
                providerType: 'local',
                sourceUniqueKey: '/Albums/new.mp3',
                pathOrUri: '/Albums/new.mp3',
                fileName: 'new.mp3',
                title: 'new',
                artist: '',
                album: '',
                durationSec: 180,
                versionToken: 'new',
              }],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists[1].list.map(item => item.id)])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['reconcile', ['old', 'new']],
  ])
  assert.equal(saved.snapshot, null)
  assert.deepEqual(saved.sourceItems.items.map(item => item.sourceItemId), ['old', 'new'])
})

test('updateImportRule removes truly missing covered songs but keeps scope-removed songs as placeholders', async() => {
  const connection = createConnection()
  const previousRule = createRule({
    directories: [{
      selectionId: 'dir_old',
      kind: 'directory',
      pathOrUri: '/Albums',
      displayName: 'Albums',
    }],
  })
  const nextRule = createRule({
    directories: [{
      selectionId: 'dir_new',
      kind: 'directory',
      pathOrUri: '/Albums/New',
      displayName: 'New',
    }],
  })
  const previousSnapshot = {
    ruleId: 'rule_1',
    scannedAt: 1,
    items: [
      createSourceItem({
        sourceItemId: 'item_scope_removed',
        pathOrUri: '/Albums/Old/song.mp3',
      }),
      createSourceItem({
        sourceItemId: 'item_source_deleted',
        pathOrUri: '/Albums/New/missing.mp3',
      }),
    ],
  }
  const calls = []

  await updateImportRule({
    connection,
    rule: nextRule,
    previousRule,
    repository: {
      async getImportSnapshot() {
        return previousSnapshot
      },
      async saveImportSnapshot() {},
      async getImportRules() {
        return [nextRule]
      },
      async saveImportRules() {},
      async getConnections() {
        return [connection]
      },
      async saveSourceItems() {},
      async getAllSourceItems() {
        return [
          createSourceItem({
            sourceItemId: 'item_keep',
            pathOrUri: '/Albums/New/keep.mp3',
          }),
        ]
      },
      async saveAggregateSongs() {},
    },
    registry: {
      get() {
        return {
          async scanSelection() {
            return {
              complete: true,
              items: [
                createSourceItem({
                  sourceItemId: 'item_keep',
                  pathOrUri: '/Albums/New/keep.mp3',
                }),
              ],
            }
          },
        }
      },
    },
    listApi: {
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists.map(item => item.listInfo.id)])
      },
      async removeMissingSongs(ids) {
        calls.push(['remove', ids])
      },
      async markRuleRemoved(ids) {
        calls.push(['placeholder', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['reconcile', ['media__conn_1__account_all', 'media__conn_1__rule_1__merged']],
    ['remove', ['item_source_deleted']],
    ['placeholder', ['item_scope_removed']],
  ])
})

test('deleteImportRule rebuilds remaining generated lists and keeps uncovered custom references unavailable', async() => {
  const connection = createConnection()
  const rule1 = {
    ...createRule({ ruleId: 'rule_1', name: 'Rule 1' }),
    generatedListIds: ['media__conn_1__rule_1__merged'],
  }
  const rule2 = createRule({ ruleId: 'rule_2', name: 'Rule 2' })
  const snapshots = {
    rule_1: {
      ruleId: 'rule_1',
      scannedAt: 1,
      items: [
        createSourceItem({ sourceItemId: 'item_only_rule_1', pathOrUri: '/Albums/one.mp3' }),
        createSourceItem({ sourceItemId: 'item_shared', pathOrUri: '/Albums/shared.mp3' }),
      ],
    },
    rule_2: {
      ruleId: 'rule_2',
      scannedAt: 1,
      items: [
        createSourceItem({ sourceItemId: 'item_shared', pathOrUri: '/Albums/shared.mp3' }),
        createSourceItem({ sourceItemId: 'item_only_rule_2', pathOrUri: '/Albums/two.mp3' }),
      ],
    },
  }
  const calls = []
  const saved = {
    rules: null,
    sourceItems: null,
    snapshotsRemoved: null,
  }

  await deleteImportRule({
    ruleId: 'rule_1',
    repository: {
      async getConnections() {
        return [connection]
      },
      async getImportRules() {
        return [rule1, rule2]
      },
      async saveImportRules(items) {
        saved.rules = items
      },
      async getImportSnapshot(ruleId) {
        return snapshots[ruleId]
      },
      async removeImportSnapshots(ruleIds) {
        saved.snapshotsRemoved = ruleIds
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return saved.sourceItems?.items || []
      },
      async saveAggregateSongs() {},
    },
    listApi: {
      async removeGeneratedLists(ids) {
        calls.push(['removeLists', ids])
      },
      async reconcileGeneratedLists(generatedLists) {
        calls.push(['reconcile', generatedLists.map(item => item.listInfo.id)])
      },
      async markRuleRemoved(ids) {
        calls.push(['placeholder', ids])
      },
    },
  })

  assert.deepEqual(calls, [
    ['removeLists', ['media__conn_1__rule_1__merged']],
    ['reconcile', ['media__conn_1__account_all', 'media__conn_1__rule_2__merged']],
    ['placeholder', ['item_only_rule_1']],
  ])
  assert.deepEqual(saved.rules.map(item => item.ruleId), ['rule_2'])
  assert.deepEqual(saved.snapshotsRemoved, ['rule_1'])
  assert.deepEqual(saved.sourceItems, {
    connectionId: 'conn_1',
    items: snapshots.rule_2.items,
  })
})

test('deleteMediaConnection removes generated lists and converts custom-list references into placeholders', async() => {
  const connection = createConnection({ credentialRef: 'cred_1' })
  const otherConnection = createConnection({
    connectionId: 'conn_2',
    displayName: 'Backup',
  })
  const rule = createRule()
  const otherRule = createRule({
    ruleId: 'rule_2',
    connectionId: 'conn_2',
    name: 'Keep',
  })
  const effects = []
  const saved = {
    connections: null,
    rules: null,
    sourceItems: null,
    snapshotsRemoved: null,
    removedCredential: null,
  }

  await deleteMediaConnection({
    connectionId: 'conn_1',
    repository: {
      async getConnections() {
        return [connection, otherConnection]
      },
      async saveConnections(items) {
        saved.connections = items
      },
      async getImportRules() {
        return [rule, otherRule]
      },
      async saveImportRules(items) {
        saved.rules = items
      },
      async getImportSnapshot(ruleId) {
        if (ruleId === 'rule_1') {
          return {
            ruleId,
            scannedAt: 1,
            items: [createSourceItem({ sourceItemId: 'item_1', pathOrUri: '/Albums/a.mp3' })],
          }
        }
        return {
          ruleId,
          scannedAt: 1,
          items: [createSourceItem({
            sourceItemId: 'item_other',
            connectionId: 'conn_2',
            pathOrUri: '/Other/b.mp3',
          })],
        }
      },
      async removeImportSnapshots(ruleIds) {
        saved.snapshotsRemoved = ruleIds
      },
      async saveSourceItems(connectionId, items) {
        saved.sourceItems = { connectionId, items }
      },
      async getAllSourceItems() {
        return [createSourceItem({
          sourceItemId: 'item_other',
          connectionId: 'conn_2',
          pathOrUri: '/Other/b.mp3',
        })]
      },
      async saveAggregateSongs() {},
      async removeCredential(credentialRef) {
        saved.removedCredential = credentialRef
      },
    },
    listApi: {
      async removeGeneratedLists(ids) {
        effects.push(['removeLists', ids])
      },
      async markConnectionRemoved(ids) {
        effects.push(['placeholder', ids])
      },
    },
  })

  assert.deepEqual(effects, [
    ['removeLists', ['media__conn_1__account_all', 'media__conn_1__rule_1__merged']],
    ['placeholder', ['item_1']],
  ])
  assert.deepEqual(saved.connections.map(item => item.connectionId), ['conn_2'])
  assert.deepEqual(saved.rules.map(item => item.ruleId), ['rule_2'])
  assert.deepEqual(saved.snapshotsRemoved, ['rule_1'])
  assert.deepEqual(saved.sourceItems, {
    connectionId: 'conn_1',
    items: [],
  })
  assert.equal(saved.removedCredential, 'cred_1')
})
