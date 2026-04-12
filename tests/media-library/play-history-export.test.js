const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const {
  resolvePlayHistoryExportRange,
  buildPlayHistoryExportPayload,
  buildPlayHistoryExportFileName,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/playHistoryExport.js')

test('resolvePlayHistoryExportRange 支持全部、今年、最近30天与自定义日期', () => {
  const now = new Date(2026, 3, 12, 15, 30, 45, 123).getTime()

  assert.deepEqual(resolvePlayHistoryExportRange({ preset: 'all' }, now), {
    preset: 'all',
    start: null,
    end: null,
  })

  assert.deepEqual(resolvePlayHistoryExportRange({ preset: 'year' }, now), {
    preset: 'year',
    start: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
    end: new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
  })

  assert.deepEqual(resolvePlayHistoryExportRange({ preset: 'last30Days' }, now), {
    preset: 'last30Days',
    start: new Date(2026, 2, 14, 0, 0, 0, 0).getTime(),
    end: new Date(2026, 3, 12, 23, 59, 59, 999).getTime(),
  })

  assert.deepEqual(resolvePlayHistoryExportRange({
    preset: 'custom',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  }, now), {
    preset: 'custom',
    start: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
    end: new Date(2026, 2, 31, 23, 59, 59, 999).getTime(),
  })
})

test('buildPlayHistoryExportPayload 按 startedAt 过滤历史并展开歌曲信息', () => {
  const payload = buildPlayHistoryExportPayload({
    exportedAt: 2000,
    timezone: 'Asia/Shanghai',
    range: {
      preset: 'custom',
      start: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
      end: new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
    },
    playHistory: [
      {
        aggregateSongId: 'agg_out',
        sourceItemId: 'item_out',
        startedAt: new Date(2025, 11, 31, 23, 59, 59, 0).getTime(),
        endedAt: new Date(2026, 0, 1, 0, 1, 0, 0).getTime(),
        listenedSec: 60,
        durationSec: 180,
        countedPlay: false,
      },
      {
        aggregateSongId: 'agg_1',
        sourceItemId: 'item_1',
        startedAt: new Date(2026, 1, 14, 8, 0, 0, 0).getTime(),
        endedAt: new Date(2026, 1, 14, 8, 3, 0, 0).getTime(),
        listenedSec: 180,
        durationSec: 240,
        countedPlay: true,
      },
    ],
    aggregateSongs: [{
      aggregateSongId: 'agg_1',
      canonicalTitle: 'Song',
      canonicalArtist: 'Singer',
      canonicalAlbum: 'Album',
      canonicalDurationSec: 240,
      preferredSourceItemId: 'item_1',
      sourceCount: 1,
      preferredSource: 'webdav',
      sourceItemIds: ['item_1'],
    }],
    sourceItems: [{
      sourceItemId: 'item_1',
      connectionId: 'conn_1',
      providerType: 'webdav',
      pathOrUri: '/Music/song.mp3',
      fileName: 'song.mp3',
      versionToken: 'v1',
    }],
  })

  assert.equal(payload.type, 'playHistoryExport_v1')
  assert.equal(payload.exportedAt, 2000)
  assert.equal(payload.timezone, 'Asia/Shanghai')
  assert.equal(payload.count, 1)
  assert.deepEqual(payload.items, [{
    aggregateSongId: 'agg_1',
    sourceItemId: 'item_1',
    startedAt: new Date(2026, 1, 14, 8, 0, 0, 0).getTime(),
    endedAt: new Date(2026, 1, 14, 8, 3, 0, 0).getTime(),
    listenedSec: 180,
    durationSec: 240,
    countedPlay: true,
    song: {
      title: 'Song',
      artist: 'Singer',
      album: 'Album',
      canonicalDurationSec: 240,
      providerType: 'webdav',
      pathOrUri: '/Music/song.mp3',
      fileName: 'song.mp3',
    },
  }])
})

test('buildPlayHistoryExportFileName 为全部和自定义范围生成稳定文件名', () => {
  assert.equal(buildPlayHistoryExportFileName({ preset: 'all', start: null, end: null }), 'lx_play_history_all.json')
  assert.equal(buildPlayHistoryExportFileName({
    preset: 'custom',
    start: new Date(2026, 0, 1, 0, 0, 0, 0).getTime(),
    end: new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
  }), 'lx_play_history_2026-01-01_2026-12-31.json')
})

test('备份页暴露播放历史导出入口与导出组件接线', () => {
  const partFile = readFile('src/screens/Home/Views/Setting/settings/Backup/Part.tsx')
  const actionsFile = readFile('src/screens/Home/Views/Setting/settings/Backup/actions.ts')
  const zhCnFile = readFile('src/lang/zh-cn.json')

  assert.match(partFile, /PlayHistoryExport/)
  assert.match(partFile, /setting_backup_play_history/)
  assert.match(partFile, /setting_backup_play_history_export_json/)
  assert.match(actionsFile, /handleExportPlayHistoryJson/)
  assert.match(actionsFile, /writeFile\(/)
  assert.match(actionsFile, /buildPlayHistoryExportPayload/)
  assert.match(zhCnFile, /"setting_backup_play_history": "播放历史"/)
  assert.match(zhCnFile, /"setting_backup_play_history_export_json": "导出 JSON"/)
  assert.match(zhCnFile, /"setting_backup_play_history_range_title": "导出范围"/)
})
