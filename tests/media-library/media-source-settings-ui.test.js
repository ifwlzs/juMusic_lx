const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('Basic settings mounts MediaSources subsection', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/index.tsx')
  assert.match(file, /MediaSources/)
})

test('MediaSources settings page reserves a dedicated OneDrive business auth entry', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSources.tsx')

  assert.match(file, /setting_media_sources_onedrive_title/)
  assert.match(file, /setting_media_sources_onedrive_sign_in/)
  assert.match(file, /setting_media_sources_onedrive_sign_out/)
  assert.match(file, /setting_media_sources_onedrive_ready_to_import/)
})

test('Media source connection form exposes an onedrive provider option', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx')

  assert.match(file, /\['local', 'webdav', 'smb', 'onedrive'\]/)
  assert.match(file, /getOneDriveBusinessAccount/)
  assert.match(file, /form\.providerType !== 'onedrive' \?/)
})

test('Media source manager exposes account and rule actions', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')
  assert.match(file, /AccountList/)
  assert.match(file, /ImportRuleEditor/)
  assert.match(file, /DirectoryBrowser/)
  assert.match(file, /enqueueImportRuleSyncJob/)
  assert.match(file, /enqueueDeleteImportRuleJob/)
  assert.match(file, /deleteMediaConnection/)
})

test('Account and rule cards expose manual update and delete actions', () => {
  const accountFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx')
  const ruleFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx')

  assert.match(accountFile, /onUpdate/)
  assert.match(accountFile, /onDelete/)
  assert.match(accountFile, /media_source_update/)
  assert.match(accountFile, /media_source_delete_account/)

  assert.match(ruleFile, /onUpdateRule/)
  assert.match(ruleFile, /onDeleteRule/)
  assert.match(ruleFile, /media_source_update/)
  assert.match(ruleFile, /media_source_delete_rule/)
})

test('Account card metadata uses explicit readable text color for provider and root path', () => {
  const accountFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx')

  assert.match(accountFile, /useTheme/)
  assert.match(accountFile, /<Text size=\{12\} style=\{styles\.meta\} color=\{theme\['c-font'\]\}>/)
})

test('Rule save and delete enqueue background jobs instead of blocking the modal', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')

  assert.match(file, /enqueueImportRuleSyncJob\(/)
  assert.match(file, /enqueueDeleteImportRuleJob\(/)
  assert.match(file, /media_source_job_queued/)
})

test('Account update queues rule sync jobs before falling back to direct rebuilds', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')

  assert.match(file, /const connectionRules = rules\.filter\(rule => rule\.connectionId === connection\.connectionId\)/)
  assert.match(file, /await Promise\.all\(connectionRules\.map\(async rule => enqueueImportRuleSyncJob\(/)
  assert.match(file, /toast\(t\('media_source_job_queued'\)\)/)
})

test('Connection and rule editors use theme-aware inputs with visible active states', () => {
  const connectionFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx')
  const ruleFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx')

  assert.match(connectionFile, /useTheme/)
  assert.match(connectionFile, /placeholderTextColor=\{theme\['c-primary-dark-100-alpha-600'\]\}/)
  assert.doesNotMatch(connectionFile, /color:\s*'#ffffff'/)
  assert.match(connectionFile, /theme\['c-primary-background-active'\]|theme\['c-primary-font-active'\]/)

  assert.match(ruleFile, /useTheme/)
  assert.match(ruleFile, /placeholderTextColor=\{theme\['c-primary-dark-100-alpha-600'\]\}/)
  assert.doesNotMatch(ruleFile, /color:\s*'#ffffff'/)
  assert.match(ruleFile, /theme\['c-primary-background-active'\]|theme\['c-primary-font-active'\]/)
})

test('Connection form requires explicit validation before saving provider changes', () => {
  const connectionFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx')

  assert.match(connectionFile, /createConnectionDraftValidationKey/)
  assert.match(connectionFile, /media_source_validate_connection/)
  assert.match(connectionFile, /const canSubmit = currentValidationKey === validatedKey/)
  assert.match(connectionFile, /<Button onPress=\{\(\) => \{ void handleValidate\(\) \}\}>/)
  assert.match(connectionFile, /<Button onPress=\{\(\) => \{ onSubmit\(form\) \}\} disabled=\{!canSubmit\}>/)
})

test('Media source account and rule cards show sync summaries, timestamps, and generated playlist counts', () => {
  const accountFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/AccountList.tsx')
  const ruleFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/RuleList.tsx')

  assert.match(accountFile, /dateFormat2/)
  assert.match(accountFile, /media_source_last_update/)
  assert.match(accountFile, /media_source_last_status/)
  assert.match(accountFile, /media_source_generated_list_count/)
  assert.match(accountFile, /connection\.lastScanAt/)
  assert.match(accountFile, /connection\.lastScanStatus/)
  assert.match(accountFile, /generatedListCountMap/)

  assert.match(ruleFile, /dateFormat2/)
  assert.match(ruleFile, /media_source_last_update/)
  assert.match(ruleFile, /media_source_generated_list_count/)
  assert.match(ruleFile, /rule\.generatedListIds\?\.length/)
  assert.match(ruleFile, /rule\.lastSyncAt/)
})

test('Media source forms and browsers constrain long text and allow scrolling', () => {
  const connectionFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ConnectionForm.tsx')
  const ruleFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/ImportRuleEditor.tsx')
  const browserFile = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/DirectoryBrowser.tsx')

  assert.match(connectionFile, /ScrollView/)
  assert.match(ruleFile, /numberOfLines=\{1\}|numberOfLines=\{2\}/)
  assert.match(ruleFile, /flexShrink:\s*1|minWidth:\s*0/)
  assert.match(browserFile, /numberOfLines=\{1\}|numberOfLines=\{2\}/)
  assert.match(browserFile, /flexShrink:\s*1|minWidth:\s*0/)
})

test('Generated media playlists expose source-rule and immediate-update actions from mylist header', () => {
  const mylistFile = readFile('src/screens/Home/Views/Mylist/index.tsx')
  const activeListFile = readFile('src/screens/Home/Views/Mylist/MusicList/ActiveList.tsx')

  assert.match(mylistFile, /MediaSourceManagerModal/)
  assert.match(mylistFile, /modalRef\.current\?\.show\(/)
  assert.match(activeListFile, /media_source_view_rule/)
  assert.match(activeListFile, /media_source_update/)
  assert.match(activeListFile, /onOpenMediaSourceManager/)
  assert.match(activeListFile, /enqueueImportRuleSyncJob/)
})
