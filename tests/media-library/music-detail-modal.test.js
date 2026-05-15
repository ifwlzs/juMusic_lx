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
    source: 'kg',
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
    'music_detail_artist',
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
  assert.deepEqual(statusSection.items.map(item => item.label), ['music_detail_unavailable_reason'])
  assert.deepEqual(statusSection.items.map(item => item.value), ['music_detail_unavailable_connection_removed'])
  assert.doesNotMatch(buildMusicDetailCopyText('full', musicInfo), /\n状态：connection_removed(?:\n|$)/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /状态：连接已移除/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /歌名：海阔天空/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /歌手：Beyond/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /专辑：乐与怒/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /路径：\/remote\/海阔天空\.flac/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /来源：WebDAV/)
  assert.match(buildMusicDetailCopyText('full', musicInfo), /提供方类型：WebDAV/)
  assert.doesNotMatch(buildMusicDetailCopyText('full', musicInfo), /music_detail_/)
  assert.doesNotMatch(buildMusicDetailCopyText('full', musicInfo), /source_real_/)
  assert.doesNotMatch(buildMusicDetailCopyText('full', musicInfo), /\n\s*\n/)

  assert.equal(buildMusicDetailCopyText('name', musicInfo), '海阔天空')
  assert.equal(buildMusicDetailCopyText('name_with_artist', musicInfo), 'Beyond - 海阔天空')
  assert.equal(buildMusicDetailCopyText('path', musicInfo), '/remote/海阔天空.flac')

  const actions = getMusicDetailCopyActions(musicInfo)
  assert.deepEqual(actions, [
    { key: 'name', label: 'music_detail_copy_name', disabled: false },
    { key: 'name_with_artist', label: 'music_detail_copy_name_with_artist', disabled: false },
    { key: 'full', label: 'music_detail_copy_full', disabled: false },
    { key: 'path', label: 'music_detail_copy_path', disabled: false },
  ])

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

test('媒体库歌曲详情会覆盖 rule_removed 状态映射与中文摘要文本', () => {
  const {
    buildMusicDetailSections,
    buildMusicDetailCopyText,
  } = loadDetailSectionsModule()

  const musicInfo = {
    id: 'song_rule',
    name: '稻香',
    singer: '周杰伦',
    source: 'tx',
    interval: '03:43',
    meta: {
      albumName: '魔杰座',
      mediaLibrary: {
        connectionId: 'conn_rule',
        sourceItemId: 'item_rule',
        aggregateSongId: 'agg_rule',
        providerType: 'webdav',
        remotePathOrUri: '/remote/稻香.mp3',
        versionToken: 'v_rule',
        unavailableReason: 'rule_removed',
      },
    },
  }

  const sections = buildMusicDetailSections(musicInfo)
  const statusSection = sections.find(section => section.key === 'status')
  assert.deepEqual(statusSection.items.map(item => item.value), ['music_detail_unavailable_rule_removed'])
  assert.match(buildMusicDetailCopyText('full', musicInfo), /状态：规则已移除/)
})

test('本地歌曲详情文件分组会统一输出 path 字段并保留 ext', () => {
  const { buildMusicDetailSections, buildMusicDetailCopyText } = loadDetailSectionsModule()

  const localMusic = {
    id: 'local_1',
    name: '晴天',
    singer: '周杰伦',
    source: 'local',
    interval: '04:29',
    meta: {
      albumName: '叶惠美',
      filePath: 'D:/Music/晴天.flac',
      ext: 'flac',
    },
  }

  const sections = buildMusicDetailSections(localMusic)
  const fileSection = sections.find(section => section.key === 'file')
  assert.deepEqual(fileSection.items.map(item => item.key), ['path', 'ext'])
  assert.deepEqual(fileSection.items.map(item => item.label), ['music_detail_path', 'music_detail_ext'])
  assert.deepEqual(fileSection.items.map(item => item.value), ['D:/Music/晴天.flac', 'flac'])
  assert.match(buildMusicDetailCopyText('full', localMusic), /来源：本地/)
  assert.doesNotMatch(buildMusicDetailCopyText('full', localMusic), /source_real_/)
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

test('任务 3 详情弹窗会接入分组渲染与复制动作契约', () => {
  const modalFile = readFile('src/components/MusicDetailModal/index.tsx')

  // 锁定任务 3 的 UI 接线：弹窗要真正消费任务 2 的纯函数，并把复制动作接到剪贴板与提示文案。
  assert.match(modalFile, /from '@\/components\/common\/Dialog'/)
  assert.match(modalFile, /buildMusicDetailSections/)
  assert.match(modalFile, /getMusicDetailCopyActions/)
  assert.match(modalFile, /buildMusicDetailCopyText/)
  assert.match(modalFile, /clipboardWriteText/)
  assert.match(modalFile, /toast\(t\('copy_name_tip'\)\)/)
  assert.match(modalFile, /isTranslateValueKey/)
  assert.match(modalFile, /t\(item\.label\)/)
  assert.match(modalFile, /isTranslateValueKey\(item\.value\) \? t\(item\.value\) : item\.value/)
  assert.match(modalFile, /t\(action\.label\)/)
  assert.doesNotMatch(modalFile, /copyActionLabelKeys/)
  assert.match(modalFile, /<Dialog/)
})

test('任务 3 语言文件补齐详情弹窗文案键', () => {
  const zhCn = JSON.parse(readFile('src/lang/zh-cn.json'))
  const zhTw = JSON.parse(readFile('src/lang/zh-tw.json'))
  const enUs = JSON.parse(readFile('src/lang/en-us.json'))

  // 锁定任务 3 至少要求的标题、字段、不可用状态与复制动作文案，避免 UI 接线后缺翻译键。
  assert.equal(zhCn.music_detail_title, '歌曲详情')
  assert.ok(zhCn.music_detail_section_basic)
  assert.ok(zhCn.music_detail_section_file)
  assert.ok(zhCn.music_detail_section_media_library)
  assert.ok(zhCn.music_detail_section_status)
  assert.ok(zhCn.music_detail_name)
  assert.ok(zhCn.music_detail_artist)
  assert.ok(zhCn.music_detail_album)
  assert.ok(zhCn.music_detail_source)
  assert.equal(zhCn.music_detail_path, '路径')
  assert.ok(zhCn.music_detail_unavailable_reason)
  assert.equal(zhCn.music_detail_unavailable_rule_removed, '规则已移除')
  assert.ok(zhCn.music_detail_copy_name)
  assert.ok(zhCn.music_detail_copy_name_with_artist)
  assert.ok(zhCn.music_detail_copy_full)
  assert.ok(zhCn.music_detail_copy_path)

  assert.ok(zhTw.music_detail_title)
  assert.ok(zhTw.music_detail_section_basic)
  assert.ok(zhTw.music_detail_section_file)
  assert.ok(zhTw.music_detail_section_media_library)
  assert.ok(zhTw.music_detail_section_status)
  assert.ok(zhTw.music_detail_name)
  assert.ok(zhTw.music_detail_artist)
  assert.ok(zhTw.music_detail_album)
  assert.ok(zhTw.music_detail_source)
  assert.ok(zhTw.music_detail_path)
  assert.ok(zhTw.music_detail_unavailable_reason)
  assert.ok(zhTw.music_detail_unavailable_rule_removed)
  assert.ok(zhTw.music_detail_copy_name)
  assert.ok(zhTw.music_detail_copy_name_with_artist)
  assert.ok(zhTw.music_detail_copy_full)
  assert.ok(zhTw.music_detail_copy_path)

  assert.ok(enUs.music_detail_title)
  assert.ok(enUs.music_detail_section_basic)
  assert.ok(enUs.music_detail_section_file)
  assert.ok(enUs.music_detail_section_media_library)
  assert.ok(enUs.music_detail_section_status)
  assert.ok(enUs.music_detail_name)
  assert.ok(enUs.music_detail_artist)
  assert.ok(enUs.music_detail_album)
  assert.ok(enUs.music_detail_source)
  assert.ok(enUs.music_detail_path)
  assert.ok(enUs.music_detail_unavailable_reason)
  assert.ok(enUs.music_detail_unavailable_rule_removed)
  assert.ok(enUs.music_detail_copy_name)
  assert.ok(enUs.music_detail_copy_name_with_artist)
  assert.ok(enUs.music_detail_copy_full)
  assert.ok(enUs.music_detail_copy_path)
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
