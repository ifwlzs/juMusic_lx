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
const musicDetailModalPath = path.resolve(__dirname, '../../src/components/MusicDetailModal/index.tsx')

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

// 详情弹窗测试需要一个极小的 hooks/JSX 运行时，才能在不引入真实 React Native 环境的前提下执行 show -> render -> 点击复制链路。
let currentMusicDetailModalTestRuntime = null

const getMusicDetailModalTestRuntime = () => {
  assert.ok(currentMusicDetailModalTestRuntime, 'MusicDetailModal 测试运行时尚未初始化')
  return currentMusicDetailModalTestRuntime
}

// 统一把 JSX children 归一化为数组，方便后续遍历按钮与提取文本。
const normalizeRenderedChildren = children => {
  if (children === null || children === undefined || children === false) return []
  if (Array.isArray(children)) return children.flatMap(normalizeRenderedChildren)
  return [children]
}

// 递归把简化 JSX 树展开为可遍历结构，函数组件会在这里被执行成宿主节点。
const resolveRenderedNode = node => {
  if (node === null || node === undefined || node === false) return null
  if (Array.isArray(node)) return node.map(resolveRenderedNode).flat().filter(item => item !== null)
  if (typeof node !== 'object') return node
  if (typeof node.type === 'function') return resolveRenderedNode(node.type(node.props ?? {}))
  const props = { ...(node.props ?? {}) }
  props.children = normalizeRenderedChildren(props.children).map(resolveRenderedNode).flat().filter(item => item !== null)
  return { type: node.type, props }
}

// 把已渲染节点拍平成列表，便于按组件类型查找复制按钮。
const flattenRenderedNodes = node => {
  if (node === null || node === undefined) return []
  if (Array.isArray(node)) return node.flatMap(flattenRenderedNodes)
  if (typeof node !== 'object') return []
  return [node, ...normalizeRenderedChildren(node.props?.children).flatMap(flattenRenderedNodes)]
}

// 提取节点里的纯文本内容，用于按按钮文案定位具体复制动作。
const collectRenderedText = node => {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map(collectRenderedText).join('')
  if (typeof node !== 'object') return String(node)
  return normalizeRenderedChildren(node.props?.children).map(collectRenderedText).join('')
}

// 构造最小测试渲染器：支持 hooks 状态、imperative ref、requestAnimationFrame 队列与树查询。
const createMusicDetailModalTestRenderer = component => {
  const hookStates = []
  const ref = { current: null }
  const dialogVisibilityCalls = []
  const rafQueue = []
  const previousRuntime = currentMusicDetailModalTestRuntime
  const previousRequestAnimationFrame = global.requestAnimationFrame
  let hookIndex = 0
  let tree = null

  const isSameDeps = (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right)) return left === right
    if (left.length !== right.length) return false
    return left.every((value, index) => Object.is(value, right[index]))
  }

  const runtime = {
    createElement(type, props = {}, key) {
      return key === undefined ? { type, props } : { type, props: { ...props, key } }
    },
    createHostNode(type, props = {}) {
      if (type === 'Dialog' && props.ref && typeof props.ref === 'object') {
        props.ref.current = {
          setVisible: value => {
            dialogVisibilityCalls.push(value)
          },
        }
      }
      return { type, props }
    },
    useCallback(fn, deps) {
      return runtime.useMemo(() => fn, deps)
    },
    useImperativeHandle(targetRef, create, deps) {
      const stateIndex = hookIndex++
      const previous = hookStates[stateIndex]
      if (!previous || !isSameDeps(previous.deps, deps)) {
        if (targetRef && typeof targetRef === 'object') targetRef.current = create()
        hookStates[stateIndex] = { deps: Array.isArray(deps) ? [...deps] : deps }
      }
    },
    useMemo(factory, deps) {
      const stateIndex = hookIndex++
      const previous = hookStates[stateIndex]
      if (previous && isSameDeps(previous.deps, deps)) return previous.value
      const value = factory()
      hookStates[stateIndex] = {
        deps: Array.isArray(deps) ? [...deps] : deps,
        value,
      }
      return value
    },
    useRef(initialValue) {
      const stateIndex = hookIndex++
      if (!(stateIndex in hookStates)) hookStates[stateIndex] = { current: initialValue }
      return hookStates[stateIndex]
    },
    useState(initialValue) {
      const stateIndex = hookIndex++
      if (!(stateIndex in hookStates)) {
        hookStates[stateIndex] = typeof initialValue === 'function' ? initialValue() : initialValue
      }
      return [
        hookStates[stateIndex],
        nextValue => {
          hookStates[stateIndex] = typeof nextValue === 'function'
            ? nextValue(hookStates[stateIndex])
            : nextValue
        },
      ]
    },
  }

  const rerender = () => {
    currentMusicDetailModalTestRuntime = runtime
    hookIndex = 0
    tree = resolveRenderedNode(component({}, ref))
    return tree
  }

  global.requestAnimationFrame = callback => {
    rafQueue.push(callback)
    return rafQueue.length
  }

  const flushAnimationFrames = () => {
    while (rafQueue.length) {
      const callback = rafQueue.shift()
      callback?.()
    }
  }

  const cleanup = () => {
    currentMusicDetailModalTestRuntime = previousRuntime
    if (previousRequestAnimationFrame === undefined) {
      delete global.requestAnimationFrame
      return
    }
    global.requestAnimationFrame = previousRequestAnimationFrame
  }

  rerender()

  return {
    ref,
    rerender,
    cleanup,
    flushAnimationFrames,
    getTree: () => tree,
    getDialogVisibilityCalls: () => [...dialogVisibilityCalls],
    collectText: collectRenderedText,
    findAllByType: type => flattenRenderedNodes(tree).filter(node => node.type === type),
    findButtonByText: text => flattenRenderedNodes(tree).find(node => node.type === 'Button' && collectRenderedText(node) === text),
  }
}

// 通过最小依赖桩加载详情弹窗模块，既保留转译 smoke test，又允许测试里执行最小可运行的复制按钮链路。
const loadMusicDetailModalModule = ({
  translations = {},
  clipboardWriteText = () => {},
  toast = () => {},
  detailSectionsModule = loadDetailSectionsModule(),
} = {}) => {
  const source = fs.readFileSync(musicDetailModalPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: musicDetailModalPath,
  }).outputText

  const mod = new Module(musicDetailModalPath, module)
  mod.filename = musicDetailModalPath
  mod.paths = Module._nodeModulePaths(path.dirname(musicDetailModalPath))
  mod.require = request => {
    switch (request) {
      case 'react':
        return {
          forwardRef: render => render,
          useCallback: (fn, deps) => getMusicDetailModalTestRuntime().useCallback(fn, deps),
          useImperativeHandle: (targetRef, create, deps) => getMusicDetailModalTestRuntime().useImperativeHandle(targetRef, create, deps),
          useMemo: (factory, deps) => getMusicDetailModalTestRuntime().useMemo(factory, deps),
          useRef: value => getMusicDetailModalTestRuntime().useRef(value),
          useState: initial => getMusicDetailModalTestRuntime().useState(initial),
        }
      case 'react/jsx-runtime':
        return {
          jsx: (type, props, key) => getMusicDetailModalTestRuntime().createElement(type, props, key),
          jsxs: (type, props, key) => getMusicDetailModalTestRuntime().createElement(type, props, key),
          Fragment: 'Fragment',
        }
      case 'react-native':
        return {
          ScrollView: 'ScrollView',
          View: 'View',
        }
      case '@/components/common/Dialog':
        return function MockDialog(props) {
          return getMusicDetailModalTestRuntime().createHostNode('Dialog', props)
        }
      case '@/components/common/Button':
        return function MockButton(props) {
          return getMusicDetailModalTestRuntime().createHostNode('Button', props)
        }
      case '@/components/common/Text':
        return function MockText(props) {
          return getMusicDetailModalTestRuntime().createHostNode('Text', props)
        }
      case '@/lang':
        return {
          useI18n: () => key => translations[key] ?? key,
        }
      case '@/store/theme/hook':
        return {
          useTheme: () => ({
            'c-button-background': '#000',
            'c-button-font': '#fff',
          }),
        }
      case '@/utils/tools':
        return {
          clipboardWriteText,
          createStyle: styles => styles,
          toast,
        }
      case './buildDetailSections':
        return detailSectionsModule
      default:
        throw new Error(`Unexpected dependency: ${request}`)
    }
  }
  mod._compile(transpiled, musicDetailModalPath)
  mod.exports.__createTestRenderer = () => createMusicDetailModalTestRenderer(mod.exports.default)
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

test('我的列表页挂载详情弹窗并在菜单动作中优先处理应用内详情目标', () => {
  const indexFile = readFile('src/screens/Home/Views/Mylist/MusicList/index.tsx')

  // 锁定任务 4 页面接线契约：内部详情优先走弹窗，在线音源再回退到外链行为。
  assert.match(indexFile, /const musicDetailModalRef = useRef<MusicDetailModalType>\(null\)/)
  assert.match(indexFile, /if \(isInternalMusicDetailTarget\(info\.musicInfo\)\) \{[\s\S]+musicDetailModalRef\.current\?\.show\(info\.musicInfo\)/)
  assert.match(indexFile, /void handleShowMusicSourceDetail\(info\.musicInfo\)/)
  assert.match(indexFile, /<MusicDetailModal ref=\{musicDetailModalRef\} \/>/)
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

test('任务 3 详情弹窗模块可以被转译并加载导出', () => {
  const modalModule = loadMusicDetailModalModule()

  // 至少验证 TSX 组件能在最小依赖桩下完成转译与编译，避免明显的导入或语法问题只靠 grep 漏掉。
  assert.ok(modalModule)
  assert.ok(modalModule.default)
})

test('任务 3 详情弹窗会渲染四个复制按钮并接通真实复制链路', () => {
  const zhCn = JSON.parse(readFile('src/lang/zh-cn.json'))
  const { buildMusicDetailCopyText } = loadDetailSectionsModule()
  const clipboardWrites = []
  const toastMessages = []
  const modalModule = loadMusicDetailModalModule({
    translations: zhCn,
    clipboardWriteText: text => clipboardWrites.push(text),
    toast: message => toastMessages.push(message),
  })
  const renderer = modalModule.__createTestRenderer()
  const musicInfo = {
    id: 'song_modal_1',
    name: '海阔天空',
    singer: 'Beyond',
    source: 'kg',
    interval: '04:13',
    meta: {
      albumName: '乐与怒',
      filePath: '/Music/海阔天空.flac',
      ext: 'flac',
      mediaLibrary: {
        connectionId: 'conn_modal_1',
        sourceItemId: 'item_modal_1',
        aggregateSongId: 'agg_modal_1',
        providerType: 'webdav',
        remotePathOrUri: '/remote/海阔天空.flac',
        versionToken: 'v_modal_1',
        fileName: '海阔天空.flac',
        modifiedTime: 1700000000000,
      },
    },
  }

  try {
    assert.equal(typeof renderer.ref.current?.show, 'function')
    assert.equal(renderer.getTree(), null)

    renderer.ref.current.show(musicInfo)
    renderer.rerender()
    renderer.flushAnimationFrames()

    const buttons = renderer.findAllByType('Button')
    assert.equal(buttons.length, 4)

    const expectedCopyTextByLabel = new Map([
      [zhCn.music_detail_copy_name, '海阔天空'],
      [zhCn.music_detail_copy_name_with_artist, 'Beyond - 海阔天空'],
      // full 复制文本本身由任务 2 纯函数定义，这里直接复用真实摘要结果，重点验证按钮点击是否把同一份文本送进剪贴板。
      [zhCn.music_detail_copy_full, buildMusicDetailCopyText('full', musicInfo)],
      [zhCn.music_detail_copy_path, '/remote/海阔天空.flac'],
    ])

    for (const [label, expectedText] of expectedCopyTextByLabel) {
      const button = renderer.findButtonByText(label)
      assert.ok(button, `缺少复制按钮：${label}`)
      button.props.onPress()
      assert.equal(clipboardWrites.at(-1), expectedText)
      assert.equal(toastMessages.at(-1), zhCn.copy_name_tip)
    }

    assert.equal(toastMessages.length, 4)
    assert.deepEqual(renderer.getDialogVisibilityCalls(), [true])
  } finally {
    renderer.cleanup()
  }
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
  assert.equal(zhCn.music_detail_copy_name, '复制歌名')
  assert.equal(zhCn.music_detail_copy_name_with_artist, '复制歌手 - 歌名')
  assert.equal(zhCn.music_detail_copy_full, '复制完整信息')
  assert.equal(zhCn.music_detail_copy_path, '复制路径')

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
  assert.equal(zhTw.music_detail_copy_name_with_artist, '複製歌手 - 歌名')
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
  assert.equal(enUs.music_detail_copy_name_with_artist, 'Copy Artist - Name')
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
