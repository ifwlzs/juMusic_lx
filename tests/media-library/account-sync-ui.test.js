const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('backup page mounts AccountSync section', () => {
  const partFile = readFile('src/screens/Home/Views/Setting/settings/Backup/Part.tsx')

  assert.match(partFile, /import\s+AccountSync\s+from\s+'\.\/*AccountSync'/)
  assert.match(partFile, /t\('setting_backup_account_sync'\)/)
  assert.match(partFile, /<AccountSync\s*\/>/)
})

test('AccountSync UI contracts: required symbols, Dialog/Input, and i18n keys', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx')

  assert.match(file, /\bDialog\b/)
  assert.match(file, /\bInput\b/)

  assert.match(file, /loadAccountSyncState/)
  assert.match(file, /handleValidateAccountSyncProfile/)
  assert.match(file, /handleUploadAccountSync/)
  assert.match(file, /createAccountSyncValidationKey/)
  assert.match(file, /const\s+canSaveProfile\s+=/)
  assert.match(file, /disabled=\{!canSaveProfile\}/)

  assert.match(file, /setting_backup_account_sync_password_confirm/)
  assert.match(file, /setting_backup_account_sync_last_validated/)
  assert.match(file, /setting_backup_account_sync_last_upload/)
  assert.match(file, /setting_backup_account_sync_profile_name/)

  assert.match(file, /handleUploadAccountSync\([^,]+,\s*syncPassword/)
})

test('account sync i18n keys exist in zh-cn/zh-tw/en-us', () => {
  const zhCn = readFile('src/lang/zh-cn.json')
  const zhTw = readFile('src/lang/zh-tw.json')
  const enUs = readFile('src/lang/en-us.json')

  for (const content of [zhCn, zhTw, enUs]) {
    assert.match(content, /"setting_backup_account_sync"\s*:/)
    assert.match(content, /"setting_backup_account_sync_config_webdav"\s*:/)
    assert.match(content, /"setting_backup_account_sync_upload"\s*:/)
    assert.match(content, /"setting_backup_account_sync_password"\s*:/)
    assert.match(content, /"setting_backup_account_sync_password_confirm"\s*:/)
    assert.match(content, /"setting_backup_account_sync_password_desc"\s*:/)
    assert.match(content, /"setting_backup_account_sync_last_validated"\s*:/)
    assert.match(content, /"setting_backup_account_sync_last_upload"\s*:/)
    assert.match(content, /"setting_backup_account_sync_profile_name"\s*:/)
    assert.match(content, /"setting_backup_account_sync_validate_failed"\s*:/)
    assert.match(content, /"setting_backup_account_sync_error_validation_required"\s*:/)
    assert.match(content, /"setting_backup_account_sync_error_upload_failed"\s*:/)
  }
})
