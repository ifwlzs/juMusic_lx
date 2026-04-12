const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createMediaLibraryRepository } = require('../../src/core/mediaLibrary/repository.js')
const {
  createMediaSourceBackupPayload,
  restoreMediaSourceBackupPayload,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/mediaSourceBackup.js')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const createMemoryStorage = () => {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

test('media source backup exports credentials, connections, rules, snapshots, source items, aggregate songs, play stats, and play history', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveConnections([{
    connectionId: 'conn_1',
    providerType: 'webdav',
    displayName: 'NAS',
    rootPathOrUri: '/Music',
    credentialRef: 'cred_1',
  }])
  await repo.saveCredential('cred_1', {
    username: 'admin',
    password: 'secret',
  })
  await repo.saveImportRules([{
    ruleId: 'rule_1',
    connectionId: 'conn_1',
    name: 'Albums',
    mode: 'merged',
    directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Albums', displayName: 'Albums' }],
    tracks: [],
  }])
  await repo.saveImportSnapshot('rule_1', {
    ruleId: 'rule_1',
    scannedAt: 100,
    items: [{ sourceItemId: 'item_1', pathOrUri: '/Albums/song.mp3' }],
  })
  await repo.saveSyncSnapshot('rule_1', {
    ruleId: 'rule_1',
    capturedAt: 120,
    items: [{ sourceStableKey: 'webdav::/Albums/song.mp3', versionToken: 'v1', pathOrUri: '/Albums/song.mp3' }],
  })
  await repo.saveSourceItems('conn_1', [{
    sourceItemId: 'item_1',
    connectionId: 'conn_1',
    providerType: 'webdav',
    sourceUniqueKey: 'webdav::/Albums/song.mp3',
    pathOrUri: '/Albums/song.mp3',
    fileName: 'song.mp3',
    versionToken: 'v1',
  }])
  await repo.saveAggregateSongs([{
    aggregateSongId: 'agg_1',
    canonicalTitle: 'Song',
    canonicalArtist: 'Singer',
    canonicalAlbum: 'Album',
    canonicalDurationSec: 180,
    preferredSourceItemId: 'item_1',
    sourceCount: 1,
    preferredSource: 'webdav',
    sourceItemIds: ['item_1'],
  }])
  await repo.savePlayStats([{
    aggregateSongId: 'agg_1',
    lastSourceItemId: 'item_1',
    playCount: 3,
    playDurationTotalSec: 540,
    lastPlayedAt: 123456789,
  }])
  await repo.savePlayHistory([{
    aggregateSongId: 'agg_1',
    sourceItemId: 'item_1',
    startedAt: 123456000,
    endedAt: 123456789,
    listenedSec: 540,
    durationSec: 600,
    countedPlay: true,
  }])

  const payload = await createMediaSourceBackupPayload(repo)

  assert.equal(payload.connections[0].connectionId, 'conn_1')
  assert.equal(payload.credentials.cred_1.username, 'admin')
  assert.equal(payload.importRules[0].ruleId, 'rule_1')
  assert.equal(payload.importSnapshots.rule_1.items[0].sourceItemId, 'item_1')
  assert.equal(payload.syncSnapshots.rule_1.items[0].sourceStableKey, 'webdav::/Albums/song.mp3')
  assert.equal(payload.sourceItems.conn_1[0].sourceItemId, 'item_1')
  assert.equal(payload.aggregateSongs[0].aggregateSongId, 'agg_1')
  assert.equal(payload.playStats[0].aggregateSongId, 'agg_1')
  assert.equal(payload.playStats[0].playCount, 3)
  assert.equal(payload.playHistory[0].aggregateSongId, 'agg_1')
  assert.equal(payload.playHistory[0].countedPlay, true)
})

test('restoreMediaSourceBackupPayload replaces removed media source state', async() => {
  const repo = createMediaLibraryRepository(createMemoryStorage())

  await repo.saveConnections([{
    connectionId: 'old_conn',
    providerType: 'smb',
    displayName: 'Old',
    rootPathOrUri: '/Old',
    credentialRef: 'old_cred',
  }])
  await repo.saveCredential('old_cred', { username: 'old' })
  await repo.saveImportRules([{
    ruleId: 'old_rule',
    connectionId: 'old_conn',
    name: 'Old Rule',
    mode: 'merged',
    directories: [],
    tracks: [],
  }])
  await repo.saveImportSnapshot('old_rule', {
    ruleId: 'old_rule',
    scannedAt: 10,
    items: [{ sourceItemId: 'old_item', pathOrUri: '/Old/song.mp3' }],
  })
  await repo.saveSyncSnapshot('old_rule', {
    ruleId: 'old_rule',
    capturedAt: 15,
    items: [{ sourceStableKey: 'smb::old', versionToken: 'old_v', pathOrUri: '/Old/song.mp3' }],
  })
  await repo.saveSourceItems('old_conn', [{
    sourceItemId: 'old_item',
    connectionId: 'old_conn',
    providerType: 'smb',
    sourceUniqueKey: 'smb::old',
    pathOrUri: '/Old/song.mp3',
    versionToken: 'old_v',
  }])
  await repo.saveAggregateSongs([{
    aggregateSongId: 'old_agg',
    canonicalTitle: 'Old Song',
    canonicalArtist: 'Old Artist',
    canonicalAlbum: '',
    canonicalDurationSec: 120,
    preferredSourceItemId: 'old_item',
    sourceCount: 1,
  }])
  await repo.savePlayStats([{
    aggregateSongId: 'old_agg',
    lastSourceItemId: 'old_item',
    playCount: 7,
    playDurationTotalSec: 888,
    lastPlayedAt: 99,
  }])
  await repo.savePlayHistory([{
    aggregateSongId: 'old_agg',
    sourceItemId: 'old_item',
    startedAt: 10,
    endedAt: 99,
    listenedSec: 888,
    durationSec: 999,
    countedPlay: false,
  }])

  await restoreMediaSourceBackupPayload(repo, {
    version: 1,
    connections: [{
      connectionId: 'conn_1',
      providerType: 'onedrive',
      displayName: 'OneDrive',
      rootPathOrUri: '/',
      credentialRef: 'cred_1',
    }],
    credentials: {
      cred_1: {
        accountId: 'account_1',
        authority: 'https://login.microsoftonline.com/common',
      },
    },
    importRules: [{
      ruleId: 'rule_1',
      connectionId: 'conn_1',
      name: 'Shared Music',
      mode: 'account_all_only',
      directories: [],
      tracks: [],
    }],
    importSnapshots: {
      rule_1: {
        ruleId: 'rule_1',
        scannedAt: 200,
        items: [{ sourceItemId: 'item_1', pathOrUri: '/Music/song.mp3' }],
      },
    },
    syncSnapshots: {
      rule_1: {
        ruleId: 'rule_1',
        capturedAt: 220,
        items: [{ sourceStableKey: 'onedrive::item_1', versionToken: 'v1', pathOrUri: '/Music/song.mp3' }],
      },
    },
    sourceItems: {
      conn_1: [{
        sourceItemId: 'item_1',
        connectionId: 'conn_1',
        providerType: 'onedrive',
        sourceUniqueKey: 'onedrive::item_1',
        pathOrUri: '/Music/song.mp3',
        versionToken: 'v1',
      }],
    },
    aggregateSongs: [{
      aggregateSongId: 'agg_1',
      canonicalTitle: 'Song',
      canonicalArtist: 'Singer',
      canonicalAlbum: '',
      canonicalDurationSec: 240,
      preferredSourceItemId: 'item_1',
      sourceCount: 1,
      preferredSource: 'onedrive',
      sourceItemIds: ['item_1'],
    }],
    playStats: [{
      aggregateSongId: 'agg_1',
      lastSourceItemId: 'item_1',
      playCount: 5,
      playDurationTotalSec: 600,
      lastPlayedAt: 200,
    }],
    playHistory: [{
      aggregateSongId: 'agg_1',
      sourceItemId: 'item_1',
      startedAt: 150,
      endedAt: 200,
      listenedSec: 600,
      durationSec: 620,
      countedPlay: true,
    }],
  })

  assert.deepEqual((await repo.getConnections()).map(item => item.connectionId), ['conn_1'])
  assert.deepEqual((await repo.getImportRules()).map(item => item.ruleId), ['rule_1'])
  assert.equal(await repo.getCredential('old_cred'), null)
  assert.equal(await repo.getImportSnapshot('old_rule'), null)
  assert.equal(await repo.getSyncSnapshot('old_rule'), null)
  assert.equal((await repo.getSyncSnapshot('rule_1')).items[0].sourceStableKey, 'onedrive::item_1')
  assert.deepEqual(await repo.getSourceItems('old_conn'), [])
  assert.deepEqual((await repo.getAggregateSongs()).map(item => item.aggregateSongId), ['agg_1'])
  assert.deepEqual(await repo.getPlayStats(), [{
    aggregateSongId: 'agg_1',
    lastSourceItemId: 'item_1',
    playCount: 5,
    playDurationTotalSec: 600,
    lastPlayedAt: 200,
  }])
  assert.deepEqual(await repo.getPlayHistory(), [{
    aggregateSongId: 'agg_1',
    sourceItemId: 'item_1',
    startedAt: 150,
    endedAt: 200,
    listenedSec: 600,
    durationSec: 620,
    countedPlay: true,
  }])
})

test('backup page exposes all-data import and export for list plus media source data', () => {
  const partFile = readFile('src/screens/Home/Views/Setting/settings/Backup/Part.tsx')
  const actionsFile = readFile('src/screens/Home/Views/Setting/settings/Backup/actions.ts')
  const zhCnFile = readFile('src/lang/zh-cn.json')

  assert.match(partFile, /AllDataImportExport/)
  assert.match(partFile, /setting_backup_all/)
  assert.match(actionsFile, /allData_v3/)
  assert.match(actionsFile, /createMediaSourceBackupPayload/)
  assert.match(actionsFile, /restoreMediaSourceBackupPayload/)
  assert.match(zhCnFile, /"setting_backup_all": "所有数据（列表数据与媒体来源数据）"/)
  assert.match(zhCnFile, /"list_import_tip__alldata": "这是一个「所有数据」备份文件，你需要去这里导入：\\n\\n设置 → 备份与恢复 → 所有数据 → 导入"/)
})
