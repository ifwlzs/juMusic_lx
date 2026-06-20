const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const repoRoot = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8')
const cacheSectionPath = path.join(repoRoot, 'src/components/MusicDetailModal/buildCacheStatusSection.ts')

// 直接转译并执行缓存状态纯函数，验证真实分组行为而不是只依赖源码 grep。
const loadCacheStatusModule = () => {
  const source = fs.readFileSync(cacheSectionPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: cacheSectionPath,
  }).outputText

  const mod = new Module(cacheSectionPath, module)
  mod.filename = cacheSectionPath
  mod.paths = Module._nodeModulePaths(path.dirname(cacheSectionPath))
  mod.require = request => {
    throw new Error(`Unexpected dependency while loading cache status section: ${request}`)
  }
  mod._compile(transpiled, cacheSectionPath)
  return mod.exports
}

const createMediaLibraryMusic = (versionToken = 'v1') => ({
  id: 'music-1',
  name: 'Song A',
  singer: 'Artist A',
  source: 'webdav',
  interval: '03:20',
  meta: {
    albumName: 'Album A',
    mediaLibrary: {
      sourceItemId: 'source-item-1',
      versionToken,
      providerType: 'webdav',
      remotePathOrUri: '/music/Song A.flac',
      fileName: 'Song A.flac',
    },
  },
})

const findItem = (section, key) => section.items.find(item => item.key === key)

test('缓存状态 section 对非媒体库歌曲不展示', () => {
  const { buildMusicDetailCacheSection } = loadCacheStatusModule()
  const section = buildMusicDetailCacheSection({
    id: 'local-1',
    name: 'Local Song',
    singer: 'Local Artist',
    source: 'local',
    interval: '02:30',
    meta: {
      filePath: 'D:/Music/Local Song.mp3',
      ext: 'mp3',
    },
  }, null)

  assert.equal(section, null)
})

test('媒体库歌曲无缓存时展示未缓存状态且不展示空缓存字段', () => {
  const { buildMusicDetailCacheSection } = loadCacheStatusModule()
  const section = buildMusicDetailCacheSection(createMediaLibraryMusic('v1'), null)

  assert.equal(section.key, 'cache')
  assert.deepEqual(section.items, [
    {
      key: 'cacheStatus',
      label: 'music_detail_cache_status',
      value: 'music_detail_cache_status_not_cached',
    },
  ])
})

test('缓存版本匹配时展示已缓存状态、来源、路径、大小和时间', () => {
  const { buildMusicDetailCacheSection } = loadCacheStatusModule()
  const section = buildMusicDetailCacheSection(createMediaLibraryMusic('v1'), {
    cacheId: 'cache-1',
    sourceItemId: 'source-item-1',
    versionToken: 'v1',
    localFilePath: '/cache/media-library/media_abc.flac',
    cachedFileSize: 2048,
    cacheOrigin: 'play',
    prefetchState: 'ready',
    createdAt: 1710000000000,
    lastAccessAt: 1710003600000,
  })

  assert.equal(findItem(section, 'cacheStatus').value, 'music_detail_cache_status_cached')
  assert.equal(findItem(section, 'cacheOrigin').value, 'music_detail_cache_origin_play')
  assert.equal(findItem(section, 'prefetchState').value, 'music_detail_cache_prefetch_state_ready')
  assert.equal(findItem(section, 'localFilePath').value, '/cache/media-library/media_abc.flac')
  assert.equal(findItem(section, 'cachedFileSize').value, '2.0 KB')
  assert.equal(typeof findItem(section, 'createdAt').value, 'string')
  assert.equal(typeof findItem(section, 'lastAccessAt').value, 'string')
})

test('缓存版本不匹配时展示缓存已过期状态', () => {
  const { buildMusicDetailCacheSection } = loadCacheStatusModule()
  const section = buildMusicDetailCacheSection(createMediaLibraryMusic('v2'), {
    cacheId: 'cache-1',
    sourceItemId: 'source-item-1',
    versionToken: 'v1',
    localFilePath: '/cache/media-library/media_abc.flac',
  })

  assert.equal(findItem(section, 'cacheStatus').value, 'music_detail_cache_status_stale')
})

test('详情分组类型允许 cache 分组', () => {
  const source = read('src/components/MusicDetailModal/buildDetailSections.ts')
  assert.match(source, /key:\s*'basic' \| 'file' \| 'media_library' \| 'status' \| 'cache'/)
})

test('歌曲详情页只读查询缓存并追加缓存分组', () => {
  const source = read('src/screens/MusicDetailPage/index.tsx')

  assert.match(source, /mediaLibraryRepository/)
  assert.match(source, /findCacheBySourceItemId/)
  assert.match(source, /buildMusicDetailCacheSection/)
  assert.match(source, /const\s+cacheSection\s*=\s*buildMusicDetailCacheSection\(musicInfo,\s*cacheEntry\)/)
  assert.match(source, /cacheSection \? \[\.\.\.baseSections, cacheSection\] : baseSections/)
  assert.doesNotMatch(source, /removeCaches|saveCaches|rescan|重新扫描|来源切换/)
})

test('三种语言补齐缓存状态详情文案', () => {
  const requiredKeys = [
    'music_detail_section_cache',
    'music_detail_cache_status',
    'music_detail_cache_status_not_cached',
    'music_detail_cache_status_cached',
    'music_detail_cache_status_stale',
    'music_detail_cache_origin',
    'music_detail_cache_origin_play',
    'music_detail_cache_origin_prefetch',
    'music_detail_cache_prefetch_state',
    'music_detail_cache_prefetch_state_queued',
    'music_detail_cache_prefetch_state_running',
    'music_detail_cache_prefetch_state_ready',
    'music_detail_cache_prefetch_state_failed',
    'music_detail_cache_path',
    'music_detail_cache_file_size',
    'music_detail_cache_created_at',
    'music_detail_cache_last_access_at',
  ]

  for (const lang of ['zh-cn', 'zh-tw', 'en-us']) {
    const messages = JSON.parse(read(`src/lang/${lang}.json`))
    for (const key of requiredKeys) {
      assert.equal(typeof messages[key], 'string', `${lang} 缺少 ${key}`)
      assert.notEqual(messages[key].trim(), '', `${lang} 的 ${key} 不能为空`)
    }
  }
})

test('待办和 changelog 记录只读缓存状态已落地且写操作仍待确认', () => {
  const todolist = read('docs/todo/todolist.md')
  const changelog = read('CHANGELOG.md')

  assert.match(todolist, /\[x\] 先展示只读缓存状态/)
  assert.match(todolist, /\[ \] 来源切换/)
  assert.match(todolist, /\[ \] 重新扫描/)
  assert.match(changelog, /歌曲详情页.*缓存状态展示/)
})
