const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('job queue integration forwards conflict mode and job control into remote sync execution', () => {
  const jobQueueFile = readFile('src/core/mediaLibrary/jobQueue.ts')
  const importSyncFile = readFile('src/core/mediaLibrary/importSync.js')

  assert.match(jobQueueFile, /async runImportRuleJob\(job: LX\.MediaLibrary\.ImportJob, jobControl\)/)
  assert.match(jobQueueFile, /jobControl,/)
  assert.match(jobQueueFile, /conflictMode\?: LX\.MediaLibrary\.ImportJobConflictMode/)
  assert.match(jobQueueFile, /conflictMode,/)
  assert.match(importSyncFile, /jobControl = null/)
  assert.match(importSyncFile, /jobControl,/)
})

test('media source manager offers explicit scan conflict choices and renders paused state copy', () => {
  const managerFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')
  const ruleListFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx')
  const accountListFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx')
  const zhCn = JSON.parse(readFile('src/lang/zh-cn.json'))
  const enUs = JSON.parse(readFile('src/lang/en-us.json'))

  assert.match(managerFile, /media_source_conflict_title/)
  assert.match(managerFile, /media_source_conflict_continue/)
  assert.match(managerFile, /media_source_conflict_current_first/)
  assert.match(managerFile, /job\.type === 'import_rule_sync'/)
  assert.match(ruleListFile, /media_source_sync_summary_paused/)
  assert.match(accountListFile, /media_source_sync_summary_paused/)
  assert.equal(zhCn.media_source_sync_state_paused, '已暂停')
  assert.equal(zhCn.media_source_sync_summary_paused, '等待恢复')
  assert.equal(enUs.media_source_sync_state_paused, 'Paused')
  assert.equal(enUs.media_source_sync_summary_paused, 'Waiting to resume')
})

test('user-facing onedrive shorthand is OD in lightweight source labels', () => {
  const zhCn = JSON.parse(readFile('src/lang/zh-cn.json'))
  const zhTw = JSON.parse(readFile('src/lang/zh-tw.json'))
  const enUs = JSON.parse(readFile('src/lang/en-us.json'))

  assert.equal(zhCn.source_real_onedrive, 'OD')
  assert.equal(zhTw.source_real_onedrive, 'OD')
  assert.equal(enUs.source_real_onedrive, 'OD')
})
