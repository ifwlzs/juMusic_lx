const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const repoRoot = path.resolve(__dirname, '../..')
const rescanModulePath = path.join(repoRoot, 'src/core/mediaLibrary/musicDetailRescan.ts')
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8')

// 中文注释：直接转译并执行重新扫描规则定位纯函数，避免只靠源码字符串导致行为未被验证。
const loadRescanModule = () => {
  const source = fs.readFileSync(rescanModulePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: rescanModulePath,
  }).outputText

  const mod = new Module(rescanModulePath, module)
  mod.filename = rescanModulePath
  mod.paths = Module._nodeModulePaths(path.dirname(rescanModulePath))
  mod.require = request => {
    throw new Error(`Unexpected dependency while loading music detail rescan module: ${request}`)
  }
  mod._compile(transpiled, rescanModulePath)
  return mod.exports
}

const createRule = ({
  ruleId = 'rule_1',
  connectionId = 'conn_1',
  mode = 'merged',
  directories = [],
  tracks = [],
} = {}) => ({
  ruleId,
  connectionId,
  name: ruleId,
  mode,
  directories: directories.map((pathOrUri, index) => ({
    selectionId: `${ruleId}_dir_${index}`,
    kind: 'directory',
    pathOrUri,
    displayName: path.basename(pathOrUri),
  })),
  tracks: tracks.map((pathOrUri, index) => ({
    selectionId: `${ruleId}_track_${index}`,
    kind: 'track',
    pathOrUri,
    displayName: path.basename(pathOrUri),
  })),
})

const createMediaLibrary = (remotePathOrUri, connectionId = 'conn_1') => ({
  connectionId,
  sourceItemId: `${connectionId}__${remotePathOrUri}`,
  aggregateSongId: 'agg_1',
  providerType: 'webdav',
  remotePathOrUri,
  versionToken: 'v1',
})

const createGeneratedList = (id, connectionId, ruleId) => ({
  id,
  name: id,
  locationUpdateTime: null,
  mediaSource: {
    generated: true,
    readOnly: true,
    connectionId,
    ruleId,
    kind: 'rule_merged',
  },
})

test('重新扫描规则覆盖判断支持目录、散选歌曲和不匹配路径', () => {
  const { isSourcePathCoveredByRule } = loadRescanModule()

  assert.equal(isSourcePathCoveredByRule('/Albums/A/song.flac', createRule({ directories: ['/Albums/A'] })), true)
  assert.equal(isSourcePathCoveredByRule('/Singles/song.flac', createRule({ tracks: ['/Singles/song.flac'] })), true)
  assert.equal(
    isSourcePathCoveredByRule('/Other/song.flac', createRule({ directories: ['/Albums/A'], tracks: ['/Singles/song.flac'] })),
    false,
  )
})

test('重新扫描规则覆盖判断支持根目录导入规则', () => {
  const { isSourcePathCoveredByRule } = loadRescanModule()

  assert.equal(isSourcePathCoveredByRule('/song.flac', createRule({ directories: ['/'] })), true)
})

test('重新扫描规则定位优先使用当前生成列表规则且要求覆盖当前路径', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()

  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac'),
    sourceListId: 'list-current',
    lists: [createGeneratedList('list-current', 'conn_1', 'rule_2')],
    rules: [
      createRule({ ruleId: 'rule_1', directories: ['/Albums'] }),
      createRule({ ruleId: 'rule_2', directories: ['/Albums/A'] }),
    ],
  })

  assert.equal(selected.ruleId, 'rule_2')
})

test('当前生成列表规则不覆盖时回退到覆盖当前路径的规则', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()

  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac'),
    sourceListId: 'list-current',
    lists: [createGeneratedList('list-current', 'conn_1', 'rule_2')],
    rules: [
      createRule({ ruleId: 'rule_1', directories: ['/Albums'] }),
      createRule({ ruleId: 'rule_2', directories: ['/Other'] }),
    ],
  })

  assert.equal(selected.ruleId, 'rule_1')
})

test('重新扫描规则定位只允许当前媒体库连接内的规则命中', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()

  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac', 'conn_1'),
    sourceListId: null,
    lists: [],
    rules: [
      createRule({ ruleId: 'rule_other_conn', connectionId: 'conn_2', directories: ['/Albums'] }),
      createRule({ ruleId: 'rule_current_conn', connectionId: 'conn_1', directories: ['/Albums/A'] }),
    ],
  })

  assert.equal(selected.ruleId, 'rule_current_conn')
})

test('找不到覆盖规则时返回 null', () => {
  const { findMusicDetailRescanRule } = loadRescanModule()

  const selected = findMusicDetailRescanRule({
    mediaLibrary: createMediaLibrary('/Albums/A/song.flac'),
    sourceListId: null,
    lists: [],
    rules: [createRule({ ruleId: 'rule_1', directories: ['/Other'] })],
  })

  assert.equal(selected, null)
})

test('歌曲详情页接入重新扫描当前歌曲且仅提交增量后台任务', () => {
  const source = read('src/screens/MusicDetailPage/index.tsx')

  assert.match(source, /sourceListId/)
  assert.match(source, /useMyList/)
  assert.match(source, /findMusicDetailRescanRule/)
  assert.match(source, /enqueueImportRuleSyncJob/)
  assert.match(source, /mediaLibraryRepository\.getImportRules/)
  assert.match(source, /syncMode:\s*'incremental'/)
  assert.match(source, /triggerSource:\s*'manual'/)
  assert.match(source, /previousRule:\s*rule/)
  assert.match(source, /isRescanSubmitting/)
  assert.match(source, /music_detail_rescan_current_song/)
  assert.match(source, /music_detail_rescan_current_song_queued/)
  assert.match(source, /music_detail_rescan_current_song_no_rule/)
  assert.match(source, /music_detail_rescan_current_song_failed/)
  assert.doesNotMatch(source, /syncMode:\s*'full_validation'/)
  assert.doesNotMatch(source, /removeCaches|saveCaches/)
})

test('三种语言补齐重新扫描当前歌曲文案', () => {
  const requiredKeys = [
    'music_detail_rescan_current_song',
    'music_detail_rescan_current_song_submitting',
    'music_detail_rescan_current_song_queued',
    'music_detail_rescan_current_song_no_rule',
    'music_detail_rescan_current_song_failed',
  ]

  for (const lang of ['zh-cn', 'zh-tw', 'en-us']) {
    const messages = JSON.parse(read(`src/lang/${lang}.json`))
    for (const key of requiredKeys) {
      assert.equal(typeof messages[key], 'string', `${lang} 缺少 ${key}`)
      assert.notEqual(messages[key].trim(), '', `${lang} 的 ${key} 不能为空`)
    }
  }
})

test('待办和 changelog 记录重新扫描已落地且来源切换仍待做', () => {
  const todolist = read('docs/todo/todolist.md')
  const changelog = read('CHANGELOG.md')

  assert.match(todolist, /\[x\] 重新扫描/)
  assert.match(todolist, /当前媒体库歌曲所属导入规则的增量重新扫描/)
  assert.match(todolist, /\[ \] 来源切换/)
  assert.match(changelog, /歌曲详情页新增“重新扫描当前歌曲”/)
})
