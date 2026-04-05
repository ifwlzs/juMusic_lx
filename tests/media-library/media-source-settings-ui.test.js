const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('Basic settings mounts MediaSources subsection', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/index.tsx')
  assert.match(file, /MediaSources/)
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

test('Rule save and delete enqueue background jobs instead of blocking the modal', () => {
  const file = readFile('src/screens/Home/Views/Setting/settings/Basic/MediaSourceManagerModal/index.tsx')

  assert.match(file, /enqueueImportRuleSyncJob\(/)
  assert.match(file, /enqueueDeleteImportRuleJob\(/)
  assert.match(file, /media_source_job_queued/)
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
