const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

// 统一从仓库根目录读取源码文件，避免测试受执行目录影响。
const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')
const listActionPath = path.resolve(__dirname, '../../src/screens/Home/Views/Mylist/MusicList/listAction.ts')
const detailSectionsPath = path.resolve(__dirname, '../../src/components/MusicDetailModal/buildDetailSections.ts')

// 通过转译并动态加载 TS 模块，直接执行纯函数行为，避免只靠源码 grep 判断分流逻辑。
const loadListActionModule = ({ musicSdk = {}, toOldMusicInfo = info => info } = {}) => {
  const source = fs.readFileSync(listActionPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: listActionPath,
  }).outputText

  const mod = new Module(listActionPath, module)
  mod.filename = listActionPath
  mod.paths = Module._nodeModulePaths(path.dirname(listActionPath))
  mod.require = request => {
    switch (request) {
      case '@/core/list':
        return {
          addListMusics: async() => {},
          removeListMusics: async() => {},
          updateListMusicPosition: async() => {},
          updateListMusics: async() => {},
        }
      case '@/core/player/player':
        return {
          playList: async() => {},
          playListById: async() => {},
          playNext: async() => {},
        }
      case '@/core/player/tempPlayList':
        return {
          addTempPlayList: () => {},
        }
      case '@/store/setting/state':
        return {
          setting: {
            'common.shareType': 'text',
            'download.fileName': '{name}',
            'list.addMusicLocationType': 'bottom',
          },
        }
      case '@/utils':
        return {
          similar: () => 0,
          sortInsert: (target, item) => target.push(item),
          toOldMusicInfo,
        }
      case '@/utils/tools':
        return {
          confirmDialog: async() => false,
          openUrl: () => {},
          shareMusic: () => {},
          toast: () => {},
        }
      case '@/core/dislikeList':
        return {
          addDislikeInfo: async() => {},
          hasDislike: () => false,
        }
      case '@/store/player/state':
        return {
          playMusicInfo: {
            listId: '',
            musicInfo: null,
          },
        }
      case '@/store/list/state':
        return {
          allList: [],
        }
      case '@/utils/musicSdk':
        return musicSdk
      case '@/utils/listManage':
        return {
          getListMusicSync: () => [],
        }
      default:
        throw new Error(`Unexpected dependency: ${request}`)
    }
  }

  mod._compile(transpiled, listActionPath)
  return mod.exports
}

// 通过转译并动态加载纯函数模块，直接验证分组和复制文本的真实行为。
const loadDetailSectionsModule = () => {
  const source = fs.readFileSync(detailSectionsPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: detailSectionsPath,
  }).outputText

  const mod = new Module(detailSectionsPath, module)
  mod.filename = detailSectionsPath
  mod.paths = Module._nodeModulePaths(path.dirname(detailSectionsPath))
  mod.require = request => {
    throw new Error(`Unexpected dependency: ${request}`)
  }
  mod._compile(transpiled, detailSectionsPath)
  return mod.exports
}

test('媒体库歌曲详情菜单对本地和不可用歌曲不再禁用', () => {
  const menuFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx')

  assert.match(menuFile, /musicSourceDetail/)
  assert.doesNotMatch(menuFile, /musicInfo\.source == 'local' \|\| isUnavailable/)
  assert.doesNotMatch(menuFile, /disabled:\s*musicInfo\.source == 'local'/)
  assert.doesNotMatch(menuFile, /disabled:\s*.*isUnavailable/)
})

test('我的列表详情动作对在线音源走外链，对媒体库歌曲走应用内详情弹窗', () => {
  const actionFile = readFile('src/screens/Home/Views/Mylist/MusicList/listAction.ts')
  const indexFile = readFile('src/screens/Home/Views/Mylist/MusicList/index.tsx')

  assert.match(actionFile, /isInternalMusicDetailTarget/)
  assert.match(actionFile, /return !!\(musicInfo\.source == 'local' \|\| getMediaLibraryInfo\(musicInfo\)\)/)
  assert.match(actionFile, /musicSdk\[minfo\.source as LX\.OnlineSource\]\?\.getMusicDetailPageUrl/)
  assert.match(indexFile, /MusicDetailModal/)
  assert.match(indexFile, /onMusicSourceDetail=\{info => \{/)
})

test('详情分流纯函数会根据歌曲来源与 SDK 返回真实结果', () => {
  const moduleExports = loadListActionModule({
    musicSdk: {
      kg: {
        getMusicDetailPageUrl: info => `https://detail.test/${info.id}/${info.albumName ?? 'none'}`,
      },
    },
    toOldMusicInfo: info => ({
      id: info.id,
      albumName: info.meta.albumName,
    }),
  })

  // 直接执行导出的纯函数，验证任务 1 的分流契约不是只停留在源码字符串层面。
  assert.equal(moduleExports.isInternalMusicDetailTarget({ source: 'local', meta: {} }), true)
  assert.equal(moduleExports.isInternalMusicDetailTarget({ source: 'kg', meta: { mediaLibrary: { path: 'D:/Music/a.mp3' } } }), true)
  assert.equal(moduleExports.isInternalMusicDetailTarget({ source: 'kg', meta: {} }), false)
  assert.equal(
    moduleExports.getExternalMusicSourceDetailUrl({ id: '123', source: 'kg', meta: { albumName: 'album' } }),
    'https://detail.test/123/album',
  )
  assert.equal(moduleExports.getExternalMusicSourceDetailUrl({ id: '456', source: 'tx', meta: {} }), '')
})

test('媒体库歌曲详情分组和复制文本会按顺序输出并映射状态', () => {
  const {
    buildMusicDetailSections,
    buildMusicDetailCopyText,
    getMusicDetailCopyActions,
  } = loadDetailSectionsModule()

  const musicInfo = {
    id: 'song_1',
    name: '海阔天空',
    singer: 'Beyond',
    source: 'webdav',
    interval: '04:13',
    meta: {
      albumName: '乐与怒',
      filePath: '/Music/海阔天空.flac',
      ext: 'flac',
      mediaLibrary: {
        connectionId: 'conn_1',
        sourceItemId: 'item_1',
        aggregateSongId: 'agg_1',
        providerType: 'webdav',
        remotePathOrUri: '/remote/海阔天空.flac',
        versionToken: 'v_1',
        fileName: '海阔天空.flac',
        modifiedTime: 1700000000000,
        preferredSourceItemId: 'item_preferred',
        unavailableReason: 'connection_removed',
      },
    },
  }

  const sections = buildMusicDetailSections(musicInfo)
  assert.deepEqual(sections.map(section => section.key), ['basic', 'file', 'media_library', 'status'])
  assert.deepEqual(sections[0].items.map(item => item.label), [
    'music_detail_name',
    'music_detail_singer',
    'music_detail_album',
    'music_detail_interval',
    'music_detail_source',
  ])
  assert.deepEqual(sections[0].items.map(item => item.value), [
    '海阔天空',
    'Beyond',
    '乐与怒',
    '04:13',
    'source_real_webdav',
  ])

  assert.deepEqual(sections[1].items.map(item => item.key), ['path', 'fileName', 'modifiedTime', 'versionToken'])
  assert.deepEqual(sections[1].items.map(item => item.label), [
    'music_detail_path',
    'music_detail_file_name',
    'music_detail_modified_time',
    'music_detail_version_token',
  ])
  assert.deepEqual(sections[1].items.map(item => item.value), [
    '/remote/海阔天空.flac',
    '海阔天空.flac',
    '1700000000000',
    'v_1',
  ])

  const mediaLibraryValues = sections[2].items.map(item => item.value)
  assert.deepEqual(sections[2].items.map(item => item.label), [
    'music_detail_connection_id',
    'music_detail_source_item_id',
    'music_detail_aggregate_song_id',
    'music_detail_preferred_source_item_id',
    'music_detail_provider_type',
  ])
  assert.deepEqual(mediaLibraryValues, ['conn_1', 'item_1', 'agg_1', 'item_preferred', 'source_real_webdav'])

  const statusSection = sections[3]
  assert.deepEqual(statusSection.items.map(item => item.label), ['music_detail_status'])
  assert.deepEqual(statusSection.items.map(item => item.value), ['music_detail_unavailable_connection_removed'])
  assert.doesNotMatch(buildMusicDetailCopyText('full', musicInfo), /\nstatus：connection_removed(?:\n|$)/i)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /music_detail_status：music_detail_unavailable_connection_removed/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /music_detail_name：海阔天空/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /music_detail_singer：Beyond/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /music_detail_album：乐与怒/)
  assert.doesNotMatch(buildMusicDetailCopyText('full', musicInfo), /\n\s*\n/)

  assert.equal(buildMusicDetailCopyText('name', musicInfo), '海阔天空')
  assert.equal(buildMusicDetailCopyText('name_with_artist', musicInfo), 'Beyond - 海阔天空')
  assert.equal(buildMusicDetailCopyText('path', musicInfo), '/remote/海阔天空.flac')

  const actions = getMusicDetailCopyActions(musicInfo)
  assert.deepEqual(actions.map(action => action.key), ['name', 'name_with_artist', 'full', 'path'])
  assert.equal(actions.find(action => action.key === 'path').disabled, false)

  const missingPathMusicInfo = {
    ...musicInfo,
    meta: {
      ...musicInfo.meta,
      mediaLibrary: {
        ...musicInfo.meta.mediaLibrary,
        remotePathOrUri: '',
      },
    },
  }
  assert.equal(buildMusicDetailCopyText('path', missingPathMusicInfo), '')
  assert.equal(getMusicDetailCopyActions(missingPathMusicInfo).find(action => action.key === 'path').disabled, true)
})

test('媒体库歌曲详情弹窗组件通过 state 刷新当前歌曲并显示最小 Dialog', () => {
  const modalFile = readFile('src/components/MusicDetailModal/index.tsx')

  // 锁定任务 1 修复后的关键契约：show() 要先更新 state，避免重复打开时显示旧歌信息。
  assert.match(modalFile, /from '@\/components\/common\/Dialog'/)
  assert.match(modalFile, /const dialogRef = useRef<DialogType>\(null\)/)
  assert.match(modalFile, /const \[musicInfo, setMusicInfo\] = useState<LX\.Music\.MusicInfo \| null>\(null\)/)
  assert.match(modalFile, /setMusicInfo\(musicInfo\)/)
  assert.match(modalFile, /dialogRef\.current\?\.setVisible\(true\)/)
  assert.match(modalFile, /title=\{[^\n]*歌曲详情[^\n]*\}/)
  assert.match(modalFile, /musicInfo\?\.name \?\? '-'/)
  assert.match(modalFile, /musicInfo\?\.singer \?\? '-'/)
  assert.doesNotMatch(modalFile, /musicInfoRef\.current/)
})

test('任务 1 修复涉及的新增契约代码补齐中文注释', () => {
  const actionFile = readFile('src/screens/Home/Views/Mylist/MusicList/listAction.ts')
  const modalFile = readFile('src/components/MusicDetailModal/index.tsx')
  const indexFile = readFile('src/screens/Home/Views/Mylist/MusicList/index.tsx')
  const menuFile = readFile('src/screens/Home/Views/Mylist/MusicList/ListMenu.tsx')

  // 锁定本次修复要求的中文注释，避免后续回退为无说明实现。
  assert.match(actionFile, /\/\/.*媒体库/)
  assert.match(actionFile, /\/\/.*应用内详情弹窗/)
  assert.match(actionFile, /\/\/.*外链/)
  assert.match(modalFile, /\/\/.*弹窗/)
  assert.match(modalFile, /\/\/.*刷新/)
  assert.match(modalFile, /\/\/.*歌曲详情/)
  assert.match(indexFile, /\/\/.*应用内详情弹窗/)
  assert.match(indexFile, /\/\/.*外链/)
  assert.match(menuFile, /\/\/.*详情入口/)
})
